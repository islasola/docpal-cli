const OutputFormatter = require('../lib/output');

function run({ test, assertEqual, assertTrue }) {
    // ---- JSON output tests ----
    test('OutputFormatter: json format should output valid JSON', () => {
        const captured = captureStdout(() => {
            const fmt = new OutputFormatter('json');
            fmt.render({ name: 'Test', count: 5 });
        });
        const parsed = JSON.parse(captured);
        assertEqual(parsed.name, 'Test', 'Should output valid JSON with name');
        assertEqual(parsed.count, 5, 'Should output valid JSON with count');
    });

    test('OutputFormatter: json format with array', () => {
        const captured = captureStdout(() => {
            const fmt = new OutputFormatter('json');
            fmt.render([
                { slug: 'quick-start', status: 'Approved' },
                { slug: 'installation', status: 'Draft' },
            ]);
        });
        const parsed = JSON.parse(captured);
        assertEqual(parsed.length, 2, 'Should output array as JSON');
        assertEqual(parsed[0].slug, 'quick-start', 'First item slug should match');
    });

    test('OutputFormatter: json format with nested data', () => {
        const captured = captureStdout(() => {
            const fmt = new OutputFormatter('json');
            fmt.render({
                manual: { name: 'Milvus Docs' },
                docs: [{ slug: 'a' }, { slug: 'b' }],
                summary: { total: 2 },
            });
        });
        const parsed = JSON.parse(captured);
        assertEqual(parsed.manual.name, 'Milvus Docs', 'Nested object should be preserved');
        assertEqual(parsed.docs.length, 2, 'Nested array should be preserved');
    });

    // ---- Table output tests ----
    test('OutputFormatter: table format should output header and rows', () => {
        const captured = captureStdout(() => {
            const fmt = new OutputFormatter('table');
            fmt.render([
                { name: 'Alice', age: 30 },
                { name: 'Bob', age: 25 },
            ], [
                { key: 'name', label: 'NAME', width: 10 },
                { key: 'age', label: 'AGE', width: 5 },
            ]);
        });
        assertTrue(captured.includes('NAME'), 'Should include header NAME');
        assertTrue(captured.includes('AGE'), 'Should include header AGE');
        assertTrue(captured.includes('Alice'), 'Should include data Alice');
        assertTrue(captured.includes('Bob'), 'Should include data Bob');
    });

    test('OutputFormatter: table should handle empty data', () => {
        const captured = captureStdout(() => {
            const fmt = new OutputFormatter('table');
            fmt.render([], [
                { key: 'name', label: 'NAME', width: 10 },
            ]);
        });
        assertTrue(captured.includes('no results'), 'Should show no results message');
    });

    test('OutputFormatter: table with auto-width columns', () => {
        const captured = captureStdout(() => {
            const fmt = new OutputFormatter('table');
            fmt.render([
                { slug: 'quick-start' },
                { slug: 'very-long-slug-name-that-exceeds-default' },
            ], [
                { key: 'slug', label: 'SLUG' },
            ]);
        });
        assertTrue(captured.includes('SLUG'), 'Should include header');
        assertTrue(captured.includes('quick-start'), 'Should include short slug');
    });

    // ---- Text output tests ----
    test('OutputFormatter: text format with list items', () => {
        const captured = captureStdout(() => {
            const fmt = new OutputFormatter('text');
            fmt.render({
                items: [
                    { name: 'Test', slug: 'test' },
                ],
            }, [
                { key: 'name', label: 'NAME' },
                { key: 'slug', label: 'SLUG' },
            ]);
        });
        assertTrue(captured.includes('Test'), 'Should include item name');
    });

    test('OutputFormatter: text format with simple object', () => {
        const captured = captureStdout(() => {
            const fmt = new OutputFormatter('text');
            fmt.render({ doc_token: 'abc123', slug: 'my-doc' });
        });
        assertTrue(captured.includes('abc123'), 'Should include doc_token value');
        assertTrue(captured.includes('my-doc'), 'Should include slug value');
    });

    // ---- Progress messages go to stderr ----
    test('OutputFormatter: progress should write to stderr', () => {
        const captured = captureStderr(() => {
            const fmt = new OutputFormatter('text');
            fmt.progress('Processing...');
        });
        assertTrue(captured.includes('Processing...'), 'Progress should go to stderr');
    });

    // ---- Nested value extraction (bitable record fields) ----
    test('OutputFormatter: should extract values from bitable-style records', () => {
        const fmt = new OutputFormatter('json');
        const record = {
            record_id: 'rec1',
            fields: { Name: 'Test Manual', Slug: 'test-manual' },
        };
        // When rendering a record with fields, _getNestedValue should work
        const captured = captureStdout(() => {
            fmt.render(record);
        });
        const parsed = JSON.parse(captured);
        assertEqual(parsed.fields.Name, 'Test Manual', 'Should preserve fields.Name');
    });

    // ---- String column shorthand ----
    test('OutputFormatter: table with string column shorthand', () => {
        const captured = captureStdout(() => {
            const fmt = new OutputFormatter('table');
            fmt.render([
                { name: 'Alpha' },
                { name: 'Beta' },
            ], ['name']);
        });
        assertTrue(captured.includes('NAME'), 'Should use uppercase as label');
        assertTrue(captured.includes('Alpha'), 'Should include data');
    });
}

function captureStdout(fn) {
    const original = process.stdout.write;
    let captured = '';
    process.stdout.write = (data) => { captured += data; return true; };
    try {
        fn();
    } finally {
        process.stdout.write = original;
    }
    return captured;
}

function captureStderr(fn) {
    const original = process.stderr.write;
    let captured = '';
    process.stderr.write = (data) => { captured += data; return true; };
    try {
        fn();
    } finally {
        process.stderr.write = original;
    }
    return captured;
}

module.exports = { run };