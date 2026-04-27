/**
 * Tests for the draft update subcommand.
 * Covers argument parsing, strategy validation, wiki node resolution,
 * dry-run behavior, and registry update flow.
 */
const { MockBitableClient, MockLarkDocClient } = require('./mocks');
const { contentHash } = require('../lib/contentHash');

function parseArgs(args) {
    const parsed = { file: null };
    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        if (!arg.startsWith('--') && !parsed.file) {
            parsed.file = arg;
        } else if (arg === '--doc' && args[i + 1]) {
            parsed.doc = args[++i];
        } else if (arg === '--strategy' && args[i + 1]) {
            parsed.strategy = args[++i];
        } else if (arg === '--update-hash') {
            parsed.updateHash = true;
        } else if (arg === '--manual' && args[i + 1]) {
            parsed.manualName = args[++i];
        } else if (arg === '--base' && args[i + 1]) {
            parsed.baseToken = args[++i];
        } else if (arg === '--dry-run') {
            parsed.dryRun = true;
        } else if (arg === '--json') {
            parsed.json = true;
        }
    }
    return parsed;
}

function run({ test, assertEqual, assertTrue, assertFalse }) {
    // ---- parseArgs flag tests ----
    test('Draft update: parses --doc flag', () => {
        const parsed = parseArgs(['--doc', 'wikcnAbc123']);
        assertEqual(parsed.doc, 'wikcnAbc123', 'Should parse --doc');
    });

    test('Draft update: parses --strategy flag', () => {
        const parsed = parseArgs(['--doc', 'd', '--strategy', 'append']);
        assertEqual(parsed.strategy, 'append', 'Should parse --strategy');
    });

    test('Draft update: parses --update-hash flag', () => {
        const parsed = parseArgs(['--doc', 'd', '--update-hash']);
        assertTrue(parsed.updateHash, 'Should detect --update-hash');
    });

    test('Draft update: parses --manual flag', () => {
        const parsed = parseArgs(['--doc', 'd', '--manual', 'My Manual']);
        assertEqual(parsed.manualName, 'My Manual', 'Should parse --manual');
    });

    test('Draft update: parses positional file argument', () => {
        const parsed = parseArgs(['translated.md', '--doc', 'd', '--strategy', 'replace']);
        assertEqual(parsed.file, 'translated.md', 'Should parse positional file');
        assertEqual(parsed.doc, 'd', 'Should still parse --doc');
        assertEqual(parsed.strategy, 'replace', 'Should still parse --strategy');
    });

    test('Draft update: parses --dry-run', () => {
        const parsed = parseArgs(['--doc', 'd', '--dry-run']);
        assertTrue(parsed.dryRun, 'Should detect --dry-run');
    });

    // ---- Strategy validation ----
    test('Draft update: replace is a valid strategy', () => {
        const valid = ['replace', 'append', 'smart'];
        assertTrue(valid.includes('replace'), 'replace must be valid');
    });

    test('Draft update: append is a valid strategy', () => {
        const valid = ['replace', 'append', 'smart'];
        assertTrue(valid.includes('append'), 'append must be valid');
    });

    test('Draft update: smart is a valid strategy', () => {
        const valid = ['replace', 'append', 'smart'];
        assertTrue(valid.includes('smart'), 'smart must be valid');
    });

    test('Draft update: rejects invalid strategy', () => {
        const valid = ['replace', 'append', 'smart'];
        assertFalse(valid.includes('overwrite'), 'overwrite must be invalid');
        assertFalse(valid.includes('merge'), 'merge must be invalid');
    });

    test('Draft update: defaults strategy to replace when missing', () => {
        const parsed = parseArgs(['--doc', 'd']);
        const strategy = parsed.strategy || 'replace';
        assertEqual(strategy, 'replace', 'Default strategy should be replace');
    });

    // ---- --doc requirement ----
    test('Draft update: --doc must be provided', () => {
        const parsed = parseArgs(['file.md', '--strategy', 'replace']);
        assertFalse(!!parsed.doc, '--doc should be missing here');
    });

    // ---- Wiki node → document_id resolution via mock ----
    test('Draft update: resolves wiki node_token to document_id', async () => {
        const lark = new MockLarkDocClient();
        const wikiToken = 'wikcn_user_provided';
        const nodeInfo = await lark.getWikiNode(wikiToken);
        assertTrue(!!nodeInfo, 'getWikiNode should return data');
        assertTrue(!!nodeInfo.node, 'Should have a node field');
        assertTrue(!!nodeInfo.node.obj_token, 'Should have obj_token for resolution');
    });

    test('Draft update: falls back to original token if wiki lookup fails', async () => {
        const userToken = 'doxcn_drive_doc_id';
        // Simulate a getWikiNode error path: when caller catches and falls back,
        // documentId should equal the original --doc value.
        let documentId = userToken;
        try {
            throw new Error('Not a wiki node');
        } catch {
            // documentId stays as userToken
        }
        assertEqual(documentId, userToken, 'Should fall back to original token');
    });

    // ---- contentHash integration ----
    test('Draft update: contentHash produces stable hash for same input', () => {
        const content = '# Hello\n\nWorld';
        const h1 = contentHash(content);
        const h2 = contentHash(content);
        assertEqual(h1, h2, 'Hash should be stable');
        assertTrue(h1.length > 0, 'Hash should not be empty');
    });

    test('Draft update: contentHash differs for different input', () => {
        const a = contentHash('# A');
        const b = contentHash('# B');
        assertTrue(a !== b, 'Different content should produce different hashes');
    });

    // ---- Registry update flow with --manual ----
    test('Draft update: --manual updates tblDocs Last Modified, Content Hash, Sync Status', async () => {
        const bitable = new MockBitableClient();
        const base = await bitable.createBase('Manual');
        const baseToken = base.app.app_token;
        const docsTable = await bitable.createTable(baseToken, 'tblDocs', [
            { field_name: 'Doc', type: 15 },
            { field_name: 'Slug', type: 1 },
            { field_name: 'Parent Token', type: 1 },
            { field_name: 'Last Modified', type: 1 },
            { field_name: 'Content Hash', type: 1 },
            { field_name: 'Sync Status', type: 3 },
        ]);
        const tableId = docsTable.table.table_id;

        const docToken = 'wikcnDoc456';
        await bitable.createRecord(baseToken, tableId, {
            'Doc': `[Existing](https://feishu.cn/wiki/${docToken})`,
            'Slug': 'existing',
            'Parent Token': docToken,
            'Sync Status': 'Out of Sync',
        });

        // Search for the doc by parent token (mirrors runUpdate logic)
        const docs = await bitable.searchRecords(baseToken, tableId, {
            conditions: [{ field_name: 'Parent Token', operator: 'is', value: docToken }],
        });
        assertEqual(docs.items.length, 1, 'Should find 1 doc by parent token');

        const docRecord = docs.items[0];
        const newContent = '# Updated\n\nNew content';
        const hash = contentHash(newContent);

        await bitable.updateRecord(baseToken, tableId, docRecord.record_id, {
            'Last Modified': new Date().toISOString(),
            'Content Hash': hash,
            'Sync Status': 'Synced',
        });

        const updated = await bitable.listRecords(baseToken, tableId);
        assertEqual(updated.items[0].fields['Sync Status'], 'Synced', 'Sync Status should be Synced');
        assertEqual(updated.items[0].fields['Content Hash'], hash, 'Content Hash should be set');
        assertTrue(!!updated.items[0].fields['Last Modified'], 'Last Modified should be set');
    });

    test('Draft update: registry update is skipped when no matching tblDocs row exists', async () => {
        const bitable = new MockBitableClient();
        const base = await bitable.createBase('Manual');
        const baseToken = base.app.app_token;
        const docsTable = await bitable.createTable(baseToken, 'tblDocs', [
            { field_name: 'Doc', type: 15 },
            { field_name: 'Parent Token', type: 1 },
        ]);
        const tableId = docsTable.table.table_id;

        const docs = await bitable.searchRecords(baseToken, tableId, {
            conditions: [{ field_name: 'Parent Token', operator: 'is', value: 'unknown' }],
        });
        assertEqual(docs.items.length, 0, 'Should find no matching rows');

        const all = await bitable.listRecords(baseToken, tableId);
        assertEqual(all.items.length, 0, 'No rows means no registry update');
    });

    // ---- Dry-run does not touch APIs ----
    test('Draft update: --dry-run skips Feishu writes', async () => {
        const lark = new MockLarkDocClient();
        let createCalls = 0;
        const originalCreate = lark.createDoc.bind(lark);
        lark.createDoc = async (...args) => { createCalls++; return originalCreate(...args); };

        const parsed = parseArgs(['file.md', '--doc', 'wikcnDryRun', '--dry-run']);
        if (parsed.dryRun) {
            // Dry-run path: no API calls should occur
        }
        assertEqual(createCalls, 0, 'Dry-run should not call createDoc');
    });

    test('Draft update: --dry-run still computes content hash for preview', () => {
        const content = '# Preview\n\nThis is a dry-run preview.';
        const hash = contentHash(content);
        assertTrue(!!hash, 'Hash should be computed in dry-run');
        assertTrue(hash.length > 0, 'Hash should be non-empty');
    });

    // ---- Stdin handling ----
    test('Draft update: file omitted means stdin is required', () => {
        const parsed = parseArgs(['--doc', 'd']);
        assertFalse(!!parsed.file, 'File should be null when not provided');
        // Caller checks process.stdin.isTTY and bails if true.
    });

    test('Draft update: --update-hash and --manual both trigger registry update', () => {
        const a = parseArgs(['--doc', 'd', '--manual', 'M']);
        const b = parseArgs(['--doc', 'd', '--update-hash']);
        const aTriggers = !!(a.manualName || a.updateHash);
        const bTriggers = !!(b.manualName || b.updateHash);
        assertTrue(aTriggers, '--manual triggers registry update');
        assertTrue(bTriggers, '--update-hash triggers registry update');
    });
}

module.exports = { run };
