#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const USAGE = `
Usage: node audit-doc-quality.js [options]

Audit MDX document quality: check for missing examples, TODO markers,
broken frontmatter, short pages, and stale content.

Options:
  --input <dir>        Input directory containing MDX files (default: ./docs)
  --pattern <glob>     File pattern to match (default: **/*.mdx)
  --check <checks>     Comma-separated checks: todos,examples,frontmatter,short,stale
                       (default: all checks)
  --min-length <n>     Minimum content length for "short page" check (default: 100)
  --format <fmt>       Output format: text, json (default: text)
  -h, --help           Show this help

Checks:
  todos        - Find <!-- TODO --> markers and TODO: comments
  examples     - Find docs missing ## Examples section
  frontmatter  - Validate YAML frontmatter (title, slug required)
  short        - Find pages with less than --min-length characters of body content
  stale        - Find docs with deprecated_since or stale markers

Examples:
  node audit-doc-quality.js --input ./docs
  node audit-doc-quality.js --input ./docs --check todos,examples --format json
`;

function parseArgs(args) {
    const opts = {
        input: './docs',
        pattern: '**/*.mdx',
        check: 'todos,examples,frontmatter,short,stale',
        minLength: 100,
        format: 'text'
    };
    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--input' && args[i + 1]) opts.input = args[++i];
        else if (args[i] === '--pattern' && args[i + 1]) opts.pattern = args[++i];
        else if (args[i] === '--check' && args[i + 1]) opts.check = args[++i];
        else if (args[i] === '--min-length' && args[i + 1]) opts.minLength = parseInt(args[++i], 10);
        else if (args[i] === '--format' && args[i + 1]) opts.format = args[++i];
        else if (args[i] === '-h' || args[i] === '--help') { console.log(USAGE); process.exit(0); }
    }
    opts.checks = opts.check.split(',').map(s => s.trim());
    return opts;
}

