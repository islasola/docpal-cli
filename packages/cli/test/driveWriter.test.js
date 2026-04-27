/**
 * Tests for driveWriter module
 */

const { getDriveSidebarItems } = require('../lib/driveWriter');

async function run({ test, assertEqual, assertTrue, assertFalse, assertDeepEqual }) {
    // --- getDriveSidebarItems ---
    await test('getDriveSidebarItems creates categories for folders and docs for files', () => {
        const tree = {
            slug: 'root',
            name: 'root',
            type: 'folder',
            children: [
                {
                    type: 'folder',
                    name: 'getting-started',
                    slug: 'getting-started',
                    children: [
                        { type: 'docx', name: 'getting-started', slug: 'getting-started' },
                        { type: 'docx', name: 'install', slug: 'install' },
                    ],
                },
                { type: 'docx', name: 'readme', slug: 'readme' },
            ],
        };
        const items = getDriveSidebarItems(tree, 'docs');
        assertEqual(items.length, 2);

        // First item should be a category (folder with children)
        assertEqual(items[0].type, 'category');
        assertEqual(items[0].label, 'getting-started');
        // Category should have link because there's an index docx
        assertTrue(items[0].link !== undefined, 'Folder with index doc should have a link');
        // Items should contain the non-index docx children
        assertTrue(items[0].items.length >= 1, 'Should have at least one child doc');

        // Second item should be a doc
        assertEqual(items[1].type, 'doc');
        assertEqual(items[1].id, 'docs/readme');
    });

    await test('getDriveSidebarItems returns empty for null tree', () => {
        const items = getDriveSidebarItems(null);
        assertDeepEqual(items, []);
    });

    await test('getDriveSidebarItems returns empty for tree with no children', () => {
        const items = getDriveSidebarItems({}, '');
        assertDeepEqual(items, []);
    });

    await test('getDriveSidebarItems handles nested folders', () => {
        const tree = {
            slug: 'root',
            type: 'folder',
            children: [
                {
                    type: 'folder',
                    name: 'api',
                    slug: 'api',
                    children: [
                        {
                            type: 'folder',
                            name: 'v2',
                            slug: 'v2',
                            children: [
                                { type: 'docx', name: 'query', slug: 'query' },
                            ],
                        },
                    ],
                },
            ],
        };
        const items = getDriveSidebarItems(tree, 'docs');
        assertEqual(items.length, 1);
        assertEqual(items[0].type, 'category');
        assertEqual(items[0].items[0].type, 'category');
        assertEqual(items[0].items[0].items[0].id, 'docs/api/v2/query');
    });
}

module.exports = { run };
