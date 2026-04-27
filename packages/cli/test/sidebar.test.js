/**
 * Tests for sidebar module
 */

const { categorizeNode, generateSidebar, generateSidebarJson } = require('../lib/sidebar');

async function run({ test, assertEqual, assertTrue, assertFalse, assertDeepEqual }) {
    // --- categorizeNode ---
    await test('categorizeNode returns meaningless for empty node', () => {
        const node = { blocks: null };
        assertEqual(categorizeNode(node), 'meaningless');
    });

    await test('categorizeNode returns meaningless for node with no content', () => {
        const node = {
            blocks: {
                items: [
                    { block_type: 1, block_id: 'page1', children: [] }
                ]
            }
        };
        assertEqual(categorizeNode(node), 'meaningless');
    });

    await test('categorizeNode returns meaningful for node with substantial text content', () => {
        const node = {
            blocks: {
                items: [
                    { block_type: 1, block_id: 'page1', children: ['b1', 'b2', 'b3'] },
                    { block_type: 2, block_id: 'b1', text: { elements: [
                        { text_run: { content: 'This is a meaningful paragraph with enough text to be considered real content for documentation purposes.' } }
                    ] } },
                    { block_type: 2, block_id: 'b2', text: { elements: [
                        { text_run: { content: 'Another paragraph that adds more word count to the overall document content analysis.' } }
                    ] } },
                    { block_type: 2, block_id: 'b3', text: { elements: [
                        { text_run: { content: 'Yet more content to push the word count well above the threshold.' } }
                    ] } },
                ]
            }
        };
        assertEqual(categorizeNode(node), 'meaningful');
    });

    // --- generateSidebar ---
    await test('generateSidebar creates category and doc items', () => {
        const tree = {
            slug: 'root',
            title: 'Root',
            has_child: true,
            children: [
                {
                    slug: 'child-a',
                    title: 'Child A',
                    has_child: true,
                    children: [
                        { slug: 'grandchild-1', title: 'Grandchild 1' },
                    ],
                },
                { slug: 'child-b', title: 'Child B' },
            ],
        };
        const sidebar = generateSidebar(tree, { contentRoot: 'docs' });
        assertEqual(sidebar.length, 2);
        assertEqual(sidebar[0].type, 'category');
        assertEqual(sidebar[0].label, 'Child A');
        assertEqual(sidebar[0].items.length, 1);
        assertEqual(sidebar[1].type, 'doc');
        assertEqual(sidebar[1].id, 'docs/child-b');
    });

    await test('generateSidebar returns empty for node with no children', () => {
        const tree = { slug: 'empty', title: 'Empty' };
        const sidebar = generateSidebar(tree);
        assertEqual(sidebar.length, 0);
    });

    // --- generateSidebarJson ---
    await test('generateSidebarJson produces valid JSON', () => {
        const tree = {
            slug: 'root',
            title: 'Root',
            has_child: true,
            children: [
                { slug: 'intro', title: 'Introduction' },
            ],
        };
        const json = generateSidebarJson(tree, { contentRoot: 'docs' });
        const parsed = JSON.parse(json);
        assertEqual(parsed.length, 1);
        assertEqual(parsed[0].id, 'docs/intro');
    });
}

module.exports = { run };
