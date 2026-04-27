const { MockBitableClient } = require('./mocks');

function run({ test, assertEqual, assertTrue, assertFalse }) {
    const { TABLE_SCHEMAS, LINK_FIELDS, MANUALS_TABLE } = require('../lib/tableSchemas');

    // ---- Schema structure tests ----
    test('Table schemas should define 7 tables', () => {
        assertEqual(TABLE_SCHEMAS.length, 7, 'Should have 7 table schemas');
    });

    test('Table schemas should include Manuals table', () => {
        const manualsTable = TABLE_SCHEMAS.find(t => t.name === MANUALS_TABLE);
        assertTrue(manualsTable !== undefined, 'Should have tblManuals table');
        assertEqual(manualsTable.fields[0].field_name, 'Name', 'First field should be Name');
    });

    test('Table schemas should include Docs table', () => {
        const docsTable = TABLE_SCHEMAS.find(t => t.name === 'Docs');
        assertTrue(docsTable !== undefined, 'Should have Docs table');
        const slugField = docsTable.fields.find(f => f.field_name === 'Slug');
        assertTrue(slugField !== undefined, 'Docs should have Slug field');
    });

    test('Link fields should include Manual links on data tables', () => {
        const manualLinks = LINK_FIELDS.filter(lf => lf.field_name === 'Manual');
        const tablesWithManual = manualLinks.map(lf => lf.table);
        assertTrue(tablesWithManual.includes('Docs'), 'Docs should have Manual link');
        assertTrue(tablesWithManual.includes('Publish Targets'), 'Publish Targets should have Manual link');
        assertTrue(tablesWithManual.includes('Doc Publish Paths'), 'Doc Publish Paths should have Manual link');
        assertTrue(tablesWithManual.includes('Pull Requests'), 'Pull Requests should have Manual link');
        assertTrue(tablesWithManual.includes('Versions'), 'Versions should have Manual link');
        assertTrue(tablesWithManual.includes('Sync History'), 'Sync History should have Manual link');
    });

    // ---- Init workflow with mock client ----
    test('Init: should create tables in mock bitable', async () => {
        const client = new MockBitableClient();
        const base = await client.createBase('DocPal');
        const token = base.app.app_token;

        let createdCount = 0;
        for (const schema of TABLE_SCHEMAS) {
            await client.createTable(token, schema.name, schema.fields);
            createdCount++;
        }

        const tables = await client.listTables(token);
        assertEqual(tables.items.length, 7, `Should have 7 tables, got ${tables.items.length}`);
        assertEqual(createdCount, 7, 'Should create 7 tables');
    });

    test('Init: should create manual record in tblManuals', async () => {
        const client = new MockBitableClient();
        const base = await client.createBase('DocPal');
        const token = base.app.app_token;
        await client.createTable(token, MANUALS_TABLE, [
            { field_name: 'Name', type: 1 },
            { field_name: 'Root Type', type: 3 },
            { field_name: 'Root Token', type: 1 },
        ]);

        const record = await client.createRecord(token, 'tblManuals', {
            'Name': 'Milvus Docs',
            'Root Type': 'Wiki Space',
            'Root Token': 'wikcnABC123',
        });

        assertTrue(record.record !== undefined, 'Should create record');
        assertEqual(record.record.fields.Name, 'Milvus Docs', 'Name should match');
    });

    test('Init: should create Docs with Manual link field', async () => {
        const client = new MockBitableClient();
        const base = await client.createBase('DocPal');
        const token = base.app.app_token;

        const manualsTable = await client.createTable(token, MANUALS_TABLE, [
            { field_name: 'Name', type: 1 },
        ]);
        const docsTable = await client.createTable(token, 'Docs', [
            { field_name: 'Slug', type: 1 },
            { field_name: 'Status', type: 3 },
        ]);

        const manual = await client.createRecord(token, 'tblManuals', { 'Name': 'Test Manual' });
        const doc = await client.createRecord(token, 'Docs', {
            'Slug': 'quick-start',
            'Status': 'Draft',
        });

        assertEqual(doc.record.fields.Slug, 'quick-start', 'Doc slug should match');
    });

    // ---- Manual resolution tests ----
    test('Init: resolveManual should auto-select when only one manual', async () => {
        const client = new MockBitableClient();
        const base = await client.createBase('DocPal');
        const token = base.app.app_token;
        await client.createTable(token, MANUALS_TABLE, [{ field_name: 'Name', type: 1 }]);

        await client.createRecord(token, 'tblManuals', { 'Name': 'Only Manual' });

        const manual = await client.resolveManual(token);
        assertEqual(manual.fields.Name, 'Only Manual', 'Should auto-select single manual');
    });

    test('Init: resolveManual should find by name', async () => {
        const client = new MockBitableClient();
        const base = await client.createBase('DocPal');
        const token = base.app.app_token;
        await client.createTable(token, MANUALS_TABLE, [{ field_name: 'Name', type: 1 }]);

        await client.createRecord(token, 'tblManuals', { 'Name': 'Manual A' });
        await client.createRecord(token, 'tblManuals', { 'Name': 'Manual B' });

        const manual = await client.resolveManual(token, 'Manual B');
        assertEqual(manual.fields.Name, 'Manual B', 'Should find manual by name');
    });

    test('Init: resolveManual should error with multiple manuals and no name', async () => {
        const client = new MockBitableClient();
        const base = await client.createBase('DocPal');
        const token = base.app.app_token;
        await client.createTable(token, MANUALS_TABLE, [{ field_name: 'Name', type: 1 }]);

        await client.createRecord(token, 'tblManuals', { 'Name': 'Manual A' });
        await client.createRecord(token, 'tblManuals', { 'Name': 'Manual B' });

        let error = null;
        try {
            await client.resolveManual(token);
        } catch (e) {
            error = e;
        }
        assertTrue(error !== null, 'Should throw error with multiple manuals');
        assertTrue(error.message.includes('Multiple manuals'), 'Error should mention multiple manuals');
    });

    test('Init: resolveManual should error with no manuals', async () => {
        const client = new MockBitableClient();
        const base = await client.createBase('DocPal');
        const token = base.app.app_token;
        await client.createTable(token, MANUALS_TABLE, [{ field_name: 'Name', type: 1 }]);

        let error = null;
        try {
            await client.resolveManual(token);
        } catch (e) {
            error = e;
        }
        assertTrue(error !== null, 'Should throw error with no manuals');
        assertTrue(error.message.includes('No manuals'), 'Error should mention no manuals');
    });

    test('Init: resolveManual should error with unknown name', async () => {
        const client = new MockBitableClient();
        const base = await client.createBase('DocPal');
        const token = base.app.app_token;
        await client.createTable(token, MANUALS_TABLE, [{ field_name: 'Name', type: 1 }]);

        await client.createRecord(token, 'tblManuals', { 'Name': 'Manual A' });

        let error = null;
        try {
            await client.resolveManual(token, 'Nonexistent');
        } catch (e) {
            error = e;
        }
        assertTrue(error !== null, 'Should throw error for unknown manual name');
        assertTrue(error.message.includes('not found'), 'Error should mention not found');
    });
}

module.exports = { run };