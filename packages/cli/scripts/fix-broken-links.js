#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { blocksToMdx } = require('../lib/mdxWriter');
const { patchMdx } = require('../lib/mdxPatcher');
const { generateFrontMatter } = require('../lib/frontMatter');
const { detectBrokenLinks } = require('../lib/larkUtils');

const USAGE = `
Usage: node fix-broken-links.js [options]

Scan published MDX content for broken internal links and optionally auto-fix them.

Options:
  --manual <token>    Bitable token for the manual registry
  --doc <slug>       Process a specific document by slug
  --all              Process all documents in the registry
  --fix              Auto-fix broken links (default: dry-run only)
  --dry-run          Show what would be fixed without making changes
  --output <dir>     Output directory for fixed files (default: ./fixed)
  -h, --help         Show this help

Examples:
  node fix-broken-links.js --manual abc123 --doc my-api --fix
  node fix-broken-links.js --manual abc123 --all --dry-run
`;

function parseArgs(args) {
    const opts = { manual: null, doc: null, all: false, fix: false, dryRun: false, output: './fixed' };
    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--manual' && args[i + 1]) opts.manual = args[++i];
        else if (args[i] === '--doc' && args[i + 1]) opts.doc = args[++i];
        else if (args[i] === '--all') opts.all = true;
        else if (args[i] === '--fix') opts.fix = true;
        else if (args[i] === '--dry-run') opts.dryRun = true;
        else if (args[i] === '--output' && args[i + 1]) opts.output = args[++i];
        else if (args[i] === '-h' || args[i] === '--help') { console.log(USAGE); process.exit(0); }
    }
    return opts;
}

function findBrokenLinks(content, slug, allSlugs) {
    const linkRegex = /\[([^\]]*)\]\(([^)]+)\)/g;
    const broken = [];
    let match;

    while ((match = linkRegex.exec(content)) !== null) {
        const linkText = match[1];
        const linkUrl = match[2];

        if (linkUrl.startsWith('http://') || linkUrl.startsWith('https://')) {
            continue;
        }

        if (linkUrl.startsWith('/')) {
            const slugPath = linkUrl.replace(/^\/+/, '').split('/')[0].split('#')[0];
            if (slugPath && allSlugs && !allSlugs.has(slugPath)) {
                broken.push({
                    text: linkText,
                    url: linkUrl,
                    line: content.substring(0, match.index).split('\n').length,
                    type: 'broken-slug'
                });
            }
        }

        if (linkUrl.startsWith('#')) {
            const anchorId = linkUrl.substring(1).toLowerCase().replace(/[^a-z0-9-]/g, '-');
            const headingRegex = new RegExp(`^#+\\s+.*\\{#${anchorId}\\}`, 'm');
            const anchorRegex = new RegExp(`id=["']${anchorId}["']`, 'm');
            if (!headingRegex.test(content) && !anchorRegex.test(content)) {
                broken.push({
                    text: linkText,
                    url: linkUrl,
                    line: content.substring(0, match.index).split('\n').length,
                    type: 'broken-anchor'
                });
            }
        }
    }

    return broken;
}

function fixBrokenLinks(content, brokenLinks) {
    let fixed = content;
    for (const link of brokenLinks) {
        if (link.type === 'broken-slug') {
            const slugVariants = [
                link.url.replace(/^\/+/, '').split('/')[0],
                link.url.replace(/^\/+/, '').split('/')[0].replace(/_/g, '-'),
                link.url.replace(/^\/+/, '').split('/')[0].replace(/-/g, '_'),
            ];
            const originalText = `[${link.text}](${link.url})`;
            const commentReplacement = `<!-- BROKEN LINK: ${originalText} -->`;
            fixed = fixed.replace(originalText, commentReplacement);
        }
        if (link.type === 'broken-anchor') {
            const originalText = `[${link.text}](${link.url})`;
            const textOnlyReplacement = link.text;
            fixed = fixed.replace(originalText, textOnlyReplacement);
        }
    }
    return fixed;
}

async function run(subcommand, args, globalArgs) {
    const opts = parseArgs(args);

    if (!opts.manual) {
        console.error('Error: --manual <token> is required');
        console.log(USAGE);
        process.exit(1);
    }

    if (!opts.doc && !opts.all) {
        console.error('Error: --doc <slug> or --all is required');
        console.log(USAGE);
        process.exit(1);
    }

    const bitableClient = require('../lib/bitableClient');
    const configLoader = require('../lib/configLoader');
    const larkAuth = require('../lib/larkAuth');

    if (globalArgs && globalArgs.authMode) {
        larkAuth.setMode(globalArgs.authMode);
    }

    const dryRun = opts.dryRun || !opts.fix;

    try {
        const baseToken = opts.manual || configLoader.get('registryBitableToken');

        const docsTable = (await bitableClient.listTables(baseToken)).items
            .find(t => t.table_name === 'Docs');
        if (!docsTable) throw new Error('Docs table not found');

        let records = await bitableClient.listRecords(baseToken, docsTable.table_id, { pageSize: 500 });
        if (records.items) {
            let allRecords = [...records.items];
            while (records.has_more || records.page_token) {
                records = await bitableClient.listRecords(baseToken, docsTable.table_id, {
                    pageSize: 500,
                    page_token: records.page_token
                });
                if (records.items) allRecords = allRecords.concat(records.items);
            }
            records = allRecords;
        }

        const slugs = new Set(records.map(r => r.fields && r.fields.Slug).filter(Boolean));

        let docsToProcess = records;
        if (opts.doc) {
            docsToProcess = records.filter(r => r.fields && r.fields.Slug === opts.doc);
            if (docsToProcess.length === 0) {
                console.error(`Document not found: ${opts.doc}`);
                process.exit(1);
            }
        }

        let totalBroken = 0;
        let totalFixed = 0;

        for (const record of docsToProcess) {
            const slug = record.fields.Slug;
            const content = record.fields.Content || record.fields.MDX || '';

            if (!content) continue;

            const broken = findBrokenLinks(content, slug, slugs);

            if (broken.length > 0) {
                console.log(`\n${slug}: ${broken.length} broken link(s)`);
                for (const link of broken) {
                    console.log(`  Line ${link.line}: [${link.text}](${link.url}) (${link.type})`);
                }

                if (!dryRun) {
                    const fixed = fixBrokenLinks(content, broken);
                    const outputDir = path.resolve(opts.output);
                    fs.mkdirSync(outputDir, { recursive: true });
                    fs.writeFileSync(path.join(outputDir, `${slug}.mdx`), fixed);
                    totalFixed += broken.length;
                }

                totalBroken += broken.length;
            }
        }

        console.log(`\nTotal: ${totalBroken} broken links found${!dryRun ? `, ${totalFixed} fixed` : ' (dry run)'}`);

    } catch (err) {
        console.error(`Failed to fix broken links: ${err.message}`);
        process.exit(1);
    }
}

module.exports = { run, findBrokenLinks, fixBrokenLinks };

if (require.main === module) {
    const args = process.argv.slice(2);
    run(null, args, {}).catch(err => {
        console.error(err.message);
        process.exit(1);
    });
}