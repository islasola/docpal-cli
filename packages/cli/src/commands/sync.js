const bitableClient = require('../../lib/bitableClient');
const larkDocClient = require('../../lib/larkDocClient');
const gitHubClient = require('../../lib/gitHubClient');
const MarkdownToFeishu = require('../../lib/markdownToFeishu');
const { createFeishuUploadResolver } = require('../../lib/imageHandler');
const { contentHash } = require('../../lib/contentHash');
const configLoader = require('../../lib/configLoader');
const OutputFormatter = require('../../lib/output');

function resolveBase(cliOverride) {
    return configLoader.requireBaseToken(cliOverride);
}

function parseArgs(args) {
    const parsed = {};
    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        if (arg === '--repo' && args[i + 1]) {
            parsed.repo = args[++i];
        } else if (arg === '--since' && args[i + 1]) {
            parsed.since = args[++i];
        } else if (arg === '--commit-range' && args[i + 1]) {
            parsed.commitRange = args[++i];
        } else if (arg === '--base' && args[i + 1]) {
            parsed.baseToken = args[++i];
        } else if (arg === '--manual' && args[i + 1]) {
            parsed.manualName = args[++i];
        } else if (arg === '--dry-run') {
            parsed.dryRun = true;
        } else if (arg === '--json') {
            parsed.json = true;
        } else if (arg === '--table') {
            parsed.table = true;
        } else if (arg === '--help' || arg === '-h') {
            parsed.help = true;
        }
    }
    return parsed;
}

function printUsage() {
    console.log(`
Usage: docpal sync pull --repo <org/repo> --since <date> --manual <name> [options]

Options:
  --repo <org/repo>          GitHub repository (required)
  --since <date>              Sync PRs merged since this date (YYYY-MM-DD) (required)
  --base <token>              Bitable app token (or set BASE_TOKEN in .env)
  --manual <name>             Manual name (auto-selected if only one)
  --commit-range <range>      Alternative to --since: sync specific commit range
  --dry-run                   Preview without syncing
  --json                      Output as JSON
  --help, -h                  Show this help
`);
}

