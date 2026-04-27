/**
 * Tests for docScraper module
 * Uses mock clients since we can't hit real Feishu API in tests
 */

// Note: docScraper depends on larkDocClient and bitableClient singletons.
// These tests verify the class structure and data manipulation logic
// rather than making real API calls.

const DocScraper = require('../lib/docScraper');

async function run({ test, assertEqual, assertTrue, assertFalse, assertDeepEqual }) {
    // --- constructor ---
    await test('constructor sets properties correctly', () => {
        const scraper = new DocScraper({
            rootToken: 'wikiToken123',
            baseToken: 'baseToken456',
            sourceType: 'wiki',
            spaceId: 'space789',
        });
        assertEqual(scraper.rootToken, 'wikiToken123');
        assertEqual(scraper.baseToken, 'baseToken456');
        assertEqual(scraper.sourceType, 'wiki');
        assertEqual(scraper.spaceId, 'space789');
        assertEqual(scraper.tree, null);
        assertDeepEqual(scraper.slugs, {});
        assertEqual(scraper.sourceMap.size, 0);
    });

    // --- _uniquify ---
    await test('_uniquify returns unique slugs', () => {
        const scraper = new DocScraper({ rootToken: 'x', sourceType: 'wiki' });
        const result = scraper._uniquify(['foo', 'bar', 'foo']);
        assertEqual(result.length, 3);
        assertEqual(result[0], 'foo');
        assertEqual(result[1], 'bar');
        assertEqual(result[2], 'foo_1');
    });

    await test('_uniquify handles multiple duplicates', () => {
        const scraper = new DocScraper({ rootToken: 'x', sourceType: 'wiki' });
        const result = scraper._uniquify(['a', 'a', 'a']);
        assertEqual(result[0], 'a');
        assertEqual(result[1], 'a_1');
        assertEqual(result[2], 'a_2');
    });

    // --- _slugify (with pre-loaded slugs) ---
    await test('_slugify returns slug from slugs map', async () => {
        const scraper = new DocScraper({ rootToken: 'x', sourceType: 'wiki' });
        scraper.slugs = { 'token1': { slug: 'my-page', title: 'My Page' } };
        const slug = await scraper._slugify('token1');
        assertEqual(slug, 'my-page');
    });

    await test('_slugify falls back to title match', async () => {
        const scraper = new DocScraper({ rootToken: 'x', sourceType: 'wiki' });
        scraper.slugs = { 'token1': { slug: 'my-page', title: 'My Page' } };
        const slug = await scraper._slugify('unknown_token', 'My Page');
        assertEqual(slug, 'my-page');
    });

    await test('_slugify generates slug from title when not found', async () => {
        const scraper = new DocScraper({ rootToken: 'x', sourceType: 'wiki' });
        scraper.slugs = {};
        const slug = await scraper._slugify('unknown_token', 'Hello World');
        assertEqual(slug, 'hello-world');
    });

    // --- _fetchBlockChildren ---
    await test('_fetchBlockChildren collects nested children', () => {
        const scraper = new DocScraper({ rootToken: 'x', sourceType: 'wiki' });
        const block = {
            children: ['child1'],
        };
        const node = {
            blocks: {
                items: [
                    { block_id: 'child1', children: ['grandchild1'] },
                    { block_id: 'grandchild1', children: null },
                ]
            }
        };
        const children = scraper._fetchBlockChildren(block, node);
        assertEqual(children.length, 2);
        assertEqual(children[0].block_id, 'child1');
        assertEqual(children[1].block_id, 'grandchild1');
    });

    // --- _validateTree ---
    await test('_validateTree passes for valid docx nodes', () => {
        const scraper = new DocScraper({ rootToken: 'x', sourceType: 'wiki' });
        scraper.sourceMap.set('t1', {
            obj_type: 'docx',
            blocks: { items: [{ block_type: 1 }], counts: 1 }
        });
        // Should not throw
        scraper._validateTree();
    });

    await test('_validateTree throws for docx with no blocks', () => {
        const scraper = new DocScraper({ rootToken: 'x', sourceType: 'wiki' });
        scraper.sourceMap.set('t1', {
            obj_type: 'docx',
            blocks: null
        });
        let threw = false;
        try {
            scraper._validateTree();
        } catch (err) {
            threw = true;
            assertTrue(err.message.includes('missing blocks'));
        }
        assertTrue(threw, 'Should throw for docx with no blocks');
    });

    await test('_validateTree ignores non-docx nodes', () => {
        const scraper = new DocScraper({ rootToken: 'x', sourceType: 'wiki' });
        scraper.sourceMap.set('t1', { type: 'folder', blocks: null });
        // Should not throw
        scraper._validateTree();
    });
}

module.exports = { run };
