const { filterByTarget, matchFilterTags } = require('../lib/targetFilter');

function run({ test, assertEqual, assertTrue, assertFalse, assertThrows }) {
    test('filterByTarget: content with no tags passes through', () => {
        const content = '# Hello\n\nSome text without tags.';
        assertEqual(filterByTarget(content, 'milvus-docs'), content, 'Should pass through unchanged');
    });

    test('filterByTarget: include block kept when target matches', () => {
        const content = 'Before <include target="milvus-docs">included content</include> After';
        const result = filterByTarget(content, 'milvus-docs');
        assertEqual(result, 'Before included content After', 'Should keep included content');
    });

    test('filterByTarget: include block removed when target does not match', () => {
        const content = 'Before <include target="milvus-docs">included content</include> After';
        const result = filterByTarget(content, 'zilliz-docs');
        assertEqual(result, 'Before  After', 'Should remove non-matching include');
    });

    test('filterByTarget: exclude block removed when target matches', () => {
        const content = 'Before <exclude target="milvus-docs">excluded content</exclude> After';
        const result = filterByTarget(content, 'milvus-docs');
        assertEqual(result, 'Before  After', 'Should remove excluded content');
    });

    test('filterByTarget: exclude block kept when target does not match', () => {
        const content = 'Before <exclude target="milvus-docs">excluded content</exclude> After';
        const result = filterByTarget(content, 'zilliz-docs');
        assertEqual(result, 'Before excluded content After', 'Should keep excluded content');
    });

    test('filterByTarget: handles multiple tags', () => {
        const content = '<include target="milvus-docs">A</include> middle <exclude target="zilliz-docs">B</exclude>';
        const result = filterByTarget(content, 'milvus-docs');
        assertTrue(result.includes('A'), 'Should include A');
        assertTrue(result.includes('B'), 'Should keep B (exclude for different target)');
        assertTrue(result.includes('middle'), 'Should keep middle');
    });

    test('filterByTarget: handles dot-separated targets', () => {
        const content = '<include target="saas">content</include>';
        const result = filterByTarget(content, 'zilliz.saas');
        assertEqual(result, 'content', 'Should match saas in zilliz.saas');
    });

    test('filterByTarget: collapses excessive newlines', () => {
        const content = 'A\n\n\n\n\nB';
        const result = filterByTarget(content, 'milvus-docs');
        assertFalse(result.includes('\n\n\n'), 'Should collapse excessive newlines');
    });

    test('filterByTarget: returns input when no target provided', () => {
        const content = '<include target="x">y</include>';
        assertEqual(filterByTarget(content, ''), content, 'Should return unchanged without target');
        assertEqual(filterByTarget(content, null), content, 'Should return unchanged with null');
    });

    test('matchFilterTags: finds include and exclude tags', () => {
        const content = '<include target="a">x</include> <exclude target="b">y</exclude>';
        const matches = matchFilterTags(content);
        assertEqual(matches.length, 2, 'Should find 2 tags');
        assertEqual(matches[0].tag, 'include', 'First should be include');
        assertEqual(matches[1].tag, 'exclude', 'Second should be exclude');
    });

    test('matchFilterTags: returns empty for no tags', () => {
        const matches = matchFilterTags('no tags here');
        assertEqual(matches.length, 0, 'Should find 0 tags');
    });
}

module.exports = { run };
