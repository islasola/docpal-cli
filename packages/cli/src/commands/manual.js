const bitableClient = require('../../lib/bitableClient');
const larkDocClient = require('../../lib/larkDocClient');
const DocScraper = require('../../lib/docScraper');
const { blocksToMdx } = require('../../lib/mdxWriter');
const { patchMdx } = require('../../lib/mdxPatcher');
const { generateFrontMatter } = require('../../lib/frontMatter');
const { createImageResolver } = require('../../lib/imageHandler');
const { buildHeadingSlugMap } = require('../../lib/larkSlugify');
const { contentHash } = require('../../lib/contentHash');
const configLoader = require('../../lib/configLoader');
const slugify = require('slugify');
const OutputFormatter = require('../../lib/output');

function resolveBase(cliOverride) {
    const token = configLoader.requireBaseToken(cliOverride);
    return token;
}

function parseArgs(args) {
    const parsed = {};
    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        if (arg === '--base' && args[i + 1]) {
            parsed.baseToken = args[++i];
        } else if (arg === '--name' && args[i + 1]) {
            parsed.name = args[++i];
        } else if (arg === '--root-type' && args[i + 1]) {
            parsed.rootType = args[++i];
        } else if (arg === '--type' && args[i + 1]) {
            parsed.rootType = args[++i];
        } else if (arg === '--root' && args[i + 1]) {
            parsed.root = args[++i];
        } else if (arg === '--from' && args[i + 1]) {
            parsed.from = args[++i];
        } else if (arg === '--default-target' && args[i + 1]) {
            parsed.defaultTarget = args[++i].split(',').map(t => t.trim());
        } else if (arg === '--targets' && args[i + 1]) {
            parsed.targets = args[++i].split(',').map(t => t.trim());
        } else if (arg === '--doc-token' && args[i + 1]) {
            parsed.docToken = args[++i];
        } else if (arg === '--doc' && args[i + 1]) {
            parsed.docToken = args[++i];
        } else if (arg === '--slug' && args[i + 1]) {
            parsed.slug = args[++i];
        } else if (arg === '--parent' && args[i + 1]) {
            parsed.parent = args[++i];
        } else if (arg === '--position' && args[i + 1]) {
            parsed.position = parseInt(args[++i], 10);
        } else if (arg === '--version' && args[i + 1]) {
            parsed.version = args[++i];
        } else if (arg === '--target' && args[i + 1]) {
            parsed.target = args[++i];
        } else if (arg === '--source-doc-token' && args[i + 1]) {
            parsed.sourceDocToken = args[++i];
        } else if (arg === '--source-doc' && args[i + 1]) {
            parsed.sourceDocToken = args[++i];
        } else if (arg === '--manual' && args[i + 1]) {
            parsed.manualName = args[++i];
        } else if (arg === '--all') {
            parsed.all = true;
        } else if (arg === '--remove') {
            parsed.remove = true;
        } else if (arg === '--dry-run') {
            parsed.dryRun = true;
        } else if (arg === '--force') {
            parsed.force = true;
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

function printManualUsage(subcommand) {
    const usages = {
        create: `
Usage: docpal manual create --name <name> --root-type <wiki|drive> --root <token> [options]

Options:
  --base <token>              Bitable app token (or set BASE_TOKEN in .env)
  --name <name>               Manual name (required)
  --root-type <wiki|drive>    Root source type (required)
  --root <token>              Wiki space ID or drive folder token (required)
  --default-target <targets>  Comma-separated default publish targets
  --dry-run                   Preview without creating
  --json                      Output as JSON
  --help, -h                  Show this help
`,
        convert: `
Usage: docpal manual convert --from <token> --name <name> --root-type <wiki|drive> [options]

Options:
  --base <token>              Bitable app token (or set BASE_TOKEN in .env)
  --from <token>              Wiki node or drive folder token to convert (required)
  --name <name>               Manual name (required)
  --root-type <wiki|drive>    Root source type (required)
  --targets <targets>         Comma-separated publish targets
  --dry-run                   Preview without converting
  --json                      Output as JSON
  --help, -h                  Show this help
`,
        add: `
Usage: docpal manual add --doc-token <token> --manual <name> [options]

Options:
  --base <token>              Bitable app token (or set BASE_TOKEN in .env)
  --doc-token <token>          Feishu doc token (required)
  --manual <name>              Manual name (auto-selected if only one)
  --slug <slug>                URL-friendly slug (auto-derived if omitted)
  --parent <token>             Parent wiki node token
  --position <n>               Sidebar position (auto-calculated if omitted)
  --dry-run                    Preview without adding
  --help, -h                   Show this help
`,
        approve: `
Usage: docpal manual approve --manual <name> --slug <slug> [options]
   or: docpal manual approve --manual <name> --all [options]

Options:
  --base <token>              Bitable app token (or set BASE_TOKEN in .env)
  --manual <name>             Manual name (auto-selected if only one)
  --slug <slug>               Doc slug to approve
  --all                       Approve all In Review/Draft docs
  --force                     Override already approved status
  --dry-run                   Preview without updating
  --json                      Output as JSON
  --help, -h                  Show this help
`,
        publish: `
Usage: docpal manual publish --manual <name> --target <target> [options]

Options:
  --base <token>               Bitable app token (or set BASE_TOKEN in .env)
  --manual <name>              Manual name (auto-selected if only one)
  --target <target>            Publish target name (required)
  --slug <slug>                Publish only a single doc
  --source-doc-token <token>   Source (English) doc token for CJK heading slug mapping
  --remove                     Remove the doc from the repo (deletion PR)
  --dry-run                    Preview without publishing
  --json                       Output as JSON
  --help, -h                   Show this help
`,
        release: `
Usage: docpal manual release --manual <name> --target <target> --version <ver> [options]

Options:
  --base <token>              Bitable app token (or set BASE_TOKEN in .env)
  --manual <name>             Manual name (auto-selected if only one)
  --target <target>            Publish target name (required)
  --version <version>          Version number, e.g., 2.4 (required)
  --source-doc-token <token>   Source (English) doc token for CJK heading slug mapping
  --dry-run                   Preview without publishing
  --json                      Output as JSON
  --help, -h                  Show this help
`,
        list: `
Usage: docpal manual list [options]

Options:
  --base <token>              Bitable app token (or set BASE_TOKEN in .env)
  --json                      Output as JSON
  --table                     Output as aligned table
  --help, -h                  Show this help
`,
        status: `
Usage: docpal manual status --manual <name> [options]

Options:
  --base <token>              Bitable app token (or set BASE_TOKEN in .env)
  --manual <name>             Manual name (auto-selected if only one)
  --json                      Output as JSON
  --table                     Output as aligned table
  --help, -h                  Show this help
`,
    };

    console.log(usages[subcommand] || `
Usage: docpal manual <subcommand> [options]

Subcommands:
  create      Create a new manual
  convert     Convert an existing wiki/drive folder to a manual
  add         Add an existing Feishu doc to a manual
  approve     Approve a doc for publishing
  publish     Publish approved docs to GitHub
  release     Publish all approved docs as a versioned snapshot
  list        List all manuals
  status      Show pipeline status of docs in a manual

Use docpal manual <subcommand> --help for more details.
`);
}

async function manualCreate(args, globalArgs) {
    if (args.help) {
        printManualUsage('create');
        return;
    }

    if (!args.name || !args.rootType || !args.root) {
        console.error('Error: --name, --root-type, and --root are required');
        printManualUsage('create');
        process.exit(1);
    }

    const baseToken = resolveBase(args.baseToken);
    const fmt = new OutputFormatter(globalArgs.outputFormat || (args.json ? 'json' : 'text'));

    fmt.progress(`Creating manual: ${args.name}`);
    fmt.progress(`Root type: ${args.rootType}, Root: ${args.root}`);

    if (args.dryRun) {
        fmt.progress('[DRY RUN] Would create manual entry in tblManuals');
        fmt.render({ name: args.name, root_type: args.rootType, root_token: args.root, dry_run: true });
        return;
    }

    try {
        const manual = await bitableClient.createRecord(baseToken, 'tblManuals', {
            'Name': args.name,
            'Root Type': args.rootType === 'wiki' ? 'Wiki Space' : 'Drive Folder',
            'Root Token': args.root,
            'Default Publish Target': args.defaultTarget || [],
        });

        fmt.render({
            name: args.name,
            root_type: args.rootType,
            root_token: args.root,
            record_id: manual.record.record_id,
        }, [
            { key: 'name', label: 'NAME' },
            { key: 'root_type', label: 'ROOT TYPE' },
            { key: 'root_token', label: 'ROOT TOKEN' },
        ]);

        fmt.progress(`Manual "${args.name}" created. Use --manual "${args.name}" with other commands.`);
    } catch (err) {
        console.error(`Failed to create manual: ${err.message}`);
        process.exit(1);
    }
}

async function manualConvert(args, globalArgs) {
    if (args.help) {
        printManualUsage('convert');
        return;
    }

    if (!args.from || !args.name || !args.rootType) {
        console.error('Error: --from, --name, and --root-type are required');
        printManualUsage('convert');
        process.exit(1);
    }

    const baseToken = resolveBase(args.baseToken);
    const fmt = new OutputFormatter(globalArgs.outputFormat || (args.json ? 'json' : 'text'));

    fmt.progress(`Converting ${args.rootType} folder to manual: ${args.name}`);
    fmt.progress(`Source: ${args.from}`);

    if (args.dryRun) {
        fmt.progress('[DRY RUN] Would scan and convert all docs from the source');
        fmt.render({ name: args.name, from: args.from, dry_run: true });
        return;
    }

    try {
        const manual = await bitableClient.createRecord(baseToken, 'tblManuals', {
            'Name': args.name,
            'Root Type': args.rootType === 'wiki' ? 'Wiki Space' : 'Drive Folder',
            'Root Token': args.from,
            'Default Publish Target': args.targets || [],
        });

        const scraper = new DocScraper({
            rootToken: args.from,
            sourceType: args.rootType,
            spaceId: process.env.SPACE_ID,
        });

        fmt.progress('Fetching document tree...');
        const { tree, sourceMap } = await scraper.fetch({ recursive: true });
        fmt.progress(`Found ${sourceMap.size} documents in the tree`);

        let registered = 0;
        for (const [token, node] of sourceMap) {
            const isDocx = node.obj_type === 'docx' || node.type === 'docx';
            if (!isDocx) continue;

            const title = node.title || node.name || '';
            const docSlug = node.slug || slugify(title, { lower: true, strict: true });
            if (!title || !docSlug) continue;

            try {
                const feishuHost = process.env.FEISHU_HOST || 'zilliverse.feishu.cn';
                await bitableClient.createRecord(baseToken, 'tblDocs', {
                    'Doc': `[${title}](https://${feishuHost}/wiki/${token})`,
                    'Slug': docSlug,
                    'Parent Token': node.parent_node_token || '',
                    'Status': 'Draft',
                    'Progress': 'Writing',
                    'Manual': [manual.record.record_id],
                });
                registered++;
            } catch (err) {
                fmt.progress(`  Failed to register ${title}: ${err.message}`);
            }
        }

        fmt.render({
            name: args.name,
            from: args.from,
            record_id: manual.record.record_id,
            registered,
            total: sourceMap.size,
        });

        fmt.progress(`Registered ${registered} documents. Conversion complete.`);
    } catch (err) {
        console.error(`Failed to convert manual: ${err.message}`);
        process.exit(1);
    }
}

async function manualAdd(args, globalArgs) {
    if (args.help) {
        printManualUsage('add');
        return;
    }

    if (!args.docToken) {
        console.error('Error: --doc-token is required');
        printManualUsage('add');
        process.exit(1);
    }

    const baseToken = resolveBase(args.baseToken);
    const fmt = new OutputFormatter(globalArgs.outputFormat || (args.json ? 'json' : 'text'));

    const manual = await bitableClient.resolveManual(baseToken, args.manualName);

    fmt.progress(`Adding doc ${args.docToken} to manual "${manual.fields.Name}"`);

    if (args.dryRun) {
        fmt.progress('[DRY RUN] Would add doc to manual');
        fmt.render({ doc_token: args.docToken, manual: manual.fields.Name, dry_run: true });
        return;
    }

    try {
        const docInfo = await larkDocClient.getDoc(args.docToken);
        const title = docInfo.document.title;
        const docSlug = args.slug || slugify(title, { lower: true, strict: true });

        const existing = await bitableClient.searchRecords(baseToken, 'tblDocs', {
            conditions: [{ field_name: 'Slug', operator: 'is', value: [docSlug] }]
        });

        if (existing.items && existing.items.length > 0 && !args.force) {
            console.error(`Error: Slug "${docSlug}" already exists. Use --force to override.`);
            process.exit(1);
        }

        const parentToken = args.parent || docInfo.document.folder_token;
        let position = args.position;
        if (!position) {
            const siblings = await bitableClient.searchRecords(baseToken, 'tblDocs', {
                conditions: [{ field_name: 'Parent Token', operator: 'is', value: [parentToken] }]
            });
            const positions = (siblings.items || [])
                .map(r => r.fields['Sidebar Position'])
                .filter(p => p !== undefined && p !== null)
                .map(p => parseInt(p, 10));
            position = positions.length > 0 ? Math.max(...positions) + 1 : 1;
        }

        const docRecord = await bitableClient.createRecord(baseToken, 'tblDocs', {
            'Doc': `[${title}](https://${process.env.FEISHU_HOST || 'zilliverse.feishu.cn'}/wiki/${args.docToken})`,
            'Slug': docSlug,
            'Parent Token': parentToken,
            'Status': 'Draft',
            'Progress': 'Writing',
            'Sidebar Position': position,
            'Manual': [manual.record_id],
        });

        const targets = await bitableClient.listRecords(baseToken, 'tblPublishTargets');
        for (const target of targets.items || []) {
            const targetName = target.fields.Name;
            const outputPath = target.fields['Output Path'] || '';
            await bitableClient.createRecord(baseToken, 'tblDocPublishPaths', {
                'Doc': [docRecord.record.record_id],
                'Target': [target.record_id],
                'Repo Path': `${outputPath}/${docSlug}.mdx`,
                'Status': 'Not Published',
                'Manual': [manual.record_id],
            });
        }

        fmt.render({
            title,
            slug: docSlug,
            position,
            doc_token: args.docToken,
            manual: manual.fields.Name,
        });

        fmt.progress(`Added "${title}" to manual "${manual.fields.Name}" (slug: ${docSlug}, position: ${position})`);
    } catch (err) {
        console.error(`Failed to add doc: ${err.message}`);
        process.exit(1);
    }
}

async function manualApprove(args, globalArgs) {
    if (args.help) {
        printManualUsage('approve');
        return;
    }

    const baseToken = resolveBase(args.baseToken);
    const fmt = new OutputFormatter(globalArgs.outputFormat || (args.json ? 'json' : 'text'));

    const manual = await bitableClient.resolveManual(baseToken, args.manualName);

    if (!args.slug && !args.all) {
        console.error('Error: Either --slug or --all is required');
        printManualUsage('approve');
        process.exit(1);
    }

    try {
        if (args.all) {
            return await approveAll(baseToken, manual, args, fmt);
        }
        return await approveSingle(baseToken, manual, args, fmt);
    } catch (err) {
        console.error(`Failed to approve: ${err.message}`);
        process.exit(1);
    }
}

async function approveSingle(baseToken, manual, args, fmt) {
    const records = await bitableClient.searchRecords(baseToken, 'tblDocs', {
        conditions: [{ field_name: 'Slug', operator: 'is', value: [args.slug] }]
    });

    if (!records.items || records.items.length === 0) {
        console.error(`Error: Doc "${args.slug}" not found in manual "${manual.fields.Name}"`);
        process.exit(1);
    }

    const record = records.items[0];
    const currentStatus = record.fields.Status;
    const docTitle = record.fields.Doc?.match(/\[([^\]]+)\]/)?.[1] || args.slug;

    if (currentStatus === 'Approved' && !args.force) {
        fmt.progress(`Warning: "${args.slug}" is already approved. Use --force to re-approve.`);
        return;
    }

    if (currentStatus === 'Published' && !args.force) {
        console.error(`Error: "${args.slug}" is already published. Use --force to re-approve.`);
        process.exit(1);
    }

    if (args.dryRun) {
        fmt.progress(`[DRY RUN] Would approve "${args.slug}" (status: ${currentStatus} → Approved)`);
        fmt.render({ slug: args.slug, previous_status: currentStatus, new_status: 'Approved', dry_run: true });
        return;
    }

    await bitableClient.updateRecord(baseToken, 'tblDocs', record.record_id, {
        'Status': 'Approved',
        'Progress': 'Ready',
        'Sync Status': 'Approved',
    });

    fmt.render({ slug: args.slug, title: docTitle, previous_status: currentStatus, new_status: 'Approved' });
    fmt.progress(`Approved "${docTitle}" for publishing`);
}

async function approveAll(baseToken, manual, args, fmt) {
    const records = await bitableClient.searchRecords(baseToken, 'tblDocs', {
        conditions: [{ field_name: 'Status', operator: 'is', value: ['In Review', 'Draft'] }]
    });

    const docs = records.items || [];
    if (docs.length === 0) {
        fmt.progress('No docs to approve (In Review or Draft).');
        return;
    }

    if (args.dryRun) {
        fmt.progress(`[DRY RUN] Would approve ${docs.length} docs`);
        fmt.render(docs.map(d => ({ slug: d.fields.Slug, previous_status: d.fields.Status })));
        return;
    }

    const approved = [];
    for (const doc of docs) {
        await bitableClient.updateRecord(baseToken, 'tblDocs', doc.record_id, {
            'Status': 'Approved',
            'Progress': 'Ready',
            'Sync Status': 'Approved',
        });
        approved.push({ slug: doc.fields.Slug, previous_status: doc.fields.Status, new_status: 'Approved' });
    }

    fmt.render({ approved, count: approved.length });
    fmt.progress(`Approved ${approved.length} docs for publishing`);
}

async function manualPublish(args, globalArgs) {
    if (args.help) {
        printManualUsage('publish');
        return;
    }

    if (!args.target) {
        console.error('Error: --target is required');
        printManualUsage('publish');
        process.exit(1);
    }

    const baseToken = resolveBase(args.baseToken);
    const fmt = new OutputFormatter(globalArgs.outputFormat || (args.json ? 'json' : 'text'));

    const manual = await bitableClient.resolveManual(baseToken, args.manualName);

    try {
        const targets = await bitableClient.searchRecords(baseToken, 'tblPublishTargets', {
            conditions: [{ field_name: 'Name', operator: 'is', value: [args.target] }]
        });

        if (!targets.items || targets.items.length === 0) {
            console.error(`Error: Publish target "${args.target}" not found`);
            process.exit(1);
        }

        const targetConfig = targets.items[0];
        const repo = targetConfig.fields.Repo;
        const baseBranch = targetConfig.fields['Base Branch'] || 'main';
        const branchPrefix = targetConfig.fields['Branch Prefix'] || 'doc-sync-';

        let filter = {
            conditions: [{ field_name: 'Status', operator: 'is', value: ['Approved'] }]
        };

        if (args.slug) {
            filter.conditions.push({ field_name: 'Slug', operator: 'is', value: [args.slug] });
        }

        const docs = await bitableClient.searchRecords(baseToken, 'tblDocs', filter);

        if (!docs.items || docs.items.length === 0) {
            fmt.progress('No approved docs to publish.');
            fmt.render({ published: [], count: 0 });
            return;
        }

        fmt.progress(`Publishing ${docs.items.length} docs to ${args.target} (${repo})`);

        if (args.dryRun) {
            fmt.render(docs.items.map(d => ({ slug: d.fields.Slug, dry_run: true })));
            return;
        }

        const imageMode = targetConfig.fields['Image Mode'] ||
            (configLoader.hasS3 ? 's3' : configLoader.hasOSS ? 'oss' : 'local');

        const resolveImage = createImageResolver({
            mode: imageMode,
            downloadFn: (fileToken) => larkDocClient.downloadMedia(fileToken),
            downloadBoardFn: (boardToken) => larkDocClient.downloadBoardPreview(boardToken),
            trimWhiteBorder: true,
        });

        const published = [];
        for (const doc of docs.items) {
            const result = await publishDoc(doc, baseToken, manual, targetConfig, {
                repo,
                baseBranch,
                branchPrefix,
                remove: args.remove,
                target: args.target,
                resolveImage,
                imageMode,
                sourceDocToken: args.sourceDocToken,
                fmt,
            });
            if (result) published.push(result);
        }

        fmt.render({ published, count: published.length });
        fmt.progress('Publish workflow complete.');
    } catch (err) {
        console.error(`Failed to publish: ${err.message}`);
        process.exit(1);
    }
}

async function publishDoc(doc, baseToken, manual, targetConfig, options) {
    const slug = doc.fields.Slug;
    const docToken = extractTokenFromUrl(doc.fields.Doc);
    const fmt = options.fmt;

    fmt.progress(`Publishing: ${slug}`);

    try {
        const publishPaths = await bitableClient.searchRecords(baseToken, 'tblDocPublishPaths', {
            conditions: [{ field_name: 'Doc', operator: 'is', value: [doc.record_id] }]
        });

        let publishPath = publishPaths.items?.[0];
        if (!publishPath) {
            fmt.progress(`  No publish path found for ${slug}`);
            return null;
        }

        const openPR = publishPath.fields['Open PR'];
        const repoPath = publishPath.fields['Repo Path'];

        const { items: blocks } = await larkDocClient.getAllBlocks(docToken);

        let headingSlugMap = null;
        if (options.sourceDocToken) {
            try {
                const { items: sourceBlocks } = await larkDocClient.getAllBlocks(options.sourceDocToken);
                headingSlugMap = buildHeadingSlugMap(sourceBlocks);
            } catch (err) {
                fmt.progress(`  Warning: Failed to fetch source doc for slug mapping: ${err.message}`);
            }
        }

        const rawMdx = await blocksToMdx(blocks, {
            resolveImage: options.resolveImage,
            target: options.target,
            headingSlugMap,
        });

        const { content: patchedMdx, valid, errors } = await patchMdx(rawMdx);
        if (!valid && errors.length > 0) {
            fmt.progress(`  MDX issues for ${slug}: ${errors.join('; ')}`);
        }

        const title = doc.fields['Sidebar Label'] || doc.fields.Doc?.match(/\[([^\]]+)\]/)?.[1] || slug;
        const frontMatter = generateFrontMatter({
            title,
            slug,
            sidebar_position: doc.fields['Sidebar Position'],
            sidebar_label: doc.fields['Sidebar Label'],
            displayed_sidebar: targetConfig.fields['Displayed Sidebar'],
            beta: doc.fields.Beta,
            keywords: doc.fields.Keywords ? doc.fields.Keywords.split(',').map(k => k.trim()) : undefined,
            added_since: doc.fields['Added Since'],
            deprecated_since: doc.fields['Deprecated Since'],
            token: docToken,
        });

        const mdxContent = frontMatter + '\n\n' + patchedMdx;

        const gitHubClient = require('../../lib/gitHubClient');
        let pr;

        if (openPR) {
            const prNumber = extractPRNumber(openPR);
            fmt.progress(`  Updating existing PR #${prNumber}`);

            const existingPR = await gitHubClient.listPullRequests(options.repo, {
                state: 'open',
                head: `${options.repo.split('/')[0]}:${publishPath.fields.Branch}`
            });

            if (existingPR.length > 0) {
                const branch = existingPR[0].head.ref;
                let fileSha = null;
                try {
                    const fileInfo = await gitHubClient.getFile(options.repo, repoPath, branch);
                    fileSha = fileInfo?.sha || null;
                } catch (err) {}

                await gitHubClient.createOrUpdateFile(
                    options.repo,
                    repoPath,
                    mdxContent,
                    `doc: update ${slug} [docpal]`,
                    branch,
                    fileSha
                );

                await gitHubClient.updatePullRequest(options.repo, prNumber, {
                    body: `Updated at ${new Date().toISOString()}\n\nOriginal doc: ${doc.fields.Doc}`
                });

                pr = existingPR[0];
            }
        } else {
            const branchName = `${options.branchPrefix}${slug}-${Date.now()}`;
            fmt.progress(`  Creating new PR from branch ${branchName}`);

            await gitHubClient.createBranch(options.repo, branchName, options.baseBranch);
            await gitHubClient.createOrUpdateFile(
                options.repo,
                repoPath,
                mdxContent,
                `doc: add/update ${slug} [docpal]`,
                branchName
            );

            pr = await gitHubClient.createPullRequest(
                options.repo,
                `doc: ${slug}`,
                branchName,
                options.baseBranch,
                `Auto-generated from Feishu doc: ${doc.fields.Doc}\n\nManual: ${manual.fields.Name}`
            );
        }

        if (pr) {
            await bitableClient.updateRecord(baseToken, 'tblDocPublishPaths', publishPath.record_id, {
                'Open PR': pr.html_url,
                'Status': 'PR Open',
                'Last Published At': new Date().toISOString(),
            });

            const prRecords = await bitableClient.searchRecords(baseToken, 'tblPullRequests', {
                conditions: [{ field_name: 'PR Number', operator: 'is', value: [pr.number] }]
            });

            const prFields = {
                'Doc': [doc.record_id],
                'Target': [targetConfig.record_id],
                'Doc Publish Path': [publishPath.record_id],
                'PR URL': pr.html_url,
                'PR Number': pr.number,
                'Branch': pr.head.ref,
                'Status': 'Open',
                'Author': 'docpal',
                'Created At': new Date().toISOString(),
                'Manual': [manual.record_id],
            };

            if (prRecords.items && prRecords.items.length > 0) {
                await bitableClient.updateRecord(baseToken, 'tblPullRequests', prRecords.items[0].record_id, prFields);
            } else {
                await bitableClient.createRecord(baseToken, 'tblPullRequests', prFields);
            }

            await bitableClient.updateRecord(baseToken, 'tblDocs', doc.record_id, {
                'Status': 'Published',
                'Sync Status': 'Published',
                'Content Hash': contentHash(mdxContent),
                'Last Published At': new Date().toISOString(),
            });

            fmt.progress(`  PR: ${pr.html_url}`);
            return { slug, pr_url: pr.html_url, pr_number: pr.number };
        }
    } catch (err) {
        fmt.progress(`  Failed to publish ${slug}: ${err.message}`);
        return null;
    }
}