function parseFrontMatter(content) {
    const match = content.match(/^---\n([\s\S]*?)\n---/);
    if (!match) return null;
    const yaml = match[1];
    const fm = {};
    const lines = yaml.split('\n');
    for (const line of lines) {
        const colonIdx = line.indexOf(':');
        if (colonIdx > 0) {
            const key = line.substring(0, colonIdx).trim();
            let value = line.substring(colonIdx + 1).trim();
            if (value.startsWith('[') && value.endsWith(']')) {
                value = value.slice(1, -1).split(',').map(s => s.trim().replace(/^['"]|['"]$/g, ''));
            } else if (value === 'true') {
                value = true;
            } else if (value === 'false') {
                value = false;
            }
            fm[key] = value;
        }
    }
    return { frontMatter: fm, bodyStart: match[0].length };
}

function checkTodos(content, relPath) {
    const issues = [];
    const todoRegex = /<!--\s*TODO:?\s*(.*?)\s*-->|\/\/\s*TODO:?\s*(.*?)(?:\n|$)/gi;
    let match;
    while ((match = todoRegex.exec(content)) !== null) {
        const line = content.substring(0, match.index).split('\n').length;
        issues.push({ file: relPath, line, message: match[1] || match[2] || 'TODO marker', check: 'todos' });
    }
    const todoHeaderCodeRegex = /^#\s+.*TODO.*$/gm;
    while ((match = todoHeaderCodeRegex.exec(content)) !== null) {
        const line = content.substring(0, match.index).split('\n').length;
        issues.push({ file: relPath, line, message: 'TODO in heading', check: 'todos' });
    }
    return issues;
}

function checkExamples(content, relPath) {
    const issues = [];
    const bodyStart = content.startsWith('---') ? (content.indexOf('---', 3) + 3) : 0;
    const body = content.substring(bodyStart);
    const hasExamples = /^##\s+Example/i.test(body) || /^##\s+Examples/i.test(body);
    if (!hasExamples && body.length > 200) {
        issues.push({ file: relPath, line: 0, message: 'Missing ## Examples section', check: 'examples' });
    }
    return issues;
}

function checkFrontMatter(content, relPath) {
    const issues = [];
    const parsed = parseFrontMatter(content);
    if (!parsed) {
        issues.push({ file: relPath, line: 1, message: 'Missing YAML frontmatter', check: 'frontmatter' });
        return issues;
    }
    if (!parsed.frontMatter.title) {
        issues.push({ file: relPath, line: 1, message: 'Missing title in frontmatter', check: 'frontmatter' });
    }
    if (!parsed.frontMatter.slug) {
        issues.push({ file: relPath, line: 1, message: 'Missing slug in frontmatter', check: 'frontmatter' });
    }
    return issues;
}

function checkShort(content, relPath, minLength) {
    const issues = [];
    const bodyStart = content.startsWith('---') ? (content.indexOf('---', 3) + 3) : 0;
    const body = content.substring(bodyStart).trim();
    const textOnly = body.replace(/[#*_`\[\]()>|~-]/g, '').replace(/\n+/g, ' ').trim();
    if (textOnly.length < minLength && textOnly.length > 0) {
        issues.push({ file: relPath, line: 0, message: `Short page: ${textOnly.length} chars (min: ${minLength})`, check: 'short' });
    }
    return issues;
}

function checkStale(content, relPath) {
    const issues = [];
    const parsed = parseFrontMatter(content);
    if (parsed && parsed.frontMatter) {
        if (parsed.frontMatter.deprecated_since || parsed.frontMatter.deprecatedSince) {
            issues.push({
                file: relPath, line: 0,
                message: `Deprecated since: ${parsed.frontMatter.deprecated_since || parsed.frontMatter.deprecatedSince}`,
                check: 'stale'
            });
        }
    }
    const staleRegex = /\b(deprecated|obsolete|legacy|no longer supported)\b/i;
    const bodyStart = content.startsWith('---') ? (content.indexOf('---', 3) + 3) : 0;
    const body = content.substring(bodyStart);
    const match = staleRegex.exec(body);
    if (match) {
        const line = body.substring(0, match.index).split('\n').length;
        issues.push({ file: relPath, line, message: `Stale content: "${match[0]}"`, check: 'stale' });
    }
    return issues;
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

        console.log(`Auditing ${files.length} MDX file(s)...\n`);

        const allIssues = [];

        for (const file of files) {
            const content = fs.readFileSync(file, 'utf8');
            const relPath = path.relative(process.cwd(), file);

            if (opts.checks.includes('todos')) allIssues.push(...checkTodos(content, relPath));
            if (opts.checks.includes('examples')) allIssues.push(...checkExamples(content, relPath));
            if (opts.checks.includes('frontmatter')) allIssues.push(...checkFrontMatter(content, relPath));
            if (opts.checks.includes('short')) allIssues.push(...checkShort(content, relPath, opts.minLength));
            if (opts.checks.includes('stale')) allIssues.push(...checkStale(content, relPath));
        }

        if (opts.format === 'json') {
            console.log(JSON.stringify(allIssues, null, 2));
        } else {
            const byCheck = {};
            for (const issue of allIssues) {
                if (!byCheck[issue.check]) byCheck[issue.check] = [];
                byCheck[issue.check].push(issue);
            }

            for (const [check, issues] of Object.entries(byCheck)) {
                console.log(`\n=== ${check.toUpperCase()} (${issues.length}) ===`);
                for (const issue of issues) {
                    console.log(`  ${issue.file}:${issue.line} - ${issue.message}`);
                }
            }

            console.log(`\nTotal: ${allIssues.length} issue(s) in ${files.length} file(s)`);
        }

    } catch (err) {
        console.error(`Audit failed: ${err.message}`);
        process.exit(1);
    }
}

module.exports = { run, checkTodos, checkExamples, checkFrontMatter, checkShort, checkStale, parseFrontMatter };

if (require.main === module) {
    const args = process.argv.slice(2);
    run(null, args, {}).catch(err => {
        console.error(err.message);
        process.exit(1);
    });
}