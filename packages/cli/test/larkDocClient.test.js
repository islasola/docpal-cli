const { MockLarkDocClient } = require('./mocks');

function run({ test, assertEqual, assertTrue, assertFalse, assertThrows }) {
    test('LarkDocClient should create a doc', async () => {
        const client = new MockLarkDocClient();
        const result = await client.createDoc('folder123', 'Test Doc');
        assertTrue(result.document !== undefined, 'Should return document object');
        assertTrue(result.document.document_id !== undefined, 'Should have document_id');
        assertEqual(result.document.title, 'Test Doc', 'Title should match');
        assertEqual(result.document.folder_token, 'folder123', 'Folder token should match');
    });

    test('LarkDocClient should get a created doc', async () => {
        const client = new MockLarkDocClient();
        const created = await client.createDoc('folder123', 'My Doc');
        const docId = created.document.document_id;

        const result = await client.getDoc(docId);
        assertTrue(result !== null, 'Should find the doc');
        assertEqual(result.document.title, 'My Doc', 'Title should match');
    });

    test('LarkDocClient should return null for missing doc', async () => {
        const client = new MockLarkDocClient();
        const result = await client.getDoc('nonexistent');
        assertEqual(result, null, 'Should return null for missing doc');
    });

    test('LarkDocClient should get blocks', async () => {
        const client = new MockLarkDocClient();
        const doc = await client.createDoc('folder123', 'Test');
        const blocks = await client.getBlocks(doc.document.document_id);
        assertTrue(Array.isArray(blocks.items), 'Should return items array');
        assertTrue(blocks.items.length > 0, 'Should have at least one root block');
    });

    test('LarkDocClient should get wiki node', async () => {
        const client = new MockLarkDocClient();
        const result = await client.getWikiNode('wikiToken123');
        assertTrue(result.node !== undefined, 'Should return node object');
        assertEqual(result.node.obj_token, 'wikiToken123', 'Should echo token');
        assertEqual(result.node.obj_type, 'docx', 'Type should be docx');
    });

    test('LarkDocClient should list wiki nodes', async () => {
        const client = new MockLarkDocClient();
        const result = await client.listWikiNodes('space123');
        assertTrue(Array.isArray(result.items), 'Should return items array');
    });

    test('LarkDocClient should list drive files', async () => {
        const client = new MockLarkDocClient();
        const result = await client.listDriveFiles('folder123');
        assertTrue(Array.isArray(result.items), 'Should return items array');
    });

    test('LarkDocClient reset should clear docs', async () => {
        const client = new MockLarkDocClient();
        await client.createDoc('folder123', 'Doc A');
        await client.createDoc('folder123', 'Doc B');
        client.reset();
        assertEqual(client.docs.size, 0, 'Docs should be empty after reset');
    });

    test('LarkDocClient should generate unique doc IDs', async () => {
        const client = new MockLarkDocClient();
        const docA = await client.createDoc('f1', 'A');
        const docB = await client.createDoc('f1', 'B');
        assertFalse(
            docA.document.document_id === docB.document.document_id,
            'Each doc should get a unique ID'
        );
    });
}

module.exports = { run };
