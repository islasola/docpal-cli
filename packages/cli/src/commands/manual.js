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

function extractLinkRecordIds(fieldValue) {
    if (!fieldValue) return [];
    const arr = Array.isArray(fieldValue) ? fieldValue : [fieldValue];
    const ids = [];
    for (const item of arr) {
        if (typeof item === 'string') {
            ids.push(item);
        } else if (item && typeof item === 'object') {
            if (Array.isArray(item.record_ids)) {
                ids.push(...item.record_ids);
            } else if (item.record_id) {
                ids.push(item.record_id);
            } else if (item.id) {
                ids.push(item.id);
            }
        }
    }
    return ids;
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
  --position <n>               Sidebar position (defaults to 1 if omitted)
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
        sync: `
Usage: docpal manual sync --manual <name> [options]

Options:
  --base <token>              Bitable app token (or set BASE_TOKEN in .env)
  --manual <name>             Manual name (auto-selected if only one)
  --dry-run                   Preview without syncing
  --json                      Output as JSON
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
  sync        Synchronize wiki tree with tblDocs

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
        console.log('[convert] Checking for existing manual...');
        const allManuals = await bitableClient.listAllRecords(baseToken, 'tblManuals');
        let manual = (allManuals.items || []).find(m => m.fields['Root Token'] === args.from) || null;
        if (manual) {
            console.log('[convert] Reusing existing manual:', manual.record_id);
        } else {
            console.log('[convert] Creating manual record...');
            manual = await bitableClient.createRecord(baseToken, 'tblManuals', {
                'Name': args.name,
                'Root Type': args.rootType === 'wiki' ? 'Wiki Space' : 'Drive Folder',
                'Root Token': args.from,
                'Default Publish Target': args.targets || [],
            });
            manual.record_id = manual.record?.record_id || manual.record_id;
            console.log('[convert] Manual record created:', manual.record_id);
        }

        const feishuHost = process.env.FEISHU_HOST || 'zilliverse.feishu.cn';
        let registered = 0;
        let existed = 0;
        let skipped = 0;
        const wikiTokenToRecordId = new Map();

        console.log('[convert] Loading existing docs for deduplication...');
        const existingDocs = await bitableClient.listAllRecords(baseToken, 'tblDocs', { pageSize: 500 });
        const existingSlugs = new Set();
        for (const doc of existingDocs.items || []) {
            const slug = doc.fields.Slug;
            if (slug) existingSlugs.add(slug);
            const wikiToken = extractTokenFromUrl(doc.fields.Doc);
            if (wikiToken) wikiTokenToRecordId.set(wikiToken, doc.record_id);
        }
        console.log(`[convert] Found ${existingSlugs.size} existing docs`);

        console.log('[convert] Initializing DocScraper...');
        const scraper = new DocScraper({
            rootToken: args.from,
            sourceType: args.rootType,
            spaceId: process.env.SPACE_ID,
        });

        fmt.progress('Fetching document tree...');
        console.log('[convert] Starting scraper.fetch()...');
        const { tree, sourceMap } = await scraper.fetch({ recursive: true, skipBlocks: true });
        console.log('[convert] Scraper done. sourceMap size:', sourceMap.size);
        fmt.progress(`Found ${sourceMap.size} documents in the tree`);

        // BFS level-by-level insertion
        let currentLevel = [tree];
        let level = 0;
        while (currentLevel.length > 0) {
            const nextLevel = [];
            const batch = [];
            const batchNodes = [];

            for (const node of currentLevel) {
                // Queue children for next level regardless of whether this node is inserted
                if (node.children) {
                    nextLevel.push(...node.children);
                }

                const nodeToken = node.node_token || node.origin_node_token || node.obj_token || node.token;
                if (nodeToken === args.from) {
                    skipped++;
                    continue;
                }

                const isDocx = node.obj_type === 'docx' || node.type === 'docx';
                if (!isDocx) {
                    skipped++;
                    continue;
                }

                const title = node.title || node.name || '';
                const docSlug = node.slug || slugify(title, { lower: true, strict: true });
                if (!title || !docSlug) {
                    skipped++;
                    continue;
                }

                if (existingSlugs.has(docSlug)) {
                    existed++;
                    continue;
                }

                const token = node.node_token || node.origin_node_token || node.obj_token || node.token;
                const record = {
                    'Doc': { link: `https://${feishuHost}/wiki/${token}`, text: title },
                    'Slug': docSlug,
                    'Status': 'Draft',
                    'Progress': 'Writing',
                    'Manual': [manual.record_id],
                };

                if (level >= 2) {
                    const parentWikiToken = node.parent_node_token;
                    const parentRecordId = wikiTokenToRecordId.get(parentWikiToken);
                    if (parentRecordId) {
                        record['Parent Doc'] = [parentRecordId];
                    }
                }

                batch.push({ fields: record });
                batchNodes.push({ node });
            }

            if (batch.length > 0) {
                console.log(`[convert] Level ${level}: inserting ${batch.length} docs...`);
                try {
                    const result = await bitableClient.batchCreateRecords(baseToken, 'tblDocs', batch);
                    const records = result.records || [];
                    for (let i = 0; i < records.length && i < batchNodes.length; i++) {
                        const recordId = records[i].record_id;
                        const node = batchNodes[i].node;
                        if (node.origin_node_token) wikiTokenToRecordId.set(node.origin_node_token, recordId);
                        if (node.node_token) wikiTokenToRecordId.set(node.node_token, recordId);
                        if (node.obj_token) wikiTokenToRecordId.set(node.obj_token, recordId);
                        if (node.token) wikiTokenToRecordId.set(node.token, recordId);
                    }
                    registered += batch.length;
                    console.log(`[convert] Level ${level}: inserted ${batch.length} docs`);
                } catch (err) {
                    console.error(`[convert] Level ${level}: batch insert failed: ${err.message}`);
                    // Fall back to individual inserts
                    for (let i = 0; i < batch.length; i++) {
                        try {
                            const result = await bitableClient.createRecord(baseToken, 'tblDocs', batch[i].fields);
                            const recordId = result.record_id || result.record?.record_id;
                            if (recordId) {
                                const node = batchNodes[i].node;
                                if (node.origin_node_token) wikiTokenToRecordId.set(node.origin_node_token, recordId);
                                if (node.node_token) wikiTokenToRecordId.set(node.node_token, recordId);
                                if (node.obj_token) wikiTokenToRecordId.set(node.obj_token, recordId);
                                if (node.token) wikiTokenToRecordId.set(node.token, recordId);
                            }
                            registered++;
                        } catch (innerErr) {
                            console.error(`[convert] Failed to insert ${batch[i].fields.Slug}: ${innerErr.message}`);
                        }
                    }
                }
            }

            currentLevel = nextLevel;
            level++;
        }
        console.log(`[convert] BFS done. registered=${registered}, existed=${existed}, skipped=${skipped}`);

        fmt.render({
            name: args.name,
            from: args.from,
            record_id: manual.record_id,
            registered,
            existed,
            total: sourceMap.size,
        });

        fmt.progress(`Registered ${registered} new documents, skipped ${existed} existing. Conversion complete.`);
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

        const allDocs = await bitableClient.listAllRecords(baseToken, 'tblDocs', { pageSize: 500 });
        const existing = (allDocs.items || []).find(d => d.fields.Slug === docSlug);

        if (existing && !args.force) {
            console.error(`Error: Slug "${docSlug}" already exists. Use --force to override.`);
            process.exit(1);
        }

        const position = args.position || 1;

        const docRecord = await bitableClient.createRecord(baseToken, 'tblDocs', {
            'Doc': { link: `https://${process.env.FEISHU_HOST || 'zilliverse.feishu.cn'}/wiki/${args.docToken}`, text: title },
            'Slug': docSlug,
            'Status': 'Draft',
            'Progress': 'Writing',
            'Sidebar Position': position,
            'Manual': [manual.record_id],
        });

        const targets = await bitableClient.listAllRecords(baseToken, 'tblPublishTargets');
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
    const allDocs = await bitableClient.listAllRecords(baseToken, 'tblDocs', { pageSize: 500 });
    const record = (allDocs.items || []).find(d => {
        const manualIds = extractLinkRecordIds(d.fields.Manual);
        return manualIds.includes(manual.record_id) && d.fields.Slug === args.slug;
    });

    if (!record) {
        console.error(`Error: Doc "${args.slug}" not found in manual "${manual.fields.Name}"`);
        process.exit(1);
    }
    const currentStatus = record.fields.Status;
    const docTitleField = record.fields.Doc;
    const docTitleText = typeof docTitleField === 'string' ? docTitleField : (docTitleField?.text || '');
    const docTitle = docTitleText.match(/\[([^\]]+)\]/)?.[1] || args.slug;

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
    const allDocs = await bitableClient.listAllRecords(baseToken, 'tblDocs', { pageSize: 500 });
    const docs = (allDocs.items || []).filter(d => {
        const manualIds = extractLinkRecordIds(d.fields.Manual);
        return manualIds.includes(manual.record_id) && ['In Review', 'Draft'].includes(d.fields.Status);
    });
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
        const allTargets = await bitableClient.listAllRecords(baseToken, 'tblPublishTargets', { pageSize: 500 });
        const targetConfig = (allTargets.items || []).find(t => t.fields.Name === args.target);

        if (!targetConfig) {
            console.error(`Error: Publish target "${args.target}" not found`);
            process.exit(1);
        }

        const repo = targetConfig.fields.Repo;
        const baseBranch = targetConfig.fields['Base Branch'] || 'main';
        const branchPrefix = targetConfig.fields['Branch Prefix'] || 'doc-sync-';

        const allDocs = await bitableClient.listAllRecords(baseToken, 'tblDocs', { pageSize: 500 });
        let docs = (allDocs.items || []).filter(d => {
            const manualIds = extractLinkRecordIds(d.fields.Manual);
            return manualIds.includes(manual.record_id) && d.fields.Status === 'Approved';
        });
        if (args.slug) {
            docs = docs.filter(d => d.fields.Slug === args.slug);
        }

        if (docs.length === 0) {
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
        for (const doc of docs) {
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
    const wikiToken = extractTokenFromUrl(doc.fields.Doc);
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

        // Resolve wiki node token to obj_token for docx API
        let docToken = wikiToken;
        try {
            const nodeInfo = await larkDocClient.getWikiNode(wikiToken);
            if (nodeInfo && nodeInfo.node && nodeInfo.node.obj_token) {
                docToken = nodeInfo.node.obj_token;
            }
        } catch (err) {
            fmt.progress(`  Warning: Could not resolve wiki node ${wikiToken}, using as-is: ${err.message}`);
        }

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

        const docFieldForTitle = doc.fields.Doc;
        const docFieldText = typeof docFieldForTitle === 'string' ? docFieldForTitle : (docFieldForTitle?.text || '');
        const title = doc.fields['Sidebar Label'] || docFieldText.match(/\[([^\]]+)\]/)?.[1] || slug;
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
            token: wikiToken,
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
                    body: `Updated at ${new Date().toISOString()}\n\nOriginal doc: ${typeof doc.fields.Doc === 'string' ? doc.fields.Doc : (doc.fields.Doc?.link || doc.fields.Doc?.text || '')}`
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
                `Auto-generated from Feishu doc: ${typeof doc.fields.Doc === 'string' ? doc.fields.Doc : (doc.fields.Doc?.link || doc.fields.Doc?.text || '')}\n\nManual: ${manual.fields.Name}`
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
        const result = await bitableClient.listAllRecords(baseToken, 'tblManuals');
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
        const result = await bitableClient.listAllRecords(baseToken, 'tblDocs');
        const docs = (result.items || []).filter(d => {
            const manualIds = extractLinkRecordIds(d.fields.Manual);
            return manualIds.length === 0 || manualIds.includes(manual.record_id);
        });

        const statusCounts = {};
        for (const doc of docs) {
            const status = doc.fields.Status || 'Unknown';
            statusCounts[status] = (statusCounts[status] || 0) + 1;
        }

        const docData = docs.map(d => {
            const docField = d.fields.Doc;
            const docUrl = typeof docField === 'string' ? docField : (docField?.link || '');
            const docText = typeof docField === 'string' ? docField : (docField?.text || '');
            const prUrl = '';
            let prNumber = '';
            return {
                slug: d.fields.Slug || '',
                title: docText.match(/\[([^\]]+)\]/)?.[1] || docText || d.fields.Slug || '',
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

async function manualSync(args, globalArgs) {
    if (args.help) {
        printManualUsage('sync');
        return;
    }

    const baseToken = resolveBase(args.baseToken);
    const fmt = new OutputFormatter(globalArgs.outputFormat || (args.json ? 'json' : 'text'));

    const manual = await bitableClient.resolveManual(baseToken, args.manualName);

    fmt.progress(`Syncing manual: ${manual.fields.Name}`);

    if (args.dryRun) {
        fmt.progress('[DRY RUN] Would scan tree and sync with tblDocs');
        fmt.render({ manual: manual.fields.Name, dry_run: true });
        return;
    }

    try {
        const scraper = new DocScraper({
            rootToken: manual.fields['Root Token'],
            sourceType: manual.fields['Root Type'] === 'Wiki Space' ? 'wiki' : 'drive',
            spaceId: process.env.SPACE_ID,
        });

        fmt.progress('Fetching document tree...');
        const { tree } = await scraper.fetch({ recursive: true, skipBlocks: true });
        fmt.progress(`Found ${scraper.sourceMap.size} documents in the tree`);

        const existingDocs = await bitableClient.listAllRecords(baseToken, 'tblDocs', { pageSize: 500 });
        const existingByWikiToken = new Map();
        const existingBySlug = new Map();
        const wikiTokenToRecordId = new Map();
        const manualRecordId = manual.record_id;

        for (const doc of existingDocs.items || []) {
            const manualIds = extractLinkRecordIds(doc.fields.Manual);
            if (!manualIds.includes(manualRecordId)) continue;

            const wikiToken = extractTokenFromUrl(doc.fields.Doc);
            const slug = doc.fields.Slug;
            if (wikiToken) {
                existingByWikiToken.set(wikiToken, doc);
                wikiTokenToRecordId.set(wikiToken, doc.record_id);
            }
            if (slug) existingBySlug.set(slug, doc);
        }
        fmt.progress(`Found ${existingByWikiToken.size} existing docs for this manual`);

        const feishuHost = process.env.FEISHU_HOST || 'zilliverse.feishu.cn';
        let created = 0;
        let updated = 0;
        let unchanged = 0;
        let skipped = 0;
        const treeWikiTokens = new Set();
        const updateBatch = [];

        let currentLevel = [tree];
        let level = 0;
        while (currentLevel.length > 0) {
            const nextLevel = [];
            const batch = [];
            const batchNodes = [];

            for (const node of currentLevel) {
                if (node.children) {
                    nextLevel.push(...node.children);
                }

                const nodeToken = node.node_token || node.origin_node_token || node.obj_token || node.token;
                if (nodeToken) treeWikiTokens.add(nodeToken);

                if (nodeToken === manual.fields['Root Token']) {
                    skipped++;
                    continue;
                }

                const isDocx = node.obj_type === 'docx' || node.type === 'docx';
                if (!isDocx) {
                    skipped++;
                    continue;
                }

                const title = node.title || node.name || '';
                const docSlug = node.slug || slugify(title, { lower: true, strict: true });
                if (!title || !docSlug) {
                    skipped++;
                    continue;
                }

                const existing = existingByWikiToken.get(nodeToken) || existingBySlug.get(docSlug);
                if (existing) {
                    const updates = {};
                    const existingDocField = existing.fields.Doc;
                    const existingTitle = typeof existingDocField === 'object' ? existingDocField.text : '';
                    const existingUrl = typeof existingDocField === 'object' ? existingDocField.link : existingDocField;
                    const existingToken = extractTokenFromUrl(existingUrl);

                    if (existingTitle !== title || existingToken !== nodeToken) {
                        updates['Doc'] = { link: `https://${feishuHost}/wiki/${nodeToken}`, text: title };
                    }

                    if (level >= 2) {
                        const parentWikiToken = node.parent_node_token;
                        const parentRecordId = wikiTokenToRecordId.get(parentWikiToken);
                        const existingParentIds = extractLinkRecordIds(existing.fields['Parent Doc']);
                        const existingParentId = existingParentIds[0] || null;
                        if (parentRecordId && parentRecordId !== existingParentId) {
                            updates['Parent Doc'] = [parentRecordId];
                        }
                    }

                    if (Object.keys(updates).length > 0) {
                        updateBatch.push({ record_id: existing.record_id, fields: updates });
                        updated++;
                    } else {
                        unchanged++;
                    }

                    wikiTokenToRecordId.set(nodeToken, existing.record_id);
                } else {
                    const record = {
                        'Doc': { link: `https://${feishuHost}/wiki/${nodeToken}`, text: title },
                        'Slug': docSlug,
                        'Status': 'Draft',
                        'Progress': 'Writing',
                        'Manual': [manual.record_id],
                    };

                    if (level >= 2) {
                        const parentWikiToken = node.parent_node_token;
                        const parentRecordId = wikiTokenToRecordId.get(parentWikiToken);
                        if (parentRecordId) {
                            record['Parent Doc'] = [parentRecordId];
                        }
                    }

                    batch.push({ fields: record });
                    batchNodes.push({ node });
                }
            }

            if (batch.length > 0) {
                console.log(`[sync] Level ${level}: creating ${batch.length} new docs...`);
                try {
                    const result = await bitableClient.batchCreateRecords(baseToken, 'tblDocs', batch);
                    const records = result.records || [];
                    for (let i = 0; i < records.length && i < batchNodes.length; i++) {
                        const recordId = records[i].record_id;
                        const node = batchNodes[i].node;
                        if (node.node_token) wikiTokenToRecordId.set(node.node_token, recordId);
                        if (node.origin_node_token) wikiTokenToRecordId.set(node.origin_node_token, recordId);
                        if (node.obj_token) wikiTokenToRecordId.set(node.obj_token, recordId);
                        if (node.token) wikiTokenToRecordId.set(node.token, recordId);
                    }
                    created += batch.length;
                    console.log(`[sync] Level ${level}: created ${batch.length} docs`);
                } catch (err) {
                    console.error(`[sync] Level ${level}: batch create failed: ${err.message}`);
                    for (let i = 0; i < batch.length; i++) {
                        try {
                            const result = await bitableClient.createRecord(baseToken, 'tblDocs', batch[i].fields);
                            const recordId = result.record_id || result.record?.record_id;
                            if (recordId) {
                                const node = batchNodes[i].node;
                                if (node.node_token) wikiTokenToRecordId.set(node.node_token, recordId);
                                if (node.origin_node_token) wikiTokenToRecordId.set(node.origin_node_token, recordId);
                                if (node.obj_token) wikiTokenToRecordId.set(node.obj_token, recordId);
                                if (node.token) wikiTokenToRecordId.set(node.token, recordId);
                            }
                            created++;
                        } catch (innerErr) {
                            console.error(`[sync] Failed to create ${batch[i].fields.Slug}: ${innerErr.message}`);
                        }
                    }
                }
            }

            currentLevel = nextLevel;
            level++;
        }

        // Batch apply updates
        if (updateBatch.length > 0 && !args.dryRun) {
            console.log(`[sync] Batch updating ${updateBatch.length} docs...`);
            try {
                await bitableClient.batchUpdateRecords(baseToken, 'tblDocs', updateBatch);
                console.log(`[sync] Batch updated ${updateBatch.length} docs`);
            } catch (err) {
                console.error(`[sync] Batch update failed: ${err.message}`);
                for (const item of updateBatch) {
                    try {
                        await bitableClient.updateRecord(baseToken, 'tblDocs', item.record_id, item.fields);
                    } catch (innerErr) {
                        console.error(`[sync] Failed to update ${item.record_id}: ${innerErr.message}`);
                    }
                }
            }
        }

        let deprecated = 0;
        const deprecateBatch = [];
        for (const [wikiToken, doc] of existingByWikiToken) {
            if (!treeWikiTokens.has(wikiToken)) {
                const currentStatus = doc.fields.Status;
                if (currentStatus !== 'Deprecated') {
                    deprecateBatch.push({
                        record_id: doc.record_id,
                        fields: {
                            'Status': 'Deprecated',
                            'Progress': 'Ready',
                        }
                    });
                    deprecated++;
                }
            }
        }

        if (deprecateBatch.length > 0 && !args.dryRun) {
            console.log(`[sync] Batch deprecating ${deprecateBatch.length} docs...`);
            try {
                await bitableClient.batchUpdateRecords(baseToken, 'tblDocs', deprecateBatch);
                console.log(`[sync] Batch deprecated ${deprecateBatch.length} docs`);
            } catch (err) {
                console.error(`[sync] Batch deprecate failed: ${err.message}`);
                for (const item of deprecateBatch) {
                    try {
                        await bitableClient.updateRecord(baseToken, 'tblDocs', item.record_id, item.fields);
                    } catch (innerErr) {
                        console.error(`[sync] Failed to deprecate ${item.record_id}: ${innerErr.message}`);
                    }
                }
            }
        }

        fmt.render({
            manual: manual.fields.Name,
            created,
            updated,
            unchanged,
            deprecated,
            skipped,
        });

        fmt.progress(`Sync complete: ${created} created, ${updated} updated, ${unchanged} unchanged, ${deprecated} deprecated, ${skipped} skipped`);
    } catch (err) {
        console.error(`Failed to sync manual: ${err.message}`);
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
        case 'sync':
            await manualSync(parsed, mergedGlobalArgs);
            break;
        default:
            printManualUsage();
            process.exit(1);
    }
}

function extractTokenFromUrl(urlOrField) {
    if (!urlOrField) return null;
    const url = typeof urlOrField === 'string' ? urlOrField : urlOrField.link;
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