async function manualRelease(args, globalArgs) {
    if (args.help) {
        printManualUsage('release');
        return;
    }

    if (!args.target || !args.version) {
        console.error('Error: --target and --version are required');
        printManualUsage('release');
        process.exit(1);
    }

    const baseToken = resolveBase(args.baseToken);
    const fmt = new OutputFormatter(globalArgs.outputFormat || (args.json ? 'json' : 'text'));

    const manual = await bitableClient.resolveManual(baseToken, args.manualName);

    fmt.progress(`Releasing manual "${manual.fields.Name}" to ${args.target} as version ${args.version}`);

    if (args.dryRun) {
        fmt.progress('[DRY RUN] Would publish all approved docs and create tag');
        fmt.render({ manual: manual.fields.Name, target: args.target, version: args.version, dry_run: true });
        return;
    }

    try {
        const publishArgs = {
            baseToken,
            target: args.target,
            sourceDocToken: args.sourceDocToken,
            manualName: args.manualName,
            help: false,
            dryRun: false,
            json: false,
        };

        const publishModule = require('./publish');
        await publishModule.run(null, [
            '--base', baseToken,
            '--target', args.target,
            '--manual', manual.fields.Name,
            ...(args.sourceDocToken ? ['--source-doc-token', args.sourceDocToken] : []),
        ], globalArgs);

        await bitableClient.createRecord(baseToken, 'tblVersions', {
            'Version': args.version,
            'Tag Name': `v${args.version}`,
            'Published At': new Date().toISOString(),
            'Manual': [manual.record_id],
        });

        fmt.render({ manual: manual.fields.Name, version: args.version, target: args.target });
        fmt.progress(`Version ${args.version} released.`);
    } catch (err) {
        console.error(`Failed to release: ${err.message}`);
        process.exit(1);
    }
}

