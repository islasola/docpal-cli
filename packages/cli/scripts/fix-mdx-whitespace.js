#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const USAGE = `
Usage: node fix-mdx-whitespace.js [options]

Fix leading whitespace and formatting artifacts in MDX content.

Options:
  --input <dir>      Input directory containing MDX files (default: ./docs)
  --output <dir>      Output directory (default: overwrite in place)
  --pattern <glob>    File pattern to match (default: **/*.mdx)
  --dry-run           Show what would be fixed without making changes
  -h, --help          Show this help

Examples:
  node fix-mdx-whitespace.js --input ./docs --dry-run
  node fix-mdx-whitespace.js --input ./docs --output ./fixed
`;

function parseArgs(args) {
    const opts = { input: './docs', output: null, pattern: '**/*.mdx', dryRun: false };
    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--input' && args[i + 1]) opts.input = args[++i];
        else if (args[i] === '--output' && args[i + 1]) opts.output = args[++i];
        else if (args[i] === '--pattern' && args[i + 1]) opts.pattern = args[++i];
        else if (args[i] === '--dry-run') opts.dryRun = true;
        else if (args[i] === '-h' || args[i] === '--help') { console.log(USAGE); process.exit(0); }
    }
    return opts;
}

function fixWhitespace(content) {
    const fixes = [];

    let result = content;

    const leadingSpaceResult = result.replace(/^(\s{2,})(\S)/gm, (match, spaces, char) => {
        if (spaces.length % 2 === 0 && spaces.length <= 6 && !match.includes('\t')) {
            return match;
        }
        fixes.push('Trimmed leading whitespace');
        return char;
    });
    result = leadingSpaceResult;

    const trailingResult = result.replace(/[ \t]+$/gm, '');
    if (trailingResult !== result) {
        fixes.push('Trimmed trailing whitespace');
        result = trailingResult;
    }

    const doubleBlankResult = result.replace(/\n{4,}/g, '\n\n\n');
    if (doubleBlankResult !== result) {
        fixes.push('Collapsed excessive blank lines');
        result = doubleBlankResult;
    }

    const mixedIndentResult = result.replace(/^( +)\t/gm, (match, spaces) => {
        const tabWidth = 4 - (spaces.length % 4);
        fixes.push('Replaced mixed indentation');
        return spaces + ' '.repeat(tabWidth);
    });
    result = mixedIndentResult;

    return { content: result, fixes };
}

function walkDir(dir, pattern) {
    const files = [];
    const suffix = pattern.replace('**/', '').replace('*', '');
    function walk(d) {
        try {
            const entries = fs.readdirSync(d, { withFileTypes: true });
            for (const entry of entries) {
                const fullPath = path.join(d, entry.name);
                if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
                    walk(fullPath);
                } else if (entry.isFile() && entry.name.endsWith(suffix)) {
                    files.push(fullPath);
                }
            }
        } catch (err) {
            console.warn(`Warning: Cannot read directory ${d}: ${err.message}`);
        }
    }
    walk(path.resolve(dir));
    return files;
}

async function run(subcommand, args, globalArgs) {
    const opts = parseArgs(args);
    const dryRun = opts.dryRun || (globalArgs && globalArgs.dryRun);

    try {
        const inputDir = path.resolve(opts.input);
        if (!fs.existsSync(inputDir)) {
            console.error(`Input directory not found: ${inputDir}`);
            process.exit(1);
        }

        const files = walkDir(opts.input, opts.pattern);
        if (files.length === 0) {
            console.log('No MDX files found.');
            return;
        }

        console.log(`Scanning ${files.length} MDX file(s)...\n`);

        let totalFixes = 0;
        let filesFixed = 0;

        for (const file of files) {
            const content = fs.readFileSync(file, 'utf8');
            const { content: fixed, fixes } = fixWhitespace(content);

            if (fixes.length > 0) {
                const relPath = path.relative(process.cwd(), file);
                console.log(`${relPath}: ${fixes.join(', ')}`);

                if (!dryRun) {
                    const outPath = opts.output
                        ? path.join(path.resolve(opts.output), path.relative(path.resolve(opts.input), file))
                        : file;
                    fs.mkdirSync(path.dirname(outPath), { recursive: true });
                    fs.writeFileSync(outPath, fixed, 'utf8');
                }

                totalFixes += fixes.length;
                filesFixed++;
            }
        }

        console.log(`\n${filesFixed} file(s) with whitespace issues${dryRun ? ' (dry run)' : ' fixed'}, ${totalFixes} total fixes`);

    } catch (err) {
        console.error(`Failed to fix whitespace: ${err.message}`);
        process.exit(1);
    }
}

module.exports = { run, fixWhitespace };

if (require.main === module) {
    const args = process.argv.slice(2);
    run(null, args, {}).catch(err => {
        console.error(err.message);
        process.exit(1);
    });
}