const DiffEngine = require('../lib/diffEngine');

function makeDoc(slug, description, meta = {}) {
    return {
        slug,
        description,
        metadata: {
            slug,
            description,
            ...meta
        }
    };
}

function run({ test, assertEqual, assertTrue, assertFalse, assertDeepEqual }) {
    test('DiffEngine: CREATE action for new document', () => {
        const engine = new DiffEngine();
        const source = [makeDoc('new-doc', 'A new document')];
        const indexed = [];
        const actions = engine.diff(source, indexed);
        assertEqual(actions.length, 1, 'Should have 1 action');
        assertEqual(actions[0].type, 'CREATE', 'Should be CREATE action');
        assertEqual(actions[0].slug, 'new-doc', 'Slug should match');
    });

    test('DiffEngine: SKIP action for unchanged document', () => {
        const engine = new DiffEngine();
        const source = [makeDoc('existing-doc', 'Same description', { contentHash: 'abc123' })];
        const indexed = [makeDoc('existing-doc', 'Same description', { contentHash: 'abc123' })];
        const actions = engine.diff(source, indexed);
        assertEqual(actions.length, 1, 'Should have 1 action');
        assertEqual(actions[0].type, 'SKIP', 'Should be SKIP action');
    });

    test('DiffEngine: UPDATE action for changed document', () => {
        const engine = new DiffEngine();
        const source = [makeDoc('changed-doc', 'New description', { contentHash: 'new123' })];
        const indexed = [makeDoc('changed-doc', 'Old description', { contentHash: 'old456' })];
        const actions = engine.diff(source, indexed);
        assertEqual(actions.length, 1, 'Should have 1 action');
        assertEqual(actions[0].type, 'UPDATE', 'Should be UPDATE action');
        assertTrue(actions[0].reason.includes('Description changed'), 'Reason should mention description');
    });

    test('DiffEngine: DEPRECATE action for deprecated document', () => {
        const engine = new DiffEngine();
        const source = [makeDoc('old-api', 'Legacy API', { deprecated_since: '2.6.0' })];
        const indexed = [makeDoc('old-api', 'Legacy API', { contentHash: 'abc' })];
        const actions = engine.diff(source, indexed);
        assertEqual(actions.length, 1, 'Should have 1 action');
        assertEqual(actions[0].type, 'DEPRECATE', 'Should be DEPRECATE action');
    });

    test('DiffEngine: ORPHAN action for indexed doc with no source match', () => {
        const engine = new DiffEngine();
        const source = [];
        const indexed = [makeDoc('orphan-doc', 'Orphaned document')];
        const actions = engine.diff(source, indexed);
        assertEqual(actions.length, 1, 'Should have 1 action');
        assertEqual(actions[0].type, 'ORPHAN', 'Should be ORPHAN action');
        assertEqual(actions[0].slug, 'orphan-doc', 'Slug should match');
    });

    test('DiffEngine: mixed actions', () => {
        const engine = new DiffEngine();
        const source = [
            makeDoc('new-doc', 'Brand new'),
            makeDoc('changed-doc', 'Changed desc', { contentHash: 'new' }),
            makeDoc('unchanged-doc', 'Same', { contentHash: 'same' }),
            makeDoc('old-doc', 'Deprecated', { deprecated_since: '2.0' }),
        ];
        const indexed = [
            makeDoc('changed-doc', 'Old desc', { contentHash: 'old' }),
            makeDoc('unchanged-doc', 'Same', { contentHash: 'same' }),
            makeDoc('old-doc', 'Deprecated'),
            makeDoc('orphan-doc', 'No source match'),
        ];
        const actions = engine.diff(source, indexed);
        const summary = engine.getSummary(actions);
        assertEqual(summary.create, 1, 'Should have 1 CREATE');
        assertEqual(summary.update, 1, 'Should have 1 UPDATE');
        assertEqual(summary.skip, 1, 'Should have 1 SKIP');
        assertEqual(summary.deprecate, 1, 'Should have 1 DEPRECATE');
        assertEqual(summary.orphan, 1, 'Should have 1 ORPHAN');
    });

    test('DiffEngine: case-insensitive slug matching', () => {
        const engine = new DiffEngine();
        const source = [makeDoc('My-Api', 'Description', { contentHash: 'abc' })];
        const indexed = [makeDoc('my-api', 'Description', { contentHash: 'abc' })];
        const actions = engine.diff(source, indexed);
        assertEqual(actions.length, 1, 'Should have 1 action');
        assertEqual(actions[0].type, 'SKIP', 'Should match case-insensitively');
    });

    test('DiffEngine: categoryMap slug remapping', () => {
        const engine = new DiffEngine({ categoryMap: { 'OldName-insert': 'Vector-insert' } });
        const source = [makeDoc('OldName-insert', 'Insert method', { contentHash: 'abc' })];
        const indexed = [makeDoc('Vector-insert', 'Insert method', { contentHash: 'abc' })];
        const actions = engine.diff(source, indexed);
        assertEqual(actions.length, 1, 'Should have 1 action');
        assertEqual(actions[0].type, 'SKIP', 'Should match via categoryMap');
    });

    test('DiffEngine: deprecation detection via status field', () => {
        const engine = new DiffEngine();
        const source = [makeDoc('api', 'Desc', { status: 'Deprecated' })];
        const indexed = [makeDoc('api', 'Desc', { contentHash: 'abc' })];
        const actions = engine.diff(source, indexed);
        assertEqual(actions[0].type, 'DEPRECATE', 'Should detect deprecation via status');
    });

    test('DiffEngine: deprecation detection via tags', () => {
        const engine = new DiffEngine();
        const source = [makeDoc('api', 'Desc', { tags: ['deprecated', 'v2'] })];
        const indexed = [makeDoc('api', 'Desc', { contentHash: 'abc' })];
        const actions = engine.diff(source, indexed);
        assertEqual(actions[0].type, 'DEPRECATE', 'Should detect deprecation via tags');
    });

    test('DiffEngine: filterByType returns only matching types', () => {
        const engine = new DiffEngine();
        const actions = [
            { type: 'CREATE', slug: 'a' },
            { type: 'UPDATE', slug: 'b' },
            { type: 'CREATE', slug: 'c' },
            { type: 'SKIP', slug: 'd' },
        ];
        const result = engine.filterByType(actions, 'CREATE');
        assertEqual(result.length, 2, 'Should return 2 CREATE actions');
    });

    test('DiffEngine: filterByType with multiple types', () => {
        const engine = new DiffEngine();
        const actions = [
            { type: 'CREATE', slug: 'a' },
            { type: 'UPDATE', slug: 'b' },
            { type: 'DEPRECATE', slug: 'c' },
        ];
        const result = engine.filterByType(actions, 'CREATE', 'UPDATE');
        assertEqual(result.length, 2, 'Should return 2 actions');
    });

    test('DiffEngine: content hash change detection', () => {
        const engine = new DiffEngine();
        const source = [makeDoc('doc', 'Same desc', { contentHash: 'hash_v2' })];
        const indexed = [makeDoc('doc', 'Same desc', { contentHash: 'hash_v1' })];
        const actions = engine.diff(source, indexed);
        assertEqual(actions[0].type, 'UPDATE', 'Should detect hash change');
        assertTrue(actions[0].reason.includes('Content hash changed'), 'Reason should mention hash');
    });

    test('DiffEngine: lastModified change detection', () => {
        const engine = new DiffEngine();
        const source = [makeDoc('doc', 'Same desc', { lastModified: '2024-01-15' })];
        const indexed = [makeDoc('doc', 'Same desc', { lastModified: '2024-01-10' })];
        const actions = engine.diff(source, indexed);
        assertEqual(actions[0].type, 'UPDATE', 'Should detect modification time change');
    });

    test('DiffEngine: empty inputs produce empty actions', () => {
        const engine = new DiffEngine();
        const actions = engine.diff([], []);
        assertEqual(actions.length, 0, 'Should have no actions');
    });
}

module.exports = { run };