async function manualList(args, globalArgs) {
    if (args.help) {
        printManualUsage('list');
        return;
    }

    const baseToken = resolveBase(args.baseToken);
    const fmt = new OutputFormatter(globalArgs.outputFormat || (args.json || args.table ? (args.json ? 'json' : 'table') : 'text'));

    try {
        const result = await bitableClient.listRecords(baseToken, 'tblManuals');
        const manuals = result.items || [];

        if (globalArgs.outputFormat === 'json' || args.json) {
            fmt.render({ manuals: manuals.map(m => ({
                name: m.fields.Name,
                root_type: m.fields['Root Type'],
                root_token: m.fields['Root Token'],
                record_id: m.record_id,
            }))});
        } else if (globalArgs.outputFormat === 'table' || args.table) {
            fmt.render(manuals.map(m => ({
                name: m.fields.Name,
                root_type: m.fields['Root Type'],
                root_token: m.fields['Root Token'],
            })), [
                { key: 'name', label: 'NAME', width: 25 },
                { key: 'root_type', label: 'ROOT TYPE', width: 15 },
                { key: 'root_token', label: 'ROOT TOKEN', width: 20 },
            ]);
        } else {
            if (manuals.length === 0) {
                fmt.progress('No manuals found. Run `docpal manual create` to add one.');
                return;
            }
            for (const m of manuals) {
                fmt.progress(`  ${m.fields.Name.padEnd(25)} ${m.fields['Root Type'].padEnd(15)} ${m.fields['Root Token']}`);
            }
            fmt.progress(`\n${manuals.length} manual(s) found.`);
        }
    } catch (err) {
        console.error(`Failed to list manuals: ${err.message}`);
        process.exit(1);
    }
}

