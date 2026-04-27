const { MockBitableClient } = require('./mocks');

function run({ test, assertEqual, assertTrue, assertFalse, assertThrows }) {
    test('BitableClient should create a base', async () => {
        const client = new MockBitableClient();
        const result = await client.createBase('Test Base', 'folder123');
        assertTrue(result.app !== undefined, 'Should return app object');
        assertTrue(result.app.app_token !== undefined, 'Should return app_token');
        assertTrue(result.app.app_token.startsWith('base_'), 'Token should start with base_');
    });

    test('BitableClient should create and list tables', async () => {
        const client = new MockBitableClient();
        const base = await client.createBase('Test', 'folder123');
        const token = base.app.app_token;

        await client.createTable(token, 'Docs', [
            { field_name: 'Slug', type: 1 }
        ]);
        await client.createTable(token, 'PRs', []);

        const result = await client.listTables(token);
        assertEqual(result.items.length, 2, 'Should have 2 tables');
        assertEqual(result.items[0].table_name, 'Docs', 'First table should be Docs');
        assertEqual(result.items[1].table_name, 'PRs', 'Second table should be PRs');
    });

    test('BitableClient should list fields for a table', async () => {
        const client = new MockBitableClient();
        const base = await client.createBase('Test', 'folder123');
        const token = base.app.app_token;

        const fields = [
            { field_name: 'Slug', type: 1 },
            { field_name: 'Status', type: 3 }
        ];
        const table = await client.createTable(token, 'Docs', fields);
        const result = await client.listFields(token, table.table.table_id);
        assertEqual(result.items.length, 2, 'Should have 2 fields');
        assertEqual(result.items[0].field_name, 'Slug', 'First field should be Slug');
        assertEqual(result.items[1].type, 3, 'Second field type should be 3');
    });

    test('BitableClient should create and list records', async () => {
        const client = new MockBitableClient();
        const base = await client.createBase('Test', 'folder123');
        const token = base.app.app_token;
        const table = await client.createTable(token, 'Docs', []);

        await client.createRecord(token, table.table.table_id, {
            Slug: 'getting-started',
            Status: 'Draft'
        });

        const result = await client.listRecords(token, table.table.table_id);
        assertEqual(result.items.length, 1, 'Should have 1 record');
        assertEqual(result.items[0].fields.Slug, 'getting-started', 'Slug should match');
        assertEqual(result.items[0].fields.Status, 'Draft', 'Status should match');
    });

    test('BitableClient should update a record', async () => {
        const client = new MockBitableClient();
        const base = await client.createBase('Test', 'folder123');
        const token = base.app.app_token;
        const table = await client.createTable(token, 'Docs', []);

        const created = await client.createRecord(token, table.table.table_id, {
            Slug: 'test-doc',
            Status: 'Draft'
        });

        await client.updateRecord(token, table.table.table_id, created.record.record_id, {
            Status: 'Approved'
        });

        const records = await client.listRecords(token, table.table.table_id);
        assertEqual(records.items[0].fields.Status, 'Approved', 'Status should be updated');
    });

    test('BitableClient should search records with filter', async () => {
        const client = new MockBitableClient();
        const base = await client.createBase('Test', 'folder123');
        const token = base.app.app_token;
        const table = await client.createTable(token, 'Docs', []);

        await client.createRecord(token, table.table.table_id, { Slug: 'doc-a', Status: 'Draft' });
        await client.createRecord(token, table.table.table_id, { Slug: 'doc-b', Status: 'Approved' });
        await client.createRecord(token, table.table.table_id, { Slug: 'doc-c', Status: 'Approved' });

        const result = await client.searchRecords(token, table.table.table_id, {
            conditions: [{ field_name: 'Status', value: 'Approved' }]
        });
        assertEqual(result.items.length, 2, 'Should find 2 approved docs');
    });

    test('BitableClient should search with array value filter', async () => {
        const client = new MockBitableClient();
        const base = await client.createBase('Test', 'folder123');
        const token = base.app.app_token;
        const table = await client.createTable(token, 'Docs', []);

        await client.createRecord(token, table.table.table_id, { Slug: 'doc-a', Status: 'Draft' });
        await client.createRecord(token, table.table.table_id, { Slug: 'doc-b', Status: 'Approved' });
        await client.createRecord(token, table.table.table_id, { Slug: 'doc-c', Status: 'Published' });

        const result = await client.searchRecords(token, table.table.table_id, {
            conditions: [{ field_name: 'Status', value: ['Approved', 'Published'] }]
        });
        assertEqual(result.items.length, 2, 'Should find 2 docs matching array values');
    });

    test('BitableClient reset should clear all data', async () => {
        const client = new MockBitableClient();
        await client.createBase('Test', 'folder123');
        client.reset();
        assertEqual(client.bases.size, 0, 'Bases should be empty after reset');
        assertEqual(client.tables.size, 0, 'Tables should be empty after reset');
        assertEqual(client.records.size, 0, 'Records should be empty after reset');
    });
}

module.exports = { run };