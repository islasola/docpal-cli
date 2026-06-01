const fs = require('fs');
const path = require('path');

const colors = {
    green: '\x1b[32m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    reset: '\x1b[0m'
};

let passed = 0;
let failed = 0;

function runSingleTest(name, fn) {
    return Promise.resolve().then(() => fn()).then(() => {
        console.log(`${colors.green}PASS${colors.reset} ${name}`);
        passed++;
    }).catch(err => {
        console.log(`${colors.red}FAIL${colors.reset} ${name}`);
        console.log(`  ${err.message}`);
        if (err.stack) {
            console.log(`  ${err.stack.split('\n').slice(1, 3).join('\n  ')}`);
        }
        failed++;
    });
}

function assertEqual(actual, expected, message) {
    if (actual !== expected) {
        throw new Error(`${message || 'Assertion failed'}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
    }
}

function assertTrue(value, message) {
    if (!value) {
        throw new Error(`${message || 'Assertion failed'}: expected truthy, got ${JSON.stringify(value)}`);
    }
}

function assertFalse(value, message) {
    if (value) {
        throw new Error(`${message || 'Assertion failed'}: expected falsy, got ${JSON.stringify(value)}`);
    }
}

function assertDeepEqual(actual, expected, message) {
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
        throw new Error(`${message || 'Assertion failed'}:\n  expected ${JSON.stringify(expected)}\n  got      ${JSON.stringify(actual)}`);
    }
}

function assertThrows(fn, message) {
    let threw = false;
    try {
        fn();
    } catch (err) {
        threw = true;
    }
    if (!threw) {
        throw new Error(`${message || 'Assertion failed'}: expected function to throw`);
    }
}

async function runTestFile(filePath) {
    const relativePath = path.relative(process.cwd(), filePath);
    console.log(`\n${colors.yellow}Running ${relativePath}${colors.reset}`);

    delete require.cache[require.resolve(filePath)];
    const queuedTests = [];
    const test = (name, fn) => {
        queuedTests.push({ name, fn });
    };

    try {
        const testModule = require(filePath);
        if (typeof testModule.run === 'function') {
            await testModule.run({ test, assertEqual, assertTrue, assertFalse, assertDeepEqual, assertThrows });
        }
    } catch (err) {
        console.log(`${colors.red}ERROR${colors.reset} ${relativePath}`);
        console.log(`  ${err.message}`);
        failed++;
        return;
    }

    for (const { name, fn } of queuedTests) {
        await runSingleTest(name, fn);
    }
}

async function main() {
    console.log(`${colors.yellow}=== Docpal CLI Test Suite ===${colors.reset}\n`);

    const testDir = path.join(__dirname);
    const files = fs.readdirSync(testDir)
        .filter(f => f.endsWith('.test.js'))
        .map(f => path.join(testDir, f));

    function findTests(dir) {
        const items = fs.readdirSync(dir);
        for (const item of items) {
            const fullPath = path.join(dir, item);
            const stat = fs.statSync(fullPath);
            if (stat.isDirectory()) {
                findTests(fullPath);
            } else if (item.endsWith('.test.js')) {
                files.push(fullPath);
            }
        }
    }

    findTests(testDir);

    const uniqueFiles = [...new Set(files)];

    for (const file of uniqueFiles) {
        await runTestFile(file);
    }

    console.log(`\n${colors.yellow}=== Results ===${colors.reset}`);
    console.log(`${colors.green}Passed: ${passed}${colors.reset}`);
    console.log(`${colors.red}Failed: ${failed}${colors.reset}`);
    console.log(`Total: ${passed + failed}`);

    process.exit(failed > 0 ? 1 : 0);
}

main();