async function manualStatus(args, globalArgs) {
    if (args.help) {
        printManualUsage('status');
        return;
    }

    const baseToken = resolveBase(args.baseToken);
    const fmt = new OutputFormatter(globalArgs.outputFormat || 'text');
    const outputFormat = globalArgs.outputFormat || (args.json ? 'json' : args.table ? 'table' : 'text');

    const manual = await bitableClient.resolveManual(baseToken, args.manualName);

    try {
        const result = await bitableClient.listRecords(baseToken, 'tblDocs');
        const docs = (result.items || []).filter(d => {
            const manualField = d.fields.Manual;
            if (!manualField) return true;
            const manualIds = Array.isArray(manualField) ? manualField : [manualField];
            return manualIds.includes(manual.record_id);
        });

        const statusCounts = {};
        for (const doc of docs) {
            const status = doc.fields.Status || 'Unknown';
            statusCounts[status] = (statusCounts[status] || 0) + 1;
        }

        const docData = docs.map(d => {
            const docUrl = d.fields.Doc || '';
            const prUrl = '';
            let prNumber = '';
            return {
                slug: d.fields.Slug || '',
                title: docUrl.match(/\[([^\]]+)\]/)?.[1] || d.fields.Slug || '',
                status: d.fields.Status || '',
                progress: d.fields.Progress || '',
                sync_status: d.fields['Sync Status'] || '',
            };
        });

        if (outputFormat === 'json') {
            fmt.render({
                manual: { name: manual.fields.Name, record_id: manual.record_id },
                docs: docData,
                summary: statusCounts,
            });
        } else if (outputFormat === 'table') {
            fmt.render(docData, [
                { key: 'slug', label: 'SLUG', width: 25 },
                { key: 'title', label: 'TITLE', width: 25 },
                { key: 'status', label: 'STATUS', width: 12 },
                { key: 'progress', label: 'PROGRESS', width: 12 },
                { key: 'sync_status', label: 'SYNC STATUS', width: 12 },
            ]);
        } else {
            fmt.progress(`\nManual: ${manual.fields.Name}\n`);
            for (const d of docData) {
                fmt.progress(`  ${d.slug.padEnd(25)} ${d.title.padEnd(25)} ${d.status.padEnd(12)} ${d.progress.padEnd(12)} ${d.sync_status.padEnd(12)}`);
            }
            const summaryParts = Object.entries(statusCounts).map(([k, v]) => `${v} ${k}`);
            fmt.progress(`\n${docs.length} doc(s): ${summaryParts.join(', ')}`);
        }
    } catch (err) {
        console.error(`Failed to get status: ${err.message}`);
        process.exit(1);
    }
}

