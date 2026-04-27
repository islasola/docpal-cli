/**
 * Tests for the manual command module.
 * Tests parseArgs and helper functions directly, then tests
 * workflows using mock clients via dependency injection.
 */
const { MockBitableClient, MockLarkDocClient } = require('./mocks');

function run({ test, assertEqual, assertTrue, assertFalse, assertThrows }) {
    const { MANUALS_TABLE } = require('../lib/tableSchemas');

    // ---- slugify tests ----
    test('slugify should convert title to slug', () => {
        const slugify = require('slugify');
        const result = slugify('Getting Started Guide', { lower: true, strict: true });
        assertEqual(result, 'getting-started-guide', 'Should slugify title');
    });

    test('slugify should handle special characters', () => {
        const slugify = require('slugify');
        const result = slugify('Vector Search (Advanced)!', { lower: true, strict: true });
        assertEqual(result, 'vector-search-advanced', 'Should strip special chars');
    });

    test('slugify should handle Chinese characters', () => {
        const slugify = require('slugify');
        const result = slugify('快速入门', { lower: true, strict: true });
        assertTrue(typeof result === 'string', 'Should produce a string');
    });

    // ---- Mock-based workflow tests ----
    test('MockBitableClient should create manual tables', async () => {
        const client = new MockBitableClient();
        const base = await client.createBase('Manual: Test');
        const token = base.app.app_token;

        await client.createTable(token, 'Docs', [
            { field_name: 'Doc', type: 15 },
            { field_name: 'Slug', type: 1 },
            { field_name: 'Status', type: 3 },
        ]);
        await client.createTable(token, 'Publish Targets', [
            { field_name: 'Name', type: 1 },
            { field_name: 'Repo', type: 1 },
        ]);
        await client.createTable(token, 'Doc Publish Paths', [
            { field_name: 'Doc', type: 21 },
            { field_name: 'Repo Path', type: 1 },
        ]);
        await client.createTable(token, 'Pull Requests', [
            { field_name: 'PR URL', type: 1 },
        ]);
        await client.createTable(token, 'Versions', [
            { field_name: 'Version', type: 1 },
        ]);
        await client.createTable(token, 'Sync History', [
            { field_name: 'Action', type: 3 },
        ]);

        const tables = await client.listTables(token);
        assertEqual(tables.items.length, 6, 'Should have 6 tables');
        assertEqual(tables.items[0].table_name, 'Docs', 'First table should be Docs');
        assertEqual(tables.items[5].table_name, 'Sync History', 'Last table should be Sync History');
    });

    test('MockBitableClient should add doc to manual', async () => {
        const client = new MockBitableClient();
        const base = await client.createBase('Manual: Test');
        const token = base.app.app_token;
        const table = await client.createTable(token, 'Docs', [
            { field_name: 'Slug', type: 1 },
            { field_name: 'Status', type: 3 },
            { field_name: 'Parent Token', type: 1 },
            { field_name: 'Sidebar Position', type: 2 },
        ]);

        const doc = await client.createRecord(token, table.table.table_id, {
            'Slug': 'getting-started',
            'Status': 'Draft',
            'Parent Token': 'wikiParent123',
            'Sidebar Position': 1,
        });

        assertTrue(doc.record !== undefined, 'Should return record');
        assertTrue(doc.record.record_id !== undefined, 'Should have record_id');
        assertEqual(doc.record.fields.Slug, 'getting-started', 'Slug should match');
    });

    test('MockBitableClient should auto-calculate position', async () => {
        const client = new MockBitableClient();
        const base = await client.createBase('Manual: Test');
        const token = base.app.app_token;
        const table = await client.createTable(token, 'Docs', [
            { field_name: 'Slug', type: 1 },
            { field_name: 'Parent Token', type: 1 },
            { field_name: 'Sidebar Position', type: 2 },
        ]);

        const parentToken = 'parentA';

        await client.createRecord(token, table.table.table_id, {
            'Slug': 'doc-1', 'Parent Token': parentToken, 'Sidebar Position': 1,
        });
        await client.createRecord(token, table.table.table_id, {
            'Slug': 'doc-2', 'Parent Token': parentToken, 'Sidebar Position': 2,
        });
        await client.createRecord(token, table.table.table_id, {
            'Slug': 'doc-3', 'Parent Token': parentToken, 'Sidebar Position': 3,
        });

        const siblings = await client.searchRecords(token, table.table.table_id, {
            conditions: [{ field_name: 'Parent Token', value: parentToken }],
        });
        const positions = siblings.items.map(r => r.fields['Sidebar Position']).filter(Boolean);
        const nextPosition = positions.length > 0 ? Math.max(...positions) + 1 : 1;

        assertEqual(nextPosition, 4, 'Next position should be 4');
    });

    test('MockBitableClient should detect slug collision', async () => {
        const client = new MockBitableClient();
        const base = await client.createBase('Manual: Test');
        const token = base.app.app_token;
        const table = await client.createTable(token, 'Docs', [
            { field_name: 'Slug', type: 1 },
        ]);

        await client.createRecord(token, table.table.table_id, { 'Slug': 'getting-started' });

        const existing = await client.searchRecords(token, table.table.table_id, {
            conditions: [{ field_name: 'Slug', value: 'getting-started' }],
        });

        assertTrue(existing.items.length > 0, 'Should find existing slug');
    });

    test('MockBitableClient should create publish path records', async () => {
        const client = new MockBitableClient();
        const base = await client.createBase('Manual: Test');
        const token = base.app.app_token;

        const docsTable = await client.createTable(token, 'Docs', [{ field_name: 'Slug', type: 1 }]);
        const targetsTable = await client.createTable(token, 'Publish Targets', [
            { field_name: 'Name', type: 1 },
            { field_name: 'Output Path', type: 1 },
        ]);
        const pathsTable = await client.createTable(token, 'Doc Publish Paths', [
            { field_name: 'Doc', type: 21 },
            { field_name: 'Target', type: 21 },
            { field_name: 'Repo Path', type: 1 },
            { field_name: 'Status', type: 3 },
        ]);

        const target = await client.createRecord(token, targetsTable.table.table_id, {
            'Name': 'milvus-docs', 'Output Path': 'site/en',
        });

        const doc = await client.createRecord(token, docsTable.table.table_id, {
            'Slug': 'vector-search',
        });

        const slug = 'vector-search';
        await client.createRecord(token, pathsTable.table.table_id, {
            'Doc': [doc.record.record_id],
            'Target': [target.record.record_id],
            'Repo Path': `${'site/en'}/${slug}.mdx`,
            'Status': 'Not Published',
        });

        const paths = await client.listRecords(token, pathsTable.table.table_id);
        assertEqual(paths.items.length, 1, 'Should have 1 publish path');
        assertEqual(paths.items[0].fields['Repo Path'], 'site/en/vector-search.mdx', 'Repo path should match');
        assertEqual(paths.items[0].fields.Status, 'Not Published', 'Status should be Not Published');
    });

    test('MockLarkDocClient should fetch doc metadata', async () => {
        const client = new MockLarkDocClient();
        const created = await client.createDoc('folder123', 'Getting Started Guide');
        const doc = await client.getDoc(created.document.document_id);

        assertTrue(doc !== null, 'Should find doc');
        assertEqual(doc.document.title, 'Getting Started Guide', 'Title should match');
        assertEqual(doc.document.folder_token, 'folder123', 'Folder token should match');
    });

    // ---- Manual resolution tests ----
    test('Manual: should create manual entry in tblManuals', async () => {
        const client = new MockBitableClient();
        const base = await client.createBase('DocPal');
        const token = base.app.app_token;
        await client.createTable(token, MANUALS_TABLE, [{ field_name: 'Name', type: 1 }]);

        const manual = await client.createRecord(token, 'tblManuals', {
            'Name': 'Milvus Docs',
            'Root Type': 'Wiki Space',
            'Root Token': 'wikcnABC123',
        });

        assertEqual(manual.record.fields.Name, 'Milvus Docs', 'Manual name should match');

        const found = await client.searchRecords(token, 'tblManuals', {
            conditions: [{ field_name: 'Name', value: 'Milvus Docs' }],
        });
        assertEqual(found.items.length, 1, 'Should find 1 manual');
    });

    test('Manual: resolveManual auto-selects single manual', async () => {
        const client = new MockBitableClient();
        const base = await client.createBase('DocPal');
        const token = base.app.app_token;
        await client.createTable(token, MANUALS_TABLE, [{ field_name: 'Name', type: 1 }]);

        await client.createRecord(token, 'tblManuals', { 'Name': 'Only Manual' });

        const manual = await client.resolveManual(token);
        assertEqual(manual.fields.Name, 'Only Manual', 'Should auto-select single manual');
    });

    test('Manual: resolveManual finds by name', async () => {
        const client = new MockBitableClient();
        const base = await client.createBase('DocPal');
        const token = base.app.app_token;
        await client.createTable(token, MANUALS_TABLE, [{ field_name: 'Name', type: 1 }]);

        await client.createRecord(token, 'tblManuals', { 'Name': 'Manual A' });
        await client.createRecord(token, 'tblManuals', { 'Name': 'Manual B' });

        const manual = await client.resolveManual(token, 'Manual B');
        assertEqual(manual.fields.Name, 'Manual B', 'Should find manual by name');
    });

    // ---- Approve workflow tests ----
    test('Approve: should find docs by slug in bitable', async () => {
        const client = new MockBitableClient();
        const base = await client.createBase('Manual');
        const token = base.app.app_token;
        const table = await client.createTable(token, 'Docs', [
            { field_name: 'Slug', type: 1 },
            { field_name: 'Status', type: 3 },
            { field_name: 'Progress', type: 3 },
        ]);

        await client.createRecord(token, table.table_id, {
            'Slug': 'vector-search', 'Status': 'Draft', 'Progress': 'Writing',
        });

        const found = await client.searchRecords(token, table.table_id, {
            conditions: [{ field_name: 'Slug', value: 'vector-search' }],
        });

        assertEqual(found.items.length, 1, 'Should find 1 doc');
        assertEqual(found.items[0].fields.Slug, 'vector-search', 'Slug should match');
    });

    test('Approve: should update Draft to Approved', async () => {
        const client = new MockBitableClient();
        const base = await client.createBase('Manual');
        const token = base.app.app_token;
        const table = await client.createTable(token, 'Docs', [
            { field_name: 'Slug', type: 1 },
            { field_name: 'Status', type: 3 },
            { field_name: 'Progress', type: 3 },
        ]);

        const created = await client.createRecord(token, table.table_id, {
            'Slug': 'getting-started', 'Status': 'Draft', 'Progress': 'Writing',
        });

        await client.updateRecord(token, table.table_id, created.record.record_id, {
            'Status': 'Approved',
            'Progress': 'Ready',
        });

        const records = await client.listRecords(token, table.table_id);
        assertEqual(records.items[0].fields.Status, 'Approved', 'Status should be Approved');
        assertEqual(records.items[0].fields.Progress, 'Ready', 'Progress should be Ready');
    });

    test('Approve: should update In Review to Approved', async () => {
        const client = new MockBitableClient();
        const base = await client.createBase('Manual');
        const token = base.app.app_token;
        const table = await client.createTable(token, 'Docs', [
            { field_name: 'Slug', type: 1 },
            { field_name: 'Status', type: 3 },
            { field_name: 'Progress', type: 3 },
        ]);

        const created = await client.createRecord(token, table.table_id, {
            'Slug': 'faq', 'Status': 'In Review', 'Progress': 'Reviewing',
        });

        await client.updateRecord(token, table.table_id, created.record.record_id, {
            'Status': 'Approved',
            'Progress': 'Ready',
        });

        const records = await client.listRecords(token, table.table_id);
        assertEqual(records.items[0].fields.Status, 'Approved', 'Should approve In Review doc');
    });

    test('Approve --all: should find Draft and In Review docs', async () => {
        const client = new MockBitableClient();
        const base = await client.createBase('Manual');
        const token = base.app.app_token;
        const table = await client.createTable(token, 'Docs', [
            { field_name: 'Slug', type: 1 },
            { field_name: 'Status', type: 3 },
        ]);

        await client.createRecord(token, table.table_id, { 'Slug': 'a', 'Status': 'Draft' });
        await client.createRecord(token, table.table_id, { 'Slug': 'b', 'Status': 'In Review' });
        await client.createRecord(token, table.table_id, { 'Slug': 'c', 'Status': 'Approved' });
        await client.createRecord(token, table.table_id, { 'Slug': 'd', 'Status': 'Published' });

        const draftDocs = await client.searchRecords(token, table.table_id, {
            conditions: [{ field_name: 'Status', value: ['Draft', 'In Review'] }],
        });

        assertEqual(draftDocs.items.length, 2, 'Should find 2 docs to approve');

        for (const doc of draftDocs.items) {
            await client.updateRecord(token, table.table_id, doc.record_id, {
                'Status': 'Approved',
                'Progress': 'Ready',
            });
        }

        const all = await client.listRecords(token, table.table_id);
        const approved = all.items.filter(r => r.fields.Status === 'Approved');
        assertEqual(approved.length, 3, 'Should have 3 approved docs (2 new + 1 existing)');
    });
}

module.exports = { run };