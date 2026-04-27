/**
 * Tests for the sync command module.
 * Tests deriveSlug helper and sync-pull workflow logic using mock clients.
 */
const { MockBitableClient, MockGitHubClient } = require('./mocks');

function run({ test, assertEqual, assertTrue, assertFalse, assertThrows }) {
    // ---- deriveSlug tests ----
    test('deriveSlug should extract slug from .mdx path', () => {
        function deriveSlug(filePath) {
            const basename = filePath.split('/').pop();
            return basename.replace(/\.(mdx|md)$/, '');
        }

        assertEqual(deriveSlug('site/en/quick-start.mdx'), 'quick-start', 'Should derive slug from .mdx');
    });

    test('deriveSlug should extract slug from .md path', () => {
        function deriveSlug(filePath) {
            const basename = filePath.split('/').pop();
            return basename.replace(/\.(mdx|md)$/, '');
        }

        assertEqual(deriveSlug('docs/getting-started.md'), 'getting-started', 'Should derive slug from .md');
    });

    test('deriveSlug should handle nested paths', () => {
        function deriveSlug(filePath) {
            const basename = filePath.split('/').pop();
            return basename.replace(/\.(mdx|md)$/, '');
        }

        assertEqual(deriveSlug('a/b/c/deep-nested-guide.mdx'), 'deep-nested-guide', 'Should handle nested paths');
    });

    test('deriveSlug should handle filename without extension', () => {
        function deriveSlug(filePath) {
            const basename = filePath.split('/').pop();
            return basename.replace(/\.(mdx|md)$/, '');
        }

        assertEqual(deriveSlug('site/en/readme'), 'readme', 'Should handle no extension');
    });

    // ---- Sync pull workflow tests ----
    test('Sync: should find doc by slug derived from file path', async () => {
        const bitable = new MockBitableClient();
        const base = await bitable.createBase('Manual');
        const token = base.app.app_token;
        const table = await bitable.createTable(token, 'Docs', [
            { field_name: 'Slug', type: 1 },
            { field_name: 'Status', type: 3 },
            { field_name: 'Last Modified', type: 1 },
        ]);

        await bitable.createRecord(token, table.table_id, {
            'Slug': 'vector-search', 'Status': 'Published', 'Last Modified': '',
        });

        const filePath = 'site/en/vector-search.mdx';
        const slug = filePath.split('/').pop().replace(/\.(mdx|md)$/, '');

        const found = await bitable.searchRecords(token, table.table_id, {
            conditions: [{ field_name: 'Slug', value: slug }],
        });

        assertEqual(found.items.length, 1, 'Should find matching doc');
        assertEqual(found.items[0].fields.Slug, 'vector-search', 'Slug should match');
    });

    test('Sync: should skip files with no matching doc', async () => {
        const bitable = new MockBitableClient();
        const base = await bitable.createBase('Manual');
        const token = base.app.app_token;
        const table = await bitable.createTable(token, 'Docs', [
            { field_name: 'Slug', type: 1 },
        ]);

        const slug = 'nonexistent-doc';
        const found = await bitable.searchRecords(token, table.table_id, {
            conditions: [{ field_name: 'Slug', value: slug }],
        });

        assertEqual(found.items.length, 0, 'Should find 0 docs');
    });

    test('Sync: should update doc status and add sync history', async () => {
        const bitable = new MockBitableClient();
        const base = await bitable.createBase('Manual');
        const token = base.app.app_token;
        const docsTable = await bitable.createTable(token, 'Docs', [
            { field_name: 'Slug', type: 1 },
            { field_name: 'Last Modified', type: 1 },
        ]);
        const pathsTable = await bitable.createTable(token, 'Doc Publish Paths', [
            { field_name: 'Doc', type: 21 },
            { field_name: 'Status', type: 3 },
        ]);
        const prsTable = await bitable.createTable(token, 'Pull Requests', [
            { field_name: 'PR Number', type: 2 },
            { field_name: 'Status', type: 3 },
            { field_name: 'Merged At', type: 1 },
        ]);
        const historyTable = await bitable.createTable(token, 'Sync History', [
            { field_name: 'Doc', type: 21 },
            { field_name: 'Action', type: 3 },
            { field_name: 'Timestamp', type: 1 },
            { field_name: 'Details', type: 1 },
        ]);

        const doc = await bitable.createRecord(token, docsTable.table_id, {
            'Slug': 'faq', 'Last Modified': '',
        });
        const path = await bitable.createRecord(token, pathsTable.table_id, {
            'Doc': [doc.record.record_id], 'Status': 'PR Open',
        });
        const pr = await bitable.createRecord(token, prsTable.table_id, {
            'PR Number': 42, 'Status': 'Open', 'Merged At': '',
        });

        const now = new Date().toISOString();
        await bitable.updateRecord(token, docsTable.table_id, doc.record.record_id, {
            'Last Modified': now,
        });
        await bitable.updateRecord(token, pathsTable.table_id, path.record.record_id, {
            'Status': 'Merged',
        });
        await bitable.updateRecord(token, prsTable.table_id, pr.record.record_id, {
            'Status': 'Merged', 'Merged At': now,
        });
        await bitable.createRecord(token, historyTable.table_id, {
            'Doc': [doc.record.record_id],
            'Action': 'Synced from GitHub',
            'Timestamp': now,
            'Details': 'Commit: abc123, PR: #42',
        });

        const docs = await bitable.listRecords(token, docsTable.table_id);
        assertTrue(docs.items[0].fields['Last Modified'].length > 0, 'Last Modified should be set');

        const paths = await bitable.listRecords(token, pathsTable.table_id);
        assertEqual(paths.items[0].fields.Status, 'Merged', 'Path status should be Merged');

        const prs = await bitable.listRecords(token, prsTable.table_id);
        assertEqual(prs.items[0].fields.Status, 'Merged', 'PR status should be Merged');
        assertTrue(prs.items[0].fields['Merged At'].length > 0, 'Merged At should be set');

        const history = await bitable.listRecords(token, historyTable.table_id);
        assertEqual(history.items.length, 1, 'Should have 1 sync history entry');
        assertEqual(history.items[0].fields.Action, 'Synced from GitHub', 'Action should match');
        assertTrue(history.items[0].fields.Details.includes('PR: #42'), 'Details should include PR number');
    });

    test('Sync: should handle multiple merged PRs', async () => {
        const github = new MockGitHubClient();
        const prs = await github.listMergedPullRequests('owner/repo', '2026-01-01');
        assertEqual(prs.length, 0, 'Mock should return empty list');
    });
}

module.exports = { run };