async function run(subcommand, args, globalArgs) {
    const parsed = parseArgs(args);
    const mergedGlobalArgs = { ...globalArgs };

    switch (subcommand) {
        case 'create':
            await manualCreate(parsed, mergedGlobalArgs);
            break;
        case 'convert':
            await manualConvert(parsed, mergedGlobalArgs);
            break;
        case 'add':
            await manualAdd(parsed, mergedGlobalArgs);
            break;
        case 'approve':
            await manualApprove(parsed, mergedGlobalArgs);
            break;
        case 'publish':
            await manualPublish(parsed, mergedGlobalArgs);
            break;
        case 'release':
            await manualRelease(parsed, mergedGlobalArgs);
            break;
        case 'list':
            await manualList(parsed, mergedGlobalArgs);
            break;
        case 'status':
            await manualStatus(parsed, mergedGlobalArgs);
            break;
        default:
            printManualUsage();
            process.exit(1);
    }
}

function extractTokenFromUrl(url) {
    if (!url) return null;
    const match = url.match(/\/wiki\/(\w+)/);
    return match ? match[1] : null;
}

function extractPRNumber(prUrl) {
    if (!prUrl) return null;
    const match = prUrl.match(/\/pull\/(\d+)$/);
    return match ? parseInt(match[1], 10) : null;
}

module.exports = { run };