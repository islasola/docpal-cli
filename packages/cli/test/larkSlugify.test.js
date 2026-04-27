/**
 * Tests for larkSlugify module
 */

const { containsChinese, extractHeadingText, buildHeadingSlugMap, getSlugForHeading } = require('../lib/larkSlugify');

async function run({ test, assertEqual, assertTrue, assertFalse, assertDeepEqual }) {
    // --- containsChinese ---
    await test('containsChinese returns true for Chinese text', () => {
        assertTrue(containsChinese('这是一个测试'));
    });

    await test('containsChinese returns false for English text', () => {
        assertFalse(containsChinese('Hello World'));
    });

    await test('containsChinese returns false for empty string', () => {
        assertFalse(containsChinese(''));
    });

    await test('containsChinese returns false for null', () => {
        assertFalse(containsChinese(null));
    });

    await test('containsChinese detects mixed text', () => {
        assertTrue(containsChinese('Hello 世界'));
    });

    // --- extractHeadingText ---
    await test('extractHeadingText extracts text from heading elements', () => {
        const heading = {
            elements: [
                { text_run: { content: 'Hello ' } },
                { text_run: { content: 'World' } },
            ]
        };
        assertEqual(extractHeadingText(heading), 'Hello World');
    });

    await test('extractHeadingText returns empty for null heading', () => {
        assertEqual(extractHeadingText(null), '');
    });

    await test('extractHeadingText returns empty for heading with no elements', () => {
        assertEqual(extractHeadingText({}), '');
    });

    // --- buildHeadingSlugMap ---
    await test('buildHeadingSlugMap extracts heading slugs in document order', () => {
        const blocks = [
            { block_id: 'p1', block_type: 1, children: ['h1', 'h2'] },
            { block_id: 'h1', block_type: 3, heading1: { elements: [
                { text_run: { content: 'Getting Started' } }
            ]}},
            { block_id: 'h2', block_type: 4, heading2: { elements: [
                { text_run: { content: 'Quick Overview' } }
            ]}},
        ];
        const slugs = buildHeadingSlugMap(blocks);
        assertEqual(slugs.length, 2);
        assertEqual(slugs[0], 'getting-started');
        assertEqual(slugs[1], 'quick-overview');
    });

    await test('buildHeadingSlugMap returns empty array for empty blocks', () => {
        const slugs = buildHeadingSlugMap([]);
        assertEqual(slugs.length, 0);
    });

    await test('buildHeadingSlugMap skips non-heading blocks', () => {
        const blocks = [
            { block_id: 'p1', block_type: 1, children: ['t1'] },
            { block_id: 't1', block_type: 2, text: { elements: [
                { text_run: { content: 'Just text' } }
            ]}},
        ];
        const slugs = buildHeadingSlugMap(blocks);
        assertEqual(slugs.length, 0);
    });

    await test('buildHeadingSlugMap handles nested headings in children', () => {
        const blocks = [
            { block_id: 'p1', block_type: 1, children: ['q1'] },
            { block_id: 'q1', block_type: 34, children: ['h1'] },
            { block_id: 'h1', block_type: 4, heading2: { elements: [
                { text_run: { content: 'Nested Heading' } }
            ]}},
        ];
        const slugs = buildHeadingSlugMap(blocks);
        assertEqual(slugs.length, 1);
        assertEqual(slugs[0], 'nested-heading');
    });

    await test('buildHeadingSlugMap walks blocks without page block', () => {
        const blocks = [
            { block_id: 'h1', block_type: 3, heading1: { elements: [
                { text_run: { content: 'Standalone Heading' } }
            ]}},
        ];
        const slugs = buildHeadingSlugMap(blocks);
        assertEqual(slugs.length, 1);
        assertEqual(slugs[0], 'standalone-heading');
    });

    // --- getSlugForHeading ---
    await test('getSlugForHeading uses slug map when index is in range', () => {
        const slugMap = ['getting-started', 'quick-overview'];
        const result = getSlugForHeading('快速开始', 0, slugMap);
        assertEqual(result, 'getting-started');
    });

    await test('getSlugForHeading uses second slug from map', () => {
        const slugMap = ['getting-started', 'quick-overview'];
        const result = getSlugForHeading('概览', 1, slugMap);
        assertEqual(result, 'quick-overview');
    });

    await test('getSlugForHeading falls back to slugify when no slug map', () => {
        const result = getSlugForHeading('Getting Started', 0, null);
        assertEqual(result, 'getting-started');
    });

    await test('getSlugForHeading falls back when index exceeds map', () => {
        const slugMap = ['only-one'];
        const result = getSlugForHeading('Extra Heading', 1, slugMap);
        assertEqual(result, 'extra-heading');
    });

    await test('getSlugForHeading falls back when slug map entry is empty', () => {
        const slugMap = [''];
        const result = getSlugForHeading('Fallback Heading', 0, slugMap);
        assertEqual(result, 'fallback-heading');
    });

    await test('getSlugForHeading handles pipe-separated content', () => {
        const slugMap = ['installation'];
        const result = getSlugForHeading('Installation| Milvus', 0, slugMap);
        assertEqual(result, 'installation');
    });
}

module.exports = { run };
