#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const USAGE = `
Usage: node inject-cross-references.js [options]

Inject cross-reference links for type/method names in MDX content.

Options:
  --input <dir>       Input directory containing MDX files (default: ./docs)
  --output <dir>      Output directory (default: overwrite in place)
  --registry <file>   Path to registry JSON file mapping names to URLs
  --pattern <glob>    File pattern to match (default: **/*.mdx)
  --dry-run           Show what would be injected without making changes
  -h, --help          Show this help

Examples:
  node inject-cross-references.js --input ./docs --registry ./refs.json --dry-run
  node inject-cross-references.js --input ./docs --registry ./refs.json
`;

function parseArgs(args) {
    const opts = { input: './docs', output: null, registry: null, pattern: '**/*.mdx', dryRun: false };
    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--input' && args[i + 1]) opts.input = args[++i];
        else if (args[i] === '--output' && args[i + 1]) opts.output = args[++i];
        else if (args[i] === '--registry' && args[i + 1]) opts.registry = args[++i];
        else if (args[i] === '--pattern' && args[i + 1]) opts.pattern = args[++i];
        else if (args[i] === '--dry-run') opts.dryRun = true;
        else if (args[i] === '-h' || args[i] === '--help') { console.log(USAGE); process.exit(0); }
    }
    return opts;
}

function loadRegistry(filePath) {
    if (!filePath) return new Map();

    const resolved = path.resolve(filePath);
    if (!fs.existsSync(resolved)) {
        console.warn(`Registry file not found: ${resolved}`);
        return new Map();
    }

    const data = JSON.parse(fs.readFileSync(resolved, 'utf8'));
    const map = new Map();

    if (Array.isArray(data)) {
        for (const entry of data) {
            if (entry.name && entry.url) map.set(entry.name, entry.url);
            if (entry.slug && entry.url) map.set(entry.slug, entry.url);
        }
    } else if (typeof data === 'object') {
        for (const [key, value] of Object.entries(data)) {
            map.set(key, typeof value === 'string' ? value : value.url || value.slug);
        }
    }

    return map;
}

function isInsideCodeOrLink(content, offset) {
    const before = content.substring(0, offset);

    const lines = before.split('\n');
    const currentLine = lines[lines.length - 1];

    if (currentLine.trim().startsWith('```')) return true;

    let inCodeBlock = false;
    for (const line of lines) {
        if (line.trim().startsWith('```')) inCodeBlock = !inCodeBlock;
    }
    if (inCodeBlock) return true;

    if (currentLine.includes('`') && (currentLine.indexOf('`') < currentLine.indexOf(currentLine.trim()))) {
        const tickCount = (currentLine.match(/`/g) || []).length;
        if (tickCount % 2 === 1) return true;
    }

    const lastLinkStart = before.lastIndexOf('[');
    const lastLinkEnd = before.lastIndexOf('](');
    if (lastLinkStart > lastLinkEnd && lastLinkStart > 0) return true;

    return false;
}

function injectReferences(content, registry) {
    let result = content;
    const injections = [];

    const frontMatterEnd = content.startsWith('---') ? content.indexOf('---', 3) + 3 : 0;
    const body = result.substring(frontMatterEnd);
    let modifiedBody = body;

    for (const [name, url] of registry) {
        const patterns = [
            { regex: new RegExp(`(?<![\`/\\[])\\b${escapeRegex(name)}\\b(?![\\`\`\\]\\(/])`, 'g'), name, url }
        ];

        for (const { regex, name: refName, url: refUrl } of patterns) {
            let match;
            while ((match = regex.exec(modifiedBody)) !== null) {
                const offset = match.index;

                if (isInsideCodeOrLink(modifiedBody, offset)) continue;

                const before = modifiedBody.substring(Math.max(0, offset - 5), offset);
                if (before.endsWith('[')) continue;

                const after = modifiedBody.substring(offset + match[0].length, offset + match[0].length + 3);
                if (after.startsWith('](')) continue;

                const replacement = `[${refName}](${refUrl})`;
                modifiedBody = modifiedBody.substring(0, offset) + replacement + modifiedBody.substring(offset + match[0].length);
                injections.push({ name: refName, url: refUrl, line: modifiedBody.substring(0, offset).split('\n').length });
                regex.lastIndex = offset + replacement.length;
            }
        }
    }

    return {
        content: result.substring(0, frontMatterEnd) + modifiedBody,
        injections
    };
}

function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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
            // skip unreadable directories
        }
    }
    walk(path.resolve(dir));
    return files;
}

async function run(subcommand, args, globalArgs) {
    const opts = parseArgs(args);
    const dryRun = opts.dryRun || (globalArgs && globalArgs.dryRun);

    try {
        const registry = loadRegistry(opts.registry);
        console.log(`Loaded ${registry.size} cross-reference entries`);

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

        let totalInjections = 0;
        let filesModified = 0;

        for (const file of files) {
            const content = fs.readFileSync(file, 'utf8');
            const { content: fixed, injections } = injectReferences(content, registry);

            if (injections.length > 0) {
                const relPath = path.relative(process.cwd(), file);
                console.log(`${relPath}: ${injections.length} reference(s) injected`);
                for (const inj of injections) {
                    console.log(`  L${inj.line}: ${inj.name} -> ${inj.url}`);
                }

                if (!dryRun) {
                    const outPath = opts.output
                        ? path.join(path.resolve(opts.output), path.relative(path.resolve(opts.input), file))
                        : file;
                    fs.mkdirSync(path.dirname(outPath), { recursive: true });
                    fs.writeFileSync(outPath, fixed, 'utf8');
                }

                totalInjections += injections.length;
                filesModified++;
            }
        }

        console.log(`\n${filesModified} file(s) modified, ${totalInjections} cross-references injected${dryRun ? ' (dry run)' : ''}`);

    } catch (err) {
        console.error(`Failed to inject cross-references: ${err.message}`);
        process.exit(1);
    }
}

module.exports = { run, injectReferences, loadRegistry };

if (require.main === module) {
    const args = process.argv.slice(2);
    run(null, args, {}).catch(err => {
        console.error(err.message);
        process.exit(1);
    });
}