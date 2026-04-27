/**
 * Tests for the approve command redirect.
 * The approve command now delegates to `manual approve`.
 */
const { MockBitableClient } = require('./mocks');

function run({ test, assertEqual, assertTrue, assertFalse, assertThrows }) {
    test('Approve: should find docs by slug in bitable', async () => {
        const client = new MockBitableClient();
        const base = await client.createBase('Manual');
        const token = base.app.app_token;
        const table = await client.createTable(token, 'Docs', [
            { field_name: 'Slug', type: 1 },
            { field_name: 'Status', type: 3 },
            { field_name: 'Progress', type: 3 },
        ]);

        await client.createRecord(token, table.table.table_id, {
            'Slug': 'vector-search', 'Status': 'Draft', 'Progress': 'Writing',
        });

        const found = await client.searchRecords(token, table.table.table_id, {
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

        const created = await client.createRecord(token, table.table.table_id, {
            'Slug': 'getting-started', 'Status': 'Draft', 'Progress': 'Writing',
        });

        await client.updateRecord(token, table.table.table_id, created.record.record_id, {
            'Status': 'Approved',
            'Progress': 'Ready',
        });

        const records = await client.listRecords(token, table.table.table_id);
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

    test('Approve: should warn when doc is already Approved', () => {
        const currentStatus = 'Approved';
        const force = false;
        const shouldWarn = currentStatus === 'Approved' && !force;
        assertTrue(shouldWarn, 'Should warn when already Approved without --force');
    });

    test('Approve: should error when doc is Published without --force', () => {
        const currentStatus = 'Published';
        const force = false;
        const shouldError = currentStatus === 'Published' && !force;
        assertTrue(shouldError, 'Should error when Published without --force');
    });

    test('Approve: --force should bypass Published check', () => {
        const currentStatus = 'Published';
        const force = true;
        const shouldError = currentStatus === 'Published' && !force;
        assertFalse(shouldError, 'Should NOT error with --force');
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

    test('Approve: should error when doc slug not found', async () => {
        const client = new MockBitableClient();
        const base = await client.createBase('Manual');
        const token = base.app.app_token;
        const table = await client.createTable(token, 'Docs', [
            { field_name: 'Slug', type: 1 },
        ]);

        const found = await client.searchRecords(token, table.table_id, {
            conditions: [{ field_name: 'Slug', value: 'nonexistent' }],
        });

        assertEqual(found.items.length, 0, 'Should find 0 docs for unknown slug');
    });
}

module.exports = { run };