const fs = require('fs');
const path = require('path');
const slugify = require('slugify');
const larkDocClient = require('../../lib/larkDocClient');
const bitableClient = require('../../lib/bitableClient');
const DocGenerator = require('../../lib/docGenerator');
const configLoader = require('../../lib/configLoader');
const OutputFormatter = require('../../lib/output');
const MarkdownToFeishu = require('../../lib/markdownToFeishu');
const { createFeishuUploadResolver } = require('../../lib/imageHandler');
const { contentHash } = require('../../lib/contentHash');

function resolveBase(cliOverride) {
    return configLoader.requireBaseToken(cliOverride);
}

function parseArgs(args) {
    const parsed = { file: null };
    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        if (!arg.startsWith('--') && !parsed.file) {
            parsed.file = arg;
        } else if (arg === '--parent' && args[i + 1]) {
            parsed.parent = args[++i];
        } else if (arg === '--to' && args[i + 1]) {
            parsed.parent = args[++i];
        } else if (arg === '--doc' && args[i + 1]) {
            parsed.doc = args[++i];
        } else if (arg === '--strategy' && args[i + 1]) {
            parsed.strategy = args[++i];
        } else if (arg === '--update-hash') {
            parsed.updateHash = true;
        } else if (arg === '--base' && args[i + 1]) {
            parsed.baseToken = args[++i];
        } else if (arg === '--manual' && args[i + 1]) {
            parsed.manualName = args[++i];
        } else if (arg === '--slug' && args[i + 1]) {
            parsed.slug = args[++i];
        } else if (arg === '--targets' && args[i + 1]) {
            parsed.targets = args[i + 1].split(',').map(t => t.trim());
            i++;
        } else if (arg === '--scaffold') {
            parsed.scaffold = true;
        } else if (arg === '--title' && args[i + 1]) {
            parsed.title = args[++i];
        } else if (arg === '--type' && args[i + 1]) {
            parsed.docType = args[++i];
        } else if (arg === '--description' && args[i + 1]) {
            parsed.description = args[++i];
        } else if (arg === '--added-since' && args[i + 1]) {
            parsed.addedSince = args[++i];
        } else if (arg === '--deprecated-since' && args[i + 1]) {
            parsed.deprecatedSince = args[++i];
        } else if (arg === '--dry-run') {
            parsed.dryRun = true;
        } else if (arg === '--json') {
            parsed.json = true;
        } else if (arg === '--help' || arg === '-h') {
            parsed.help = true;
        }
    }
    return parsed;
}

function printUsage() {
    console.log(`
Usage: docpal draft create [<file>] --parent <token> --manual <name> [options]
       docpal draft update [<file>] --doc <token> [options]

Subcommands:
  create                    Push new markdown to Feishu and register a draft (default)
  update                    Patch an existing Feishu doc with new markdown content

Common arguments:
  <file>                    Markdown file to push (reads from stdin if omitted)

Create options:
  --parent <token>          Parent wiki node token (required)
  --base <token>             Bitable app token (or set BASE_TOKEN in .env)
  --manual <name>            Manual name (auto-selected if only one)
  --slug <slug>              URL-friendly slug (auto-derived if omitted)
  --targets <list>            Comma-separated publish targets
  --scaffold                  Generate a scaffold document instead of reading a file
  --title <title>             Document title (required with --scaffold)
  --type <type>               Document type: function, class, enum, concept, guide (default: concept)
  --description <desc>         Document description
  --added-since <version>      Version the doc was added in
  --deprecated-since <ver>     Version the doc was deprecated in

Update options:
  --doc <token>              Wiki node_token or drive document_id of the existing doc (required)
  --strategy <s>             Patch strategy: replace | append | smart (default: replace)
  --manual <name>            If set, also refreshes the tblDocs registry row for this doc
  --update-hash              Recompute Content Hash in tblDocs (implied by --manual)

Shared options:
  --dry-run                  Preview without pushing
  --json                     Output as JSON
  --help, -h                 Show this help
`);
}

