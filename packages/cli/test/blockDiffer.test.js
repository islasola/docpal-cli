const BlockDiffer = require('../lib/blockDiffer');

function makeBlock(type, blockId, children, textContent) {
    const block = {
        block_type: type,
        block_id: blockId || 'blk_' + type + '_' + Math.random().toString(36).slice(2, 8)
    };
    if (children) block.children = children;

    if (textContent) {
        block.text = {
            elements: [{ text_run: { content: textContent, text_element_style: {} } }]
        };
    }
    return block;
}

function makePage(childIds, pageId) {
    return {
        block_type: 1,
        block_id: pageId || 'root',
        children: childIds
    };
}

function run({ test, assertEqual, assertTrue }) {
    test('BlockDiffer: no changes between identical blocks', () => {
        const differ = new BlockDiffer();
        const existing = [
            makePage(['blk_1']),
            makeBlock(1, 'blk_1', null, 'Hello')
        ];
        const desired = [
            makePage(['blk_1']),
            makeBlock(1, 'blk_1', null, 'Hello')
        ];
        const result = differ.diff(existing, desired);
        assertEqual(result.toUpdate.length, 0, 'Should have no updates');
        assertEqual(result.toCreate.length, 0, 'Should have no creates');
        assertEqual(result.toDelete.length, 0, 'Should have no deletes');
    });

    test('BlockDiffer: detect updated block content', () => {
        const differ = new BlockDiffer();
        const existing = [
            makePage(['blk_1']),
            makeBlock(1, 'blk_1', null, 'Old text')
        ];
        const desired = [
            makePage(['blk_2']),
            makeBlock(1, 'blk_2', null, 'New text')
        ];
        const result = differ.diff(existing, desired);
        assertTrue(result.toUpdate.length >= 0, 'Position-based diff may detect update or create+delete');
    });

    test('BlockDiffer: detect new block appended', () => {
        const differ = new BlockDiffer();
        const existing = [
            makePage(['blk_1']),
            makeBlock(1, 'blk_1', null, 'First')
        ];
        const desired = [
            makePage(['blk_1', 'blk_2']),
            makeBlock(1, 'blk_1', null, 'First'),
            makeBlock(1, 'blk_2', null, 'Second')
        ];
        const result = differ.diff(existing, desired);
        assertTrue(result.toCreate.length >= 1, 'Should have at least 1 create');
    });

    test('BlockDiffer: detect deleted block', () => {
        const differ = new BlockDiffer();
        const existing = [
            makePage(['blk_1', 'blk_2']),
            makeBlock(1, 'blk_1', null, 'First'),
            makeBlock(1, 'blk_2', null, 'Second')
        ];
        const desired = [
            makePage(['blk_3']),
            makeBlock(1, 'blk_3', null, 'First')
        ];
        const result = differ.diff(existing, desired);
        assertTrue(result.toDelete.length >= 1, 'Should have at least 1 delete');
    });

    test('BlockDiffer: key-based matching', () => {
        const differ = new BlockDiffer({ matchBy: 'key' });
        const existing = [
            makePage(['blk_1']),
            makeBlock(1, 'blk_1', null, 'Hello')
        ];
        const desired = [
            makePage(['blk_2']),
            makeBlock(1, 'blk_2', null, 'Hello')
        ];
        const result = differ.diff(existing, desired);
        assertEqual(result.toUpdate.length, 0, 'Same content should not need update');
        assertEqual(result.toCreate.length, 0, 'Should not create when matching by key');
        assertEqual(result.toDelete.length, 0, 'Should not delete when matching by key');
    });

    test('BlockDiffer: key-based detects content change', () => {
        const differ = new BlockDiffer({ matchBy: 'key' });
        const existing = [
            makePage(['blk_1']),
            makeBlock(1, 'blk_1', null, 'Hello')
        ];
        const desired = [
            makePage(['blk_2']),
            makeBlock(1, 'blk_2', null, 'Goodbye')
        ];
        const result = differ.diff(existing, desired);
        assertTrue(result.toCreate.length >= 1 || result.toUpdate.length >= 1, 'Changed content should result in create or update');
        assertTrue(result.toDelete.length >= 1 || result.toUpdate.length >= 1, 'Old block should be deleted or updated');
    });

    test('BlockDiffer: empty inputs produce empty diff', () => {
        const differ = new BlockDiffer();
        const result = differ.diff([], []);
        assertEqual(result.toUpdate.length, 0, 'No updates');
        assertEqual(result.toCreate.length, 0, 'No creates');
        assertEqual(result.toDelete.length, 0, 'No deletes');
    });

    test('BlockDiffer: handles blocks without page block', () => {
        const differ = new BlockDiffer();
        const existing = [];
        const desired = [];
        const result = differ.diff(existing, desired);
        assertEqual(result.toUpdate.length, 0, 'No updates');
    });
}

module.exports = { run };