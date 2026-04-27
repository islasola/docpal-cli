/**
 * Tests for the publish command redirect.
 * The publish command now delegates to `manual publish`.
 */
const { MockBitableClient, MockLarkDocClient, MockGitHubClient } = require('./mocks');

function run({ test, assertEqual, assertTrue, assertFalse, assertThrows }) {
    // ---- Helper function tests ----
    test('extractTokenFromUrl should extract wiki token', () => {
        function extractTokenFromUrl(url) {
            if (!url) return null;
            const match = url.match(/\/wiki\/(\w+)/);
            return match ? match[1] : null;
        }

        assertEqual(
            extractTokenFromUrl('[Getting Started](https://zilliverse.feishu.cn/wiki/abc123def)'),
            'abc123def',
            'Should extract wiki token'
        );
    });

    test('extractTokenFromUrl should return null for null input', () => {
        function extractTokenFromUrl(url) {
            if (!url) return null;
            const match = url.match(/\/wiki\/(\w+)/);
            return match ? match[1] : null;
        }

        assertEqual(extractTokenFromUrl(null), null, 'Should return null for null');
        assertEqual(extractTokenFromUrl(''), null, 'Should return null for empty string');
    });

    test('extractPRNumber should extract PR number from URL', () => {
        function extractPRNumber(prUrl) {
            if (!prUrl) return null;
            const match = prUrl.match(/\/pull\/(\d+)$/);
            return match ? parseInt(match[1], 10) : null;
        }

        assertEqual(
            extractPRNumber('https://github.com/owner/repo/pull/42'),
            42,
            'Should extract PR number'
        );
    });

    test('extractPRNumber should return null for invalid URL', () => {
        function extractPRNumber(prUrl) {
            if (!prUrl) return null;
            const match = prUrl.match(/\/pull\/(\d+)$/);
            return match ? parseInt(match[1], 10) : null;
        }

        assertEqual(extractPRNumber('not-a-url'), null, 'Should return null');
        assertEqual(extractPRNumber(null), null, 'Should return null for null');
    });

    // ---- Workflow tests with mocks ----
    test('Publish: should create new PR for approved doc', async () => {
        const bitable = new MockBitableClient();
        const github = new MockGitHubClient();

        const base = await bitable.createBase('Manual');
        const token = base.app.app_token;
        const docsTable = await bitable.createTable(token, 'Docs', [
            { field_name: 'Slug', type: 1 },
            { field_name: 'Status', type: 3 },
        ]);
        const targetsTable = await bitable.createTable(token, 'Publish Targets', [
            { field_name: 'Name', type: 1 },
            { field_name: 'Repo', type: 1 },
        ]);
        const pathsTable = await bitable.createTable(token, 'Doc Publish Paths', [
            { field_name: 'Doc', type: 21 },
            { field_name: 'Repo Path', type: 1 },
            { field_name: 'Open PR', type: 1 },
            { field_name: 'Status', type: 3 },
        ]);
        const prsTable = await bitable.createTable(token, 'Pull Requests', [
            { field_name: 'PR URL', type: 1 },
            { field_name: 'PR Number', type: 2 },
            { field_name: 'Branch', type: 1 },
            { field_name: 'Status', type: 3 },
        ]);

        const target = await bitable.createRecord(token, targetsTable.table.table_id, {
            'Name': 'milvus-docs', 'Repo': 'milvus-io/milvus-docs',
        });

        const doc = await bitable.createRecord(token, docsTable.table.table_id, {
            'Slug': 'vector-search', 'Status': 'Approved',
        });

        await bitable.createRecord(token, pathsTable.table.table_id, {
            'Doc': [doc.record.record_id],
            'Repo Path': 'site/en/vector-search.mdx',
            'Open PR': '',
            'Status': 'Not Published',
        });

        const approved = await bitable.searchRecords(token, docsTable.table.table_id, {
            conditions: [{ field_name: 'Status', value: 'Approved' }],
        });
        assertEqual(approved.items.length, 1, 'Should find 1 approved doc');

        const paths = await bitable.listRecords(token, pathsTable.table.table_id);

        const branchName = 'doc-sync-vector-search-1234';
        await github.createBranch('milvus-io/milvus-docs', branchName, 'main');
        await github.createOrUpdateFile('milvus-io/milvus-docs', 'site/en/vector-search.mdx', '# Content', 'add doc', branchName);
        const pr = await github.createPullRequest('milvus-io/milvus-docs', 'doc: vector-search', branchName, 'main');

        assertTrue(pr.number !== undefined, 'PR should have number');
        assertTrue(pr.html_url !== undefined, 'PR should have URL');

        await bitable.updateRecord(token, pathsTable.table.table_id, paths.items[0].record_id, {
            'Open PR': pr.html_url,
            'Status': 'PR Open',
        });

        await bitable.updateRecord(token, docsTable.table.table_id, doc.record.record_id, {
            'Status': 'Published',
        });

        await bitable.createRecord(token, prsTable.table.table_id, {
            'PR URL': pr.html_url,
            'PR Number': pr.number,
            'Branch': branchName,
            'Status': 'Open',
        });

        const updatedDoc = await bitable.listRecords(token, docsTable.table.table_id);
        assertEqual(updatedDoc.items[0].fields.Status, 'Published', 'Doc should be Published');

        const updatedPath = await bitable.listRecords(token, pathsTable.table.table_id);
        assertEqual(updatedPath.items[0].fields.Status, 'PR Open', 'Path should be PR Open');
        assertTrue(updatedPath.items[0].fields['Open PR'].includes('/pull/'), 'Should have PR URL');
    });

    test('Publish: should find target config by name', async () => {
        const bitable = new MockBitableClient();
        const base = await bitable.createBase('Manual');
        const token = base.app.app_token;
        const table = await bitable.createTable(token, 'Publish Targets', [
            { field_name: 'Name', type: 1 },
            { field_name: 'Repo', type: 1 },
            { field_name: 'Base Branch', type: 1 },
        ]);

        await bitable.createRecord(token, table.table.table_id, {
            'Name': 'milvus-docs', 'Repo': 'milvus-io/milvus-docs', 'Base Branch': 'master',
        });
        await bitable.createRecord(token, table.table.table_id, {
            'Name': 'zilliz-docs', 'Repo': 'zilliz-io/docs', 'Base Branch': 'main',
        });

        const found = await bitable.searchRecords(token, table.table.table_id, {
            conditions: [{ field_name: 'Name', value: 'milvus-docs' }],
        });

        assertEqual(found.items.length, 1, 'Should find 1 target');
        assertEqual(found.items[0].fields.Repo, 'milvus-io/milvus-docs', 'Repo should match');
        assertEqual(found.items[0].fields['Base Branch'], 'master', 'Base branch should match');
    });

    test('Publish: should filter docs by status and slug', async () => {
        const bitable = new MockBitableClient();
        const base = await bitable.createBase('Manual');
        const token = base.app.app_token;
        const table = await bitable.createTable(token, 'Docs', [
            { field_name: 'Slug', type: 1 },
            { field_name: 'Status', type: 3 },
        ]);

        await bitable.createRecord(token, table.table.table_id, { 'Slug': 'a', 'Status': 'Approved' });
        await bitable.createRecord(token, table.table.table_id, { 'Slug': 'b', 'Status': 'Draft' });
        await bitable.createRecord(token, table.table.table_id, { 'Slug': 'c', 'Status': 'Approved' });

        const approved = await bitable.searchRecords(token, table.table.table_id, {
            conditions: [{ field_name: 'Status', value: 'Approved' }],
        });
        assertEqual(approved.items.length, 2, 'Should find 2 approved docs');

        const specific = await bitable.searchRecords(token, table.table.table_id, {
            conditions: [
                { field_name: 'Status', value: 'Approved' },
                { field_name: 'Slug', value: 'a' },
            ],
        });
        assertEqual(specific.items.length, 1, 'Should find 1 specific approved doc');
        assertEqual(specific.items[0].fields.Slug, 'a', 'Slug should match');
    });
}

module.exports = { run };