async function run(subcommand, args, globalArgs) {
    if (subcommand === 'update') {
        return runUpdate(args, globalArgs);
    }

    if (subcommand !== 'create' && subcommand !== 'push') {
        console.error('Unknown draft subcommand. Use: docpal draft create | docpal draft update');
        printUsage();
        process.exit(1);
    }

    const parsed = parseArgs(args);

    if (parsed.help) {
        printUsage();
        return;
    }

    const baseToken = resolveBase(parsed.baseToken);
    const fmt = new OutputFormatter(globalArgs.outputFormat || (parsed.json ? 'json' : 'text'));

    if (!parsed.parent) {
        console.error('Error: --parent is required');
        printUsage();
        process.exit(1);
    }

    const manual = await bitableClient.resolveManual(baseToken, parsed.manualName);

    let content;
    let title;

    if (parsed.scaffold) {
        if (!parsed.title) {
            console.error('Error: --title is required with --scaffold');
            printUsage();
            process.exit(1);
        }
        title = parsed.title;
        const gen = new DocGenerator({
            targets: parsed.targets || [],
            addedSince: parsed.addedSince || null,
        });
        content = gen.generate({
            title,
            slug: parsed.slug || slugify(title, { lower: true, strict: true }),
            type: parsed.docType || 'concept',
            description: parsed.description || '',
            addedSince: parsed.addedSince,
            deprecatedSince: parsed.deprecatedSince,
            targets: parsed.targets,
        });
    } else if (parsed.file) {
        if (!fs.existsSync(parsed.file)) {
            console.error(`Error: File not found: ${parsed.file}`);
            process.exit(1);
        }
        content = fs.readFileSync(parsed.file, 'utf8');
        title = path.basename(parsed.file, path.extname(parsed.file));
    } else {
        if (process.stdin.isTTY) {
            console.error('Error: No file provided and stdin is empty. Provide a file or pipe content.');
            printUsage();
            process.exit(1);
        }
        content = await readStdin();
        title = parsed.slug || 'Untitled';
    }

    const slug = parsed.slug || extractSlug(content) || slugify(title, { lower: true, strict: true });
    const feishuWebHost = configLoader.feishuWebHost;

    if (parsed.dryRun) {
        fmt.progress(`[DRY RUN] Would create Feishu doc and add to bitable`);
        fmt.render({ title, slug, parent: parsed.parent, manual: manual.fields.Name, dry_run: true });
        return;
    }

    try {
        const doc = await larkDocClient.createDocInParent(parsed.parent, title);
        const docToken = doc.document.document_id;

        // Resolve the correct web URL — wiki docs need node_token, not document_id
        const { url: docLink, nodeToken } = doc.document.node_token
            ? { url: `${feishuWebHost}/wiki/${doc.document.node_token}`, nodeToken: doc.document.node_token }
            : await larkDocClient.resolveDocUrl(docToken, feishuWebHost);

        fmt.progress(`Created Feishu doc: ${docToken}`);

        const docRecord = await bitableClient.createRecord(baseToken, 'tblDocs', {
            'Doc': { link: docLink, text: title },
            'Slug': slug,
            'Status': 'Draft',
            'Progress': 'Writing',
            'Publish Targets': parsed.targets || [],
            'Manual': [manual.record_id],
        });

        const targets = await bitableClient.listRecords(baseToken, 'tblPublishTargets');
        for (const target of targets.items || []) {
            const targetName = target.fields.Name;
            const outputPath = target.fields['Output Path'] || '';
            await bitableClient.createRecord(baseToken, 'tblDocPublishPaths', {
                'Doc': [docRecord.record.record_id],
                'Target': [target.record_id],
                'Repo Path': `${outputPath}/${slug}.mdx`,
                'Status': 'Not Published',
                'Manual': [manual.record_id],
            });
        }

        fmt.render({
            doc_token: docToken,
            node_token: nodeToken,
            slug,
            title,
            link: docLink,
            manual: manual.fields.Name,
        });

        fmt.progress(`Link: ${docLink}`);
    } catch (err) {
        console.error(`Failed to create draft: ${err.message}`);
        process.exit(1);
    }
}

async function runUpdate(args, globalArgs) {
    const parsed = parseArgs(args);

    if (parsed.help) {
        printUsage();
        return;
    }

    const fmt = new OutputFormatter(globalArgs.outputFormat || (parsed.json ? 'json' : 'text'));

    if (!parsed.doc) {
        console.error('Error: --doc is required');
        printUsage();
        process.exit(1);
    }

    const strategy = parsed.strategy || 'replace';
    if (!['replace', 'append', 'smart'].includes(strategy)) {
        console.error(`Error: --strategy must be replace, append, or smart (got: ${strategy})`);
        process.exit(1);
    }

    let content;
    if (parsed.file) {
        if (!fs.existsSync(parsed.file)) {
            console.error(`Error: File not found: ${parsed.file}`);
            process.exit(1);
        }
        content = fs.readFileSync(parsed.file, 'utf8');
    } else {
        if (process.stdin.isTTY) {
            console.error('Error: No file provided and stdin is empty. Provide a file or pipe content.');
            printUsage();
            process.exit(1);
        }
        content = await readStdin();
    }

    let documentId = parsed.doc;
    try {
        const nodeInfo = await larkDocClient.getWikiNode(parsed.doc);
        if (nodeInfo?.node?.obj_token) {
            documentId = nodeInfo.node.obj_token;
        }
    } catch {
        // Fall back to treating --doc as a drive document_id directly
    }

    if (parsed.dryRun) {
        const converter = new MarkdownToFeishu();
        const blocks = await converter.convert(content);
        fmt.progress(`[DRY RUN] Would patch ${documentId} with strategy=${strategy}`);
        fmt.render({
            documentId,
            doc_token: parsed.doc,
            strategy,
            blocks_to_apply: blocks.length,
            content_hash: contentHash(content),
            dry_run: true,
        });
        return;
    }

    try {
        const resolveImage = createFeishuUploadResolver({ uploadMedia: larkDocClient.uploadMedia.bind(larkDocClient) });
        const converter = new MarkdownToFeishu({ resolveImage });

        fmt.progress(`Patching document ${documentId} (strategy=${strategy})...`);
        const result = await converter.patchDocument({ documentId, content, strategy });

        let registryUpdate = null;
        if (parsed.manualName || parsed.updateHash) {
            const baseToken = resolveBase(parsed.baseToken);
            const allDocs = await bitableClient.listRecords(baseToken, 'tblDocs');
            const docRecord = (allDocs.items || []).find(d => {
                const docField = d.fields.Doc;
                const url = typeof docField === 'string' ? docField : (docField?.link || '');
                return url.includes(parsed.doc) || url.includes(documentId);
            });

            if (docRecord) {
                await bitableClient.updateRecord(baseToken, 'tblDocs', docRecord.record_id, {
                    'Last Modified': new Date().toISOString(),
                    'Content Hash': contentHash(content),
                    'Sync Status': 'Synced',
                });
                registryUpdate = { record_id: docRecord.record_id, slug: docRecord.fields.Slug };
            } else {
                fmt.progress('Note: no matching tblDocs record found; skipped registry update.');
            }
        }

        fmt.render({
            documentId,
            doc_token: parsed.doc,
            strategy,
            updated: result.updated || 0,
            created: result.created || 0,
            deleted: result.deleted || 0,
            registry: registryUpdate,
        });

        fmt.progress(`Patched ${documentId} (${result.updated || 0} updated, ${result.created || 0} created, ${result.deleted || 0} deleted)`);
    } catch (err) {
        console.error(`Failed to update draft: ${err.message}`);
        process.exit(1);
    }
}

function readStdin() {
    return new Promise((resolve, reject) => {
        let data = '';
        process.stdin.setEncoding('utf8');
        process.stdin.on('data', chunk => { data += chunk; });
        process.stdin.on('end', () => resolve(data));
        process.stdin.on('error', reject);
    });
}

function extractSlug(content) {
    const match = content.match(/^slug:\s*(.+)$/m);
    return match ? match[1].trim() : null;
}

module.exports = { run };
