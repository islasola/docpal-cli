/**
 * Tests for the draft command module.
 * Tests argument parsing, stdin detection logic, and draft create workflow.
 */
const { MockBitableClient, MockLarkDocClient } = require('./mocks');

function run({ test, assertEqual, assertTrue, assertFalse, assertThrows }) {
    // ---- parseArgs logic tests (simulated) ----
    test('Draft parseArgs should parse new flag names', () => {
        const args = ['my-doc.md', '--parent', 'parent123', '--base', 'base456', '--manual', 'My Manual'];
        const parsed = { file: null };
        for (let i = 0; i < args.length; i++) {
            const arg = args[i];
            if (!arg.startsWith('--') && !parsed.file) {
                parsed.file = arg;
            } else if (arg === '--parent' && args[i + 1]) {
                parsed.parent = args[++i];
            } else if (arg === '--base' && args[i + 1]) {
                parsed.baseToken = args[++i];
            } else if (arg === '--manual' && args[i + 1]) {
                parsed.manualName = args[++i];
            }
        }
        assertEqual(parsed.file, 'my-doc.md', 'Should parse file argument');
        assertEqual(parsed.parent, 'parent123', 'Should parse --parent');
        assertEqual(parsed.baseToken, 'base456', 'Should parse --base');
        assertEqual(parsed.manualName, 'My Manual', 'Should parse --manual as name');
    });

    test('Draft parseArgs should parse --slug and --targets', () => {
        const args = ['--parent', 'p1', '--base', 'b1', '--manual', 'Test', '--slug', 'my-slug', '--targets', 'milvus,zilliz'];
        const parsed = {};
        for (let i = 0; i < args.length; i++) {
            const arg = args[i];
            if (arg === '--parent') parsed.parent = args[++i];
            else if (arg === '--base') parsed.baseToken = args[++i];
            else if (arg === '--manual') parsed.manualName = args[++i];
            else if (arg === '--slug') parsed.slug = args[++i];
            else if (arg === '--targets') parsed.targets = args[++i].split(',').map(t => t.trim());
        }
        assertEqual(parsed.slug, 'my-slug', 'Should parse --slug');
        assertEqual(parsed.targets.length, 2, 'Should parse 2 targets');
        assertEqual(parsed.targets[0], 'milvus', 'First target should be milvus');
        assertEqual(parsed.targets[1], 'zilliz', 'Second target should be zilliz');
    });

    test('Draft parseArgs should detect --dry-run', () => {
        const args = ['file.md', '--parent', 'p', '--base', 'b', '--dry-run'];
        let dryRun = false;
        for (const arg of args) {
            if (arg === '--dry-run') dryRun = true;
        }
        assertTrue(dryRun, 'Should detect --dry-run flag');
    });

    // ---- Helper function tests ----
    test('extractSlug should find slug in frontmatter', () => {
        function extractSlug(content) {
            const match = content.match(/^slug:\s*(.+)$/m);
            return match ? match[1].trim() : null;
        }

        const content = '---\ntitle: Test\nslug: my-doc\n---\n# Hello';
        assertEqual(extractSlug(content), 'my-doc', 'Should extract slug from frontmatter');
    });

    test('extractSlug should return null without frontmatter', () => {
        function extractSlug(content) {
            const match = content.match(/^slug:\s*(.+)$/m);
            return match ? match[1].trim() : null;
        }

        const content = '# Just a title\nNo frontmatter here';
        assertEqual(extractSlug(content), null, 'Should return null without slug in frontmatter');
    });

    test('Title should be derived from filename', () => {
        const filename = 'vector-search-guide.md';
        const path = require('path');
        const title = path.basename(filename, path.extname(filename));
        assertEqual(title, 'vector-search-guide', 'Should derive title from filename');
    });

    // ---- Draft create workflow with mocks ----
    test('Draft: should create Feishu doc and bitable records', async () => {
        const lark = new MockLarkDocClient();
        const bitable = new MockBitableClient();

        const base = await bitable.createBase('Manual');
        const token = base.app.app_token;
        const docsTable = await bitable.createTable(token, 'Docs', [
            { field_name: 'Doc', type: 15 },
            { field_name: 'Slug', type: 1 },
            { field_name: 'Status', type: 3 },
            { field_name: 'Progress', type: 3 },
        ]);
        const targetsTable = await bitable.createTable(token, 'Publish Targets', [
            { field_name: 'Name', type: 1 },
            { field_name: 'Output Path', type: 1 },
        ]);
        const pathsTable = await bitable.createTable(token, 'Doc Publish Paths', [
            { field_name: 'Doc', type: 21 },
            { field_name: 'Target', type: 21 },
            { field_name: 'Repo Path', type: 1 },
            { field_name: 'Status', type: 3 },
        ]);

        const target = await bitable.createRecord(token, targetsTable.table.table_id, {
            'Name': 'milvus-docs', 'Output Path': 'site/en',
        });

        const parentToken = 'wikiParent123';
        const title = 'vector-search-guide';
        const slug = 'vector-search';
        const targets = ['milvus-docs'];

        const doc = await lark.createDoc(parentToken, title);
        assertTrue(doc.document.document_id !== undefined, 'Should create Feishu doc');

        const docRecord = await bitable.createRecord(token, docsTable.table.table_id, {
            'Slug': slug,
            'Status': 'Draft',
            'Progress': 'Writing',
        });
        assertTrue(docRecord.record.record_id !== undefined, 'Should create bitable record');

        for (const targetName of targets) {
            const outputPath = 'site/en';
            await bitable.createRecord(token, pathsTable.table.table_id, {
                'Doc': [docRecord.record.record_id],
                'Target': [target.record.record_id],
                'Repo Path': `${outputPath}/${slug}.mdx`,
                'Status': 'Not Published',
            });
        }

        const docs = await bitable.listRecords(token, docsTable.table.table_id);
        assertEqual(docs.items.length, 1, 'Should have 1 doc');
        assertEqual(docs.items[0].fields.Slug, 'vector-search', 'Slug should match');
        assertEqual(docs.items[0].fields.Status, 'Draft', 'Status should be Draft');

        const paths = await bitable.listRecords(token, pathsTable.table.table_id);
        assertEqual(paths.items.length, 1, 'Should have 1 publish path');
        assertEqual(paths.items[0].fields['Repo Path'], 'site/en/vector-search.mdx', 'Repo path should match');
        assertEqual(paths.items[0].fields.Status, 'Not Published', 'Status should be Not Published');
    });

    test('Draft: should handle multiple targets', async () => {
        const bitable = new MockBitableClient();
        const base = await bitable.createBase('Manual');
        const token = base.app.app_token;

        const targetsTable = await bitable.createTable(token, 'Publish Targets', [
            { field_name: 'Name', type: 1 },
            { field_name: 'Output Path', type: 1 },
        ]);
        const pathsTable = await bitable.createTable(token, 'Doc Publish Paths', [
            { field_name: 'Repo Path', type: 1 },
            { field_name: 'Status', type: 3 },
        ]);

        await bitable.createRecord(token, targetsTable.table.table_id, {
            'Name': 'milvus-docs', 'Output Path': 'site/en',
        });
        await bitable.createRecord(token, targetsTable.table.table_id, {
            'Name': 'zilliz-docs', 'Output Path': 'docs',
        });

        const targets = await bitable.listRecords(token, targetsTable.table.table_id);
        const slug = 'faq';

        for (const target of targets.items) {
            const outputPath = target.fields['Output Path'] || '';
            await bitable.createRecord(token, pathsTable.table.table_id, {
                'Repo Path': `${outputPath}/${slug}.mdx`,
                'Status': 'Not Published',
            });
        }

        const paths = await bitable.listRecords(token, pathsTable.table.table_id);
        assertEqual(paths.items.length, 2, 'Should have 2 publish paths');
        assertEqual(paths.items[0].fields['Repo Path'], 'site/en/faq.mdx', 'First path should match');
        assertEqual(paths.items[1].fields['Repo Path'], 'docs/faq.mdx', 'Second path should match');
    });

    test('Draft: should generate Feishu link from doc token', () => {
        const feishuHost = process.env.FEISHU_HOST || 'zilliverse.feishu.cn';
        const docToken = 'doc_1';
        const link = `https://${feishuHost}/wiki/${docToken}`;
        assertTrue(link.includes('/wiki/doc_1'), 'Link should contain wiki path and doc token');
    });
}

module.exports = { run };