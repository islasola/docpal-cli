/**
 * Tests for larkUtils module
 */

const LarkUtils = require('../lib/larkUtils');

async function run({ test, assertEqual, assertTrue, assertFalse, assertDeepEqual }) {
    // --- listValidTargets ---
    await test('listValidTargets returns target paths from nested config', () => {
        const utils = new LarkUtils();
        const config = {
            en: {
                milvus: { path: '/docs/en' },
                zilliz: { path: '/docs/zilliz/en' },
            },
            cn: {
                milvus: { path: '/docs/cn' },
            }
        };
        const targets = utils.listValidTargets(config);
        assertDeepEqual(targets.sort(), ['en.milvus', 'en.zilliz', 'cn.milvus'].sort());
    });

    // --- resolveTarget ---
    await test('resolveTarget resolves dot-separated path', () => {
        const utils = new LarkUtils();
        const config = { en: { milvus: { path: '/docs/en' } } };
        const result = utils.resolveTarget(config, 'en.milvus');
        assertEqual(result.path, '/docs/en');
    });

    await test('resolveTarget returns null for missing path', () => {
        const utils = new LarkUtils();
        const config = { en: { milvus: { path: '/docs/en' } } };
        const result = utils.resolveTarget(config, 'en.missing');
        assertEqual(result, null);
    });

    // --- detectBrokenLinks ---
    await test('detectBrokenLinks finds null links', () => {
        const utils = new LarkUtils();
        const content = 'Check out [this link](null) for more info.';
        const { broken, anchors } = utils.detectBrokenLinks(content);
        assertEqual(broken.length, 1);
        assertTrue(broken[0].includes('(null)'));
    });

    await test('detectBrokenLinks finds broken anchors', () => {
        const utils = new LarkUtils();
        const content = 'See [section](#) for details.';
        const { broken, anchors } = utils.detectBrokenLinks(content);
        assertEqual(anchors.length, 1);
        assertTrue(anchors[0].includes('#)'));
    });

    await test('detectBrokenLinks returns empty for clean content', () => {
        const utils = new LarkUtils();
        const content = 'This is [fine](https://example.com).';
        const { broken, anchors } = utils.detectBrokenLinks(content);
        assertEqual(broken.length, 0);
        assertEqual(anchors.length, 0);
    });

    // --- mergeFallbackSources ---
    await test('mergeFallbackSources inherits missing nodes from fallback', () => {
        const utils = new LarkUtils();
        const primary = new Map([['token1', { slug: 'a', title: 'A', children: [] }]]);
        const fallback = new Map([
            ['token1', { slug: 'a', title: 'A', children: [] }],
            ['token2', { slug: 'b', title: 'B', children: [] }],
        ]);
        const merged = utils.mergeFallbackSources(primary, fallback, 'wiki');
        assertEqual(merged.size, 2);
        assertTrue(merged.has('token2'));
    });

    // --- postprocessForMilvus ---
    await test('postprocessForMilvus replaces Tabs with div', () => {
        const utils = new LarkUtils();
        const content = '<Tabs groupId="code" defaultValue="python">\n<TabItem value=\'python\'>\n```python\nprint("hi")\n```\n</TabItem>\n</Tabs>';
        const result = utils.postprocessForMilvus(content);
        assertTrue(result.includes('<div class="multipleCode">'));
        assertFalse(result.includes('<Tabs'));
    });

    await test('postprocessForMilvus removes import statements', () => {
        const utils = new LarkUtils();
        const content = "import Tabs from '@theme/Tabs';\nSome content";
        const result = utils.postprocessForMilvus(content);
        assertFalse(result.includes('import Tabs'));
        assertTrue(result.includes('Some content'));
    });

    // --- convertLink with sourceMap ---
    await test('convertLink resolves wiki links from sourceMap', async () => {
        const sourceMap = new Map([
            ['nodeABC', { origin_node_token: 'nodeABC', slug: 'my-page', title: 'My Page', blocks: { items: [] } }],
        ]);
        const utils = new LarkUtils({ sourceMap });
        const resolved = await utils.convertLink('https://zilliverse.feishu.cn/wiki/nodeABC');
        assertEqual(resolved, './my-page');
    });

    await test('convertLink returns null for unknown links', async () => {
        const utils = new LarkUtils();
        const resolved = await utils.convertLink('https://zilliverse.feishu.cn/wiki/unknown');
        assertEqual(resolved, null);
    });

    await test('convertLink handles null input', async () => {
        const utils = new LarkUtils();
        const resolved = await utils.convertLink(null);
        assertEqual(resolved, null);
    });
}

module.exports = { run };