async function run(subcommand, args, globalArgs) {
    if (subcommand !== 'pull' && subcommand !== 'back') {
        console.error('Unknown sync subcommand. Use: docpal sync pull');
        printUsage();
        process.exit(1);
    }

    const parsed = parseArgs(args);

    if (parsed.help) {
        printUsage();
        return;
    }

    const baseToken = resolveBase(parsed.baseToken);
    const fmt = new OutputFormatter(globalArgs.outputFormat || 'text');

    if (!parsed.repo || !parsed.since) {
        console.error('Error: --repo and --since are required');
        printUsage();
        process.exit(1);
    }

    const manual = parsed.manualName
        ? await bitableClient.resolveManual(baseToken, parsed.manualName)
        : null;

    try {
        fmt.progress(`Syncing merged PRs from ${parsed.repo} since ${parsed.since}`);

        const mergedPRs = await gitHubClient.listMergedPullRequests(parsed.repo, parsed.since);

        if (mergedPRs.length === 0) {
            fmt.progress('No merged PRs found since the specified date.');
            return;
        }

        fmt.progress(`Found ${mergedPRs.length} merged PRs`);

        const resolveImage = createFeishuUploadResolver({ uploadMedia: larkDocClient.uploadMedia.bind(larkDocClient) });
        const converter = new MarkdownToFeishu({ resolveImage });
        const syncResults = [];

        for (const pr of mergedPRs) {
            fmt.progress(`Processing PR #${pr.number}: ${pr.title}`);

            const files = await gitHubClient.listPullRequestFiles(parsed.repo, pr.number);
            const mdxFiles = files.filter(f => f.filename.endsWith('.mdx') || f.filename.endsWith('.md'));

            for (const file of mdxFiles) {
                fmt.progress(`  File: ${file.filename}`);
                const slug = deriveSlug(file.filename);

                const docs = await bitableClient.searchRecords(baseToken, 'tblDocs', {
                    conditions: [{ field_name: 'Slug', operator: 'is', value: [slug] }]
                });

                if (!docs.items || docs.items.length === 0) {
                    fmt.progress(`    No matching doc found for slug: ${slug}`);
                    continue;
                }

                const doc = docs.items[0];

                if (parsed.dryRun) {
                    fmt.progress(`    [DRY RUN] Would sync ${slug} to Feishu`);
                    syncResults.push({ slug, pr: pr.number, status: 'dry_run' });
                    continue;
                }

                try {
                    const fileContent = await gitHubClient.getFileContent(parsed.repo, file.filename, pr.merge_commit_sha);
                    if (!fileContent) {
                        fmt.progress(`    File was deleted in this PR`);
                        continue;
                    }

                    const docUrl = doc.fields.Doc || '';
                    const docToken = extractTokenFromUrl(docUrl);
                    if (!docToken) {
                        fmt.progress(`    Could not extract doc token from URL: ${docUrl}`);
                        continue;
                    }

                    const nodeInfo = await larkDocClient.getWikiNode(docToken);
                    const documentId = nodeInfo?.node?.obj_token || docToken;

                    const result = await converter.patchDocument({
                        documentId,
                        content: fileContent,
                    });

                    fmt.progress(`    Synced ${slug} (${result.updated} updated, ${result.created} created)`);

                    await bitableClient.updateRecord(baseToken, 'tblDocs', doc.record_id, {
                        'Last Modified': new Date().toISOString(),
                        'Content Hash': contentHash(fileContent),
                        'Sync Status': 'Synced',
                    });

                    const publishPaths = await bitableClient.searchRecords(baseToken, 'tblDocPublishPaths', {
                        conditions: [{ field_name: 'Doc', operator: 'is', value: [doc.record_id] }]
                    });

                    for (const pathRecord of publishPaths.items || []) {
                        await bitableClient.updateRecord(baseToken, 'tblDocPublishPaths', pathRecord.record_id, {
                            'Status': 'Merged',
                        });
                    }

                    const prRecords = await bitableClient.searchRecords(baseToken, 'tblPullRequests', {
                        conditions: [{ field_name: 'PR Number', operator: 'is', value: [pr.number] }]
                    });

                    for (const prRecord of prRecords.items || []) {
                        await bitableClient.updateRecord(baseToken, 'tblPullRequests', prRecord.record_id, {
                            'Status': 'Merged',
                            'Merged At': new Date().toISOString(),
                        });
                    }

                    await bitableClient.createRecord(baseToken, 'tblSyncHistory', {
                        'Action': 'Synced from GitHub',
                        'Timestamp': new Date().toISOString(),
                        'Details': `Commit: ${pr.merge_commit_sha}, PR: #${pr.number}, ${result.updated} blocks updated, ${result.created} blocks created`,
                        'Manual': manual ? [manual.record_id] : [],
                    });

                    syncResults.push({ slug, pr: pr.number, status: 'synced', updated: result.updated, created: result.created });
                } catch (err) {
                    fmt.progress(`    Failed to sync ${slug}: ${err.message}`);
                    syncResults.push({ slug, pr: pr.number, status: 'error', error: err.message });
                }
            }
        }

        fmt.render({ results: syncResults, total_prs: mergedPRs.length });
        fmt.progress('Sync pull complete.');
    } catch (err) {
        console.error(`Failed to sync pull: ${err.message}`);
        process.exit(1);
    }
}

function deriveSlug(filePath) {
    const basename = filePath.split('/').pop();
    return basename.replace(/\.(mdx|md)$/, '');
}

function extractTokenFromUrl(url) {
    if (!url) return null;
    const match = url.match(/\/wiki\/(\w+)/);
    return match ? match[1] : null;
}

module.exports = { run };