const {
    blocksToMdx,
    BLOCK_TYPES,
    CODE_LANGS,
    _renderTextElements,
    _renderHeading,
    _renderBullet,
    _renderCode,
    _renderTable,
    _renderImage,
    _renderCallout,
    _renderQuote,
    _renderGrid,
    _showdownToMdxSafe,
    _applyStyleMarkdown,
    _renderEquation,
    _codeBlockSplit,
} = require('../lib/mdxWriter');

function makeBlock(type, data, blockId, children) {
    const block = { block_type: type, block_id: blockId || `blk_${type}_${Math.random().toString(36).slice(2, 8)}` };
    if (data) Object.assign(block, data);
    if (children) block.children = children;
    return block;
}

function makeTextElement(text, styles) {
    return {
        text_run: {
            content: text,
            text_element_style: styles || {}
        }
    };
}

function makeContext(overrides) {
    return Object.assign({
        blockMap: new Map(),
        resolveImage: null,
        target: null,
        docusaurusTabs: true,
        iframes: [],
        headingSlugMap: null,
        headingIndex: 0,
    }, overrides);
}

function run({ test, assertEqual, assertTrue, assertFalse, assertThrows }) {

    // --- BLOCK_TYPES ---
    test('BLOCK_TYPES: has correct known types', () => {
        assertEqual(BLOCK_TYPES[0], 'page', 'Index 0 should be page');
        assertEqual(BLOCK_TYPES[1], 'text', 'Index 1 should be text');
        assertEqual(BLOCK_TYPES[2], 'heading1', 'Index 2 should be heading1');
        assertEqual(BLOCK_TYPES[3], 'heading2', 'Index 3 should be heading2');
        assertEqual(BLOCK_TYPES[11], 'bullet', 'Index 11 should be bullet');
        assertEqual(BLOCK_TYPES[12], 'ordered', 'Index 12 should be ordered');
        assertEqual(BLOCK_TYPES[13], 'code', 'Index 13 should be code');
        assertEqual(BLOCK_TYPES[14], 'quote', 'Index 14 should be quote');
        assertEqual(BLOCK_TYPES[17], 'bitable', 'Index 17 should be bitable');
        assertEqual(BLOCK_TYPES[18], 'callout', 'Index 18 should be callout');
        assertEqual(BLOCK_TYPES[23], 'grid', 'Index 23 should be grid');
        assertEqual(BLOCK_TYPES[26], 'image', 'Index 26 should be image');
        assertEqual(BLOCK_TYPES[29], 'sheet', 'Index 29 should be sheet');
        assertEqual(BLOCK_TYPES[30], 'table', 'Index 30 should be table');
        assertEqual(BLOCK_TYPES[42], 'board', 'Index 42 should be board');
        assertEqual(BLOCK_TYPES[48], 'source_synced', 'Index 48 should be source_synced');
    });

    test('BLOCK_TYPES: has correct length', () => {
        assertTrue(BLOCK_TYPES.length >= 50, 'Should have at least 50 block types');
    });

    // --- CODE_LANGS ---
    test('CODE_LANGS: has correct known languages', () => {
        assertEqual(CODE_LANGS[0], null, 'Index 0 should be null');
        assertEqual(CODE_LANGS[7], 'Bash', 'Index 7 should be Bash');
        assertEqual(CODE_LANGS[30], 'JavaScript', 'Index 30 should be JavaScript');
        assertEqual(CODE_LANGS[49], 'Python', 'Index 49 should be Python');
        assertEqual(CODE_LANGS[53], 'Rust', 'Index 53 should be Rust');
        assertEqual(CODE_LANGS[63], 'TypeScript', 'Index 63 should be TypeScript');
    });

    test('CODE_LANGS: has 76 entries', () => {
        assertEqual(CODE_LANGS.length, 76, 'Should have 76 code languages');
    });

    // --- renderTextElements ---
    test('renderTextElements: plain text', async () => {
        const ctx = makeContext();
        const result = await _renderTextElements([
            makeTextElement('Hello world')
        ], ctx);
        assertEqual(result, 'Hello world', 'Should render plain text');
    });

    test('renderTextElements: bold text', async () => {
        const ctx = makeContext();
        const result = await _renderTextElements([
            makeTextElement('bold', { bold: true })
        ], ctx);
        assertEqual(result, '**bold**', 'Should render bold text');
    });

    test('renderTextElements: italic text', async () => {
        const ctx = makeContext();
        const result = await _renderTextElements([
            makeTextElement('italic', { italic: true })
        ], ctx);
        assertEqual(result, '*italic*', 'Should render italic text');
    });

    test('renderTextElements: inline code', async () => {
        const ctx = makeContext();
        const result = await _renderTextElements([
            makeTextElement('code', { inline_code: true })
        ], ctx);
        assertEqual(result, '`code`', 'Should render inline code');
    });

    test('renderTextElements: strikethrough text', async () => {
        const ctx = makeContext();
        const result = await _renderTextElements([
            makeTextElement('deleted', { strikethrough: true })
        ], ctx);
        assertEqual(result, '~~deleted~~', 'Should render strikethrough');
    });

    test('renderTextElements: link', async () => {
        const ctx = makeContext();
        const result = await _renderTextElements([
            makeTextElement('click here', { link: { url: 'https://example.com' } })
        ], ctx);
        assertTrue(result.includes('[click here](https://example.com)'), 'Should render link');
    });

    test('renderTextElements: empty elements returns empty string', async () => {
        const ctx = makeContext();
        const result = await _renderTextElements([], ctx);
        assertEqual(result, '', 'Should return empty string');
    });

    test('renderTextElements: null elements returns empty string', async () => {
        const ctx = makeContext();
        const result = await _renderTextElements(null, ctx);
        assertEqual(result, '', 'Should return empty string');
    });

    // --- renderHeading ---
    test('renderHeading: h2 with auto slug', async () => {
        const ctx = makeContext();
        const result = await _renderHeading({
            elements: [makeTextElement('Getting Started')]
        }, 2, ctx);
        assertTrue(result.startsWith('## '), 'Should start with ##');
        assertTrue(result.includes('{#getting-started}'), 'Should include slug anchor');
    });

    test('renderHeading: h1 with existing anchor', async () => {
        const ctx = makeContext();
        const result = await _renderHeading({
            elements: [makeTextElement('Title {#custom-anchor}')]
        }, 1, ctx);
        assertTrue(result.startsWith('# '), 'Should start with #');
        assertTrue(result.includes('{#custom-anchor}'), 'Should keep existing anchor');
        assertFalse(result.includes('{#title-custom-anchor}'), 'Should not add duplicate anchor');
    });

    test('renderHeading: returns empty for null heading', async () => {
        const ctx = makeContext();
        const result = await _renderHeading(null, 1, ctx);
        assertEqual(result, '', 'Should return empty for null');
    });

    // --- renderBullet ---
    test('renderBullet: simple bullet', async () => {
        const ctx = makeContext();
        const block = makeBlock(12, { bullet: { elements: [makeTextElement('Item 1')] } });
        const result = await _renderBullet(block, 0, ctx);
        assertTrue(result.startsWith('- '), 'Should start with - ');
        assertTrue(result.includes('Item 1'), 'Should include content');
    });

    test('renderBullet: nested bullets', async () => {
        const childId = 'child_1';
        const child = makeBlock(12, { bullet: { elements: [makeTextElement('Nested')] } }, childId);
        const blockMap = new Map();
        blockMap.set(childId, child);
        const ctx = makeContext({ blockMap });
        const parent = makeBlock(12, { bullet: { elements: [makeTextElement('Parent')] } }, 'parent_1', [childId]);
        const result = await _renderBullet(parent, 0, ctx);
        assertTrue(result.includes('- Parent'), 'Should include parent content');
        assertTrue(result.includes('    - Nested'), 'Should include nested content with indent');
    });

    // --- renderCode ---
    test('renderCode: standalone code block', async () => {
        const ctx = makeContext();
        const block = makeBlock(14, {
            code: {
                style: { language: 49 }, // Python
                elements: [makeTextElement('print("hello")')]
            }
        });
        const result = await _renderCode(block.code, 0, null, null, [block], ctx);
        assertTrue(result.includes('```python'), 'Should have python code fence');
        assertTrue(result.includes('print("hello")'), 'Should include code content');
        assertTrue(result.includes('```'), 'Should close code fence');
    });

    test('renderCode: adjacent code blocks create Tabs', async () => {
        const ctx = makeContext();
        const pyBlock = makeBlock(14, {
            code: { style: { language: 49 }, elements: [makeTextElement('print("py")')] }
        });
        const jsBlock = makeBlock(14, {
            code: { style: { language: 30 }, elements: [makeTextElement('console.log("js")')] }
        });
        const blocks = [pyBlock, jsBlock];
        const result = await _renderCode(pyBlock.code, 0, null, jsBlock, blocks, ctx);
        assertTrue(result.includes('<Tabs'), 'Should wrap in Tabs');
        assertTrue(result.includes("groupId=\"code\""), 'Should have groupId');
        assertTrue(result.includes("<TabItem value='python'>"), 'Should have Python tab');
    });

    test('renderCode: C++ returns empty', async () => {
        const ctx = makeContext();
        const block = makeBlock(14, {
            code: { style: { language: 9 }, elements: [makeTextElement('int x;')] } // C++ = 9
        });
        const result = await _renderCode(block.code, 0, null, null, [block], ctx);
        assertEqual(result, '', 'C++ code blocks should be skipped');
    });

    // --- renderImage ---
    test('renderImage: with resolveImage callback', async () => {
        const ctx = makeContext({
            resolveImage: async (token, meta) => `/img/${token}.png`
        });
        const result = await _renderImage({ token: 'img123', caption: { content: 'Diagram' } }, ctx);
        assertTrue(result.includes('![Diagram]'), 'Should include caption as alt text');
        assertTrue(result.includes('(/img/img123.png'), 'Should use resolved URL');
    });

    test('renderImage: without resolveImage uses slug', async () => {
        const ctx = makeContext();
        const result = await _renderImage({ token: 'img123', caption: { content: 'My Diagram' } }, ctx);
        assertTrue(result.includes('![My Diagram]'), 'Should include caption as alt text');
        assertTrue(result.includes('(/my-diagram.png'), 'Should use slugified path');
    });

    test('renderImage: null image returns empty', async () => {
        const ctx = makeContext();
        const result = await _renderImage(null, ctx);
        assertEqual(result, '', 'Should return empty for null');
    });

    // --- renderQuote ---
    test('renderQuote: note quote wraps in Admonition', async () => {
        const noteBlock = makeBlock(2, { text: { elements: [makeTextElement('Notes')] } }, 'note_h');
        const contentBlock = makeBlock(2, { text: { elements: [makeTextElement('Some detail')] } }, 'note_c');
        const blockMap = new Map();
        blockMap.set(noteBlock.block_id, noteBlock);
        blockMap.set(contentBlock.block_id, contentBlock);
        const quoteBlock = makeBlock(34, {}, 'quote_1', [noteBlock.block_id, contentBlock.block_id]);
        const ctx = makeContext({ blockMap });
        const result = await _renderQuote(quoteBlock, 0, ctx);
        assertTrue(result.includes('<Admonition'), 'Should include Admonition tag');
        assertTrue(result.includes('type="info"'), 'Should be info type');
        assertTrue(result.includes('</Admonition>'), 'Should close Admonition');
    });

    // --- renderCallout ---
    test('renderCallout: info callout', async () => {
        const titleBlock = makeBlock(2, { text: { elements: [makeTextElement('Tip Title')] } }, 'ct_title');
        const bodyBlock = makeBlock(2, { text: { elements: [makeTextElement('Tip body')] } }, 'ct_body');
        const blockMap = new Map();
        blockMap.set(titleBlock.block_id, titleBlock);
        blockMap.set(bodyBlock.block_id, bodyBlock);
        const calloutBlock = makeBlock(19, {
            callout: { emoji_id: 'smile' }
        }, 'callout_1', [titleBlock.block_id, bodyBlock.block_id]);
        const ctx = makeContext({ blockMap });
        const result = await _renderCallout(calloutBlock, 0, ctx);
        assertTrue(result.includes('<Admonition'), 'Should include Admonition');
        assertTrue(result.includes('type="info"'), 'Should be info type');
        assertTrue(result.includes('Tip Title'), 'Should include title');
    });

    test('renderCallout: danger callout for construction emoji', async () => {
        const titleBlock = makeBlock(2, { text: { elements: [makeTextElement('Warning')] } }, 'ct_title2');
        const blockMap = new Map();
        blockMap.set(titleBlock.block_id, titleBlock);
        const calloutBlock = makeBlock(19, {
            callout: { emoji_id: 'construction' }
        }, 'callout_2', [titleBlock.block_id]);
        const ctx = makeContext({ blockMap });
        const result = await _renderCallout(calloutBlock, 0, ctx);
        assertTrue(result.includes('type="danger"'), 'Should be danger type');
    });

    test('renderCallout: blue_book emoji renders as info', async () => {
        const titleBlock = makeBlock(2, { text: { elements: [makeTextElement('Notes')] } }, 'ct_title3');
        const blockMap = new Map();
        blockMap.set(titleBlock.block_id, titleBlock);
        const calloutBlock = makeBlock(19, {
            callout: { emoji_id: 'blue_book' }
        }, 'callout_3', [titleBlock.block_id]);
        const ctx = makeContext({ blockMap });
        const result = await _renderCallout(calloutBlock, 0, ctx);
        assertTrue(result.includes('type="info"'), 'Should be info type');
        assertTrue(result.includes('icon="📘"'), 'Should use 📘 icon');
    });

    test('renderCallout: notebook emoji renders as info', async () => {
        const titleBlock = makeBlock(2, { text: { elements: [makeTextElement('Notes')] } }, 'ct_title4');
        const blockMap = new Map();
        blockMap.set(titleBlock.block_id, titleBlock);
        const calloutBlock = makeBlock(19, {
            callout: { emoji_id: 'notebook' }
        }, 'callout_4', [titleBlock.block_id]);
        const ctx = makeContext({ blockMap });
        const result = await _renderCallout(calloutBlock, 0, ctx);
        assertTrue(result.includes('type="info"'), 'Should be info type');
        assertTrue(result.includes('icon="📘"'), 'Should use 📘 icon');
    });

    test('renderCallout: light_bulb emoji renders as tip', async () => {
        const titleBlock = makeBlock(2, { text: { elements: [makeTextElement('Tip')] } }, 'ct_title5');
        const blockMap = new Map();
        blockMap.set(titleBlock.block_id, titleBlock);
        const calloutBlock = makeBlock(19, {
            callout: { emoji_id: 'light_bulb' }
        }, 'callout_5', [titleBlock.block_id]);
        const ctx = makeContext({ blockMap });
        const result = await _renderCallout(calloutBlock, 0, ctx);
        assertTrue(result.includes('type="tip"'), 'Should be tip type');
        assertTrue(result.includes('icon="💡"'), 'Should use 💡 icon');
    });

    test('renderCallout: fire emoji renders as caution', async () => {
        const titleBlock = makeBlock(2, { text: { elements: [makeTextElement('Caution')] } }, 'ct_title6');
        const blockMap = new Map();
        blockMap.set(titleBlock.block_id, titleBlock);
        const calloutBlock = makeBlock(19, {
            callout: { emoji_id: 'fire' }
        }, 'callout_6', [titleBlock.block_id]);
        const ctx = makeContext({ blockMap });
        const result = await _renderCallout(calloutBlock, 0, ctx);
        assertTrue(result.includes('type="caution"'), 'Should be caution type');
        assertTrue(result.includes('icon="🔥"'), 'Should use 🔥 icon');
    });

    test('renderCallout: warning emoji renders as warning', async () => {
        const titleBlock = makeBlock(2, { text: { elements: [makeTextElement('Warning')] } }, 'ct_title7');
        const blockMap = new Map();
        blockMap.set(titleBlock.block_id, titleBlock);
        const calloutBlock = makeBlock(19, {
            callout: { emoji_id: 'warning' }
        }, 'callout_7', [titleBlock.block_id]);
        const ctx = makeContext({ blockMap });
        const result = await _renderCallout(calloutBlock, 0, ctx);
        assertTrue(result.includes('type="warning"'), 'Should be warning type');
        assertTrue(result.includes('icon="⚠️"'), 'Should use ⚠️ icon');
    });

    // --- renderTable ---
    test('renderTable: basic table', async () => {
        // Create cell blocks
        const cells = ['h1', 'h2', 'd1', 'd2'].map((text, i) => {
            const cellBlockId = `cell_${i}`;
            const textBlockId = `text_${i}`;
            const textBlock = makeBlock(2, { text: { elements: [makeTextElement(text)] } }, textBlockId);
            const cellBlock = makeBlock(32, {}, cellBlockId, [textBlockId]);
            return { cellBlockId, textBlockId, textBlock, cellBlock };
        });

        const blockMap = new Map();
        cells.forEach(c => {
            blockMap.set(c.cellBlockId, c.cellBlock);
            blockMap.set(c.textBlockId, c.textBlock);
        });

        const ctx = makeContext({ blockMap });
        const result = await _renderTable({
            cells: cells.map(c => c.cellBlockId),
            property: { row_size: 2, column_size: 2, merge_info: [{}, {}, {}, {}] }
        }, 0, ctx);
        assertTrue(result.includes('<table>'), 'Should include table tag');
        assertTrue(result.includes('<th>'), 'Should include header cells');
        assertTrue(result.includes('<td>'), 'Should include data cells');
        assertTrue(result.includes('h1'), 'Should include cell content h1');
        assertTrue(result.includes('d2'), 'Should include cell content d2');
    });

    // --- renderGrid ---
    test('renderGrid: two-column grid', async () => {
        const col1TextId = 'g_t1';
        const col1Text = makeBlock(2, { text: { elements: [makeTextElement('Left')] } }, col1TextId);
        const col2TextId = 'g_t2';
        const col2Text = makeBlock(2, { text: { elements: [makeTextElement('Right')] } }, col2TextId);

        const col1Id = 'g_c1';
        const col1 = makeBlock(25, { grid_column: { width_ratio: 1 } }, col1Id, [col1TextId]);
        const col2Id = 'g_c2';
        const col2 = makeBlock(25, { grid_column: { width_ratio: 1 } }, col2Id, [col2TextId]);

        const blockMap = new Map();
        [col1Text, col2Text, col1, col2].forEach(b => blockMap.set(b.block_id, b));

        const gridBlock = makeBlock(24, { grid: { column_size: 2 } }, 'grid_1', [col1Id, col2Id]);
        const ctx = makeContext({ blockMap });

        const result = await _renderGrid(gridBlock, 0, ctx);
        assertTrue(result.includes('<Grid'), 'Should include Grid tag');
        assertTrue(result.includes('columnSize="2"'), 'Should have columnSize');
        assertTrue(result.includes('Left'), 'Should include left content');
        assertTrue(result.includes('Right'), 'Should include right content');
        assertTrue(result.includes('</Grid>'), 'Should close Grid');
    });

    // --- showdownToMdxSafe ---
    test('showdownToMdxSafe: escapes curly braces', () => {
        const result = _showdownToMdxSafe('Use {variable} here');
        assertTrue(result.includes('\\{variable\\}'), 'Should escape curly braces');
    });

    test('showdownToMdxSafe: preserves code blocks', () => {
        const result = _showdownToMdxSafe('<pre><code>const x = {a: 1};</code></pre>');
        assertTrue(result.includes('{a: 1}'), 'Should not escape braces in code');
        assertFalse(result.includes('\\{a'), 'Should not escape inside code');
    });

    test('showdownToMdxSafe: converts pre/code to fenced blocks', () => {
        const result = _showdownToMdxSafe('<pre><code class="language-python">x = 1</code></pre>');
        assertTrue(result.includes('```python'), 'Should create fenced code block');
        assertTrue(result.includes('x = 1'), 'Should include code content');
    });

    // --- applyStyleMarkdown ---
    test('applyStyleMarkdown: single bold element', () => {
        const elements = [makeTextElement('bold', { bold: true })];
        const result = _applyStyleMarkdown(elements[0], elements, 'bold', '**');
        assertEqual(result, '**bold**', 'Should wrap single bold element');
    });

    test('applyStyleMarkdown: first of consecutive bold', () => {
        const elements = [
            makeTextElement('hello ', { bold: true }),
            makeTextElement('world', { bold: true })
        ];
        const result = _applyStyleMarkdown(elements[0], elements, 'bold', '**');
        assertTrue(result.startsWith('**'), 'Should start bold on first element');
        assertFalse(result.endsWith('**'), 'Should not end bold on first element');
    });

    test('applyStyleMarkdown: last of consecutive bold', () => {
        const elements = [
            makeTextElement('hello ', { bold: true }),
            makeTextElement('world', { bold: true })
        ];
        const result = _applyStyleMarkdown(elements[1], elements, 'bold', '**');
        assertTrue(result.endsWith('**'), 'Should end bold on last element');
        assertFalse(result.startsWith('**'), 'Should not start bold on last element');
    });

    // --- renderEquation ---
    test('renderEquation: standalone block equation', () => {
        const elements = [{ equation: { content: 'E = mc^2' } }];
        const result = _renderEquation(elements[0], elements);
        assertTrue(result.includes('$$'), 'Should be block equation with $$');
        assertTrue(result.includes('E = mc^2'), 'Should include equation content');
    });

    test('renderEquation: inline equation', () => {
        const elements = [
            makeTextElement('The formula '),
            { equation: { content: 'x^2' } },
            makeTextElement(' is simple')
        ];
        const result = _renderEquation(elements[1], elements);
        assertEqual(result, '$x^2$', 'Should be inline equation with single $');
    });

    test('renderEquation: empty content returns empty', () => {
        const elements = [{ equation: { content: '' } }];
        const result = _renderEquation(elements[0], elements);
        assertEqual(result, '', 'Should return empty for empty equation');
    });

    // --- codeBlockSplit ---
    test('codeBlockSplit: standalone code block', () => {
        const result = _codeBlockSplit('print("hello")', 0, 'Python');
        assertTrue(result.includes('```python'), 'Should have python fence');
        assertTrue(result.includes('print("hello")'), 'Should include code');
        assertTrue(result.includes('```'), 'Should close fence');
    });

    test('codeBlockSplit: first block in tab group', () => {
        const values = [
            { label: 'Python', value: 'python' },
            { label: 'JavaScript', value: 'javascript' }
        ];
        const result = _codeBlockSplit('print("hi")', 0, 'Python', 'first', values);
        assertTrue(result.includes('<Tabs'), 'Should include Tabs opening');
        assertTrue(result.includes("<TabItem value='python'>"), 'Should have python TabItem');
        assertTrue(result.includes('```python'), 'Should have code fence');
    });

    test('codeBlockSplit: last block in tab group', () => {
        const result = _codeBlockSplit('console.log("hi")', 0, 'JavaScript', 'last');
        assertTrue(result.includes("<TabItem value='javascript'>"), 'Should have js TabItem');
        assertTrue(result.includes('</Tabs>'), 'Should close Tabs');
    });

    test('codeBlockSplit: middle block in tab group', () => {
        const result = _codeBlockSplit('fmt.Println("hi")', 0, 'Go', 'middle');
        assertTrue(result.includes("<TabItem value='go'>"), 'Should have go TabItem');
        assertFalse(result.includes('<Tabs'), 'Should not open Tabs');
        assertFalse(result.includes('</Tabs>'), 'Should not close Tabs');
    });

    // --- blocksToMdx integration ---
    test('blocksToMdx: simple text page', async () => {
        const pageId = 'page_root';
        const textId = 'text_1';
        const blocks = [
            makeBlock(1, { page: { elements: [makeTextElement('My Page Title')] } }, pageId, [textId]),
            makeBlock(2, { text: { elements: [makeTextElement('Hello world')] } }, textId),
        ];
        const result = await blocksToMdx(blocks);
        assertTrue(result.includes('# My Page Title'), 'Should include page title');
        assertTrue(result.includes('Hello world'), 'Should include text content');
    });

    test('blocksToMdx: heading and paragraph', async () => {
        const pageId = 'page_r2';
        const h2Id = 'h2_1';
        const textId = 'text_r2';
        const blocks = [
            makeBlock(1, { page: { elements: [makeTextElement('Title')] } }, pageId, [h2Id, textId]),
            makeBlock(4, { heading2: { elements: [makeTextElement('Section')] } }, h2Id),
            makeBlock(2, { text: { elements: [makeTextElement('Content here')] } }, textId),
        ];
        const result = await blocksToMdx(blocks);
        assertTrue(result.includes('# Title'), 'Should have h1 title');
        assertTrue(result.includes('## Section'), 'Should have h2 heading');
        assertTrue(result.includes('Content here'), 'Should include paragraph');
    });

    test('blocksToMdx: code block renders', async () => {
        const pageId = 'page_r3';
        const codeId = 'code_r3';
        const blocks = [
            makeBlock(1, { page: { elements: [makeTextElement('Code Page')] } }, pageId, [codeId]),
            makeBlock(14, { code: { style: { language: 49 }, elements: [makeTextElement('x = 42')] } }, codeId),
        ];
        const result = await blocksToMdx(blocks);
        assertTrue(result.includes('```python'), 'Should have python fence');
        assertTrue(result.includes('x = 42'), 'Should include code content');
    });

    test('blocksToMdx: empty blocks array returns empty', async () => {
        const result = await blocksToMdx([]);
        assertEqual(result, '', 'Should return empty for empty blocks');
    });

    test('blocksToMdx: applies target filtering', async () => {
        const pageId = 'page_r4';
        const textId = 'text_r4';
        const blocks = [
            makeBlock(1, { page: { elements: [makeTextElement('Title')] } }, pageId, [textId]),
            makeBlock(2, { text: { elements: [makeTextElement('<include target="milvus-docs">milvus only</include> shared')] } }, textId),
        ];
        const result = await blocksToMdx(blocks, { target: 'zilliz-docs' });
        assertFalse(result.includes('milvus only'), 'Should exclude milvus content');
        assertTrue(result.includes('shared'), 'Should keep shared content');
    });

    test('blocksToMdx: image with resolveImage', async () => {
        const pageId = 'page_r5';
        const imgId = 'img_r5';
        const blocks = [
            makeBlock(1, { page: { elements: [makeTextElement('Img Page')] } }, pageId, [imgId]),
            makeBlock(27, { image: { token: 'ftok123', caption: { content: 'A diagram' } } }, imgId),
        ];
        const result = await blocksToMdx(blocks, {
            resolveImage: async (token) => `https://cdn.example.com/${token}.png`
        });
        assertTrue(result.includes('![A diagram]'), 'Should include alt text');
        assertTrue(result.includes('(https://cdn.example.com/ftok123.png'), 'Should use resolved URL');
    });

    test('blocksToMdx: ordered list', async () => {
        const pageId = 'page_r6';
        const itemId1 = 'ol_1';
        const itemId2 = 'ol_2';
        const blocks = [
            makeBlock(1, { page: { elements: [makeTextElement('List Page')] } }, pageId, [itemId1, itemId2]),
            makeBlock(13, { ordered: { elements: [makeTextElement('First item')] } }, itemId1),
            makeBlock(13, { ordered: { elements: [makeTextElement('Second item')] } }, itemId2),
        ];
        const result = await blocksToMdx(blocks);
        assertTrue(result.includes('1. First item'), 'Should have first ordered item');
        assertTrue(result.includes('1. Second item'), 'Should have second ordered item');
    });

    test('blocksToMdx: cleans up excessive newlines', async () => {
        const pageId = 'page_r7';
        const t1 = 't_r7_1';
        const t2 = 't_r7_2';
        const blocks = [
            makeBlock(1, { page: { elements: [makeTextElement('Title')] } }, pageId, [t1, t2]),
            makeBlock(2, { text: { elements: [makeTextElement('A')] } }, t1),
            makeBlock(2, { text: { elements: [makeTextElement('B')] } }, t2),
        ];
        const result = await blocksToMdx(blocks);
        assertFalse(result.includes('\n\n\n'), 'Should collapse excessive newlines');
    });

    test('blocksToMdx: renders sheet block', async () => {
        const pageId = 'page_sheet';
        const sheetId = 'sheet_1';
        const blocks = [
            makeBlock(1, { page: { elements: [makeTextElement('Sheet Page')] } }, pageId, [sheetId]),
            makeBlock(30, {
                sheet: {
                    meta: { data: { sheet: { merges: [] } } },
                    values: { data: { valueRange: { values: [['Header1', 'Header2'], ['val1', 'val2']] } } }
                }
            }, sheetId),
        ];
        const result = await blocksToMdx(blocks);
        assertTrue(result.includes('<table>'), 'Should render table for sheet');
        assertTrue(result.includes('Header1'), 'Should include header');
        assertTrue(result.includes('val1'), 'Should include values');
    });

    test('blocksToMdx: mention_doc renders as link', async () => {
        const pageId = 'page_mention';
        const textId = 'text_mention';
        const blocks = [
            makeBlock(1, { page: { elements: [makeTextElement('Title')] } }, pageId, [textId]),
            makeBlock(2, {
                text: {
                    elements: [{
                        mention_doc: {
                            title: 'Other Doc',
                            url: 'https://example.com/doc/abc'
                        }
                    }]
                }
            }, textId),
        ];
        const result = await blocksToMdx(blocks);
        assertTrue(result.includes('[Other Doc](https://example.com/doc/abc)'), 'Should render mention as link');
    });

    test('blocksToMdx: docusaurusTabs=false disables tab wrapping', async () => {
        const pageId = 'page_notabs';
        const pyId = 'py_notabs';
        const jsId = 'js_notabs';
        const blocks = [
            makeBlock(1, { page: { elements: [makeTextElement('Title')] } }, pageId, [pyId, jsId]),
            makeBlock(14, { code: { style: { language: 49 }, elements: [makeTextElement('x=1')] } }, pyId),
            makeBlock(14, { code: { style: { language: 30 }, elements: [makeTextElement('y=1')] } }, jsId),
        ];
        const result = await blocksToMdx(blocks, { docusaurusTabs: false });
        assertFalse(result.includes('<Tabs'), 'Should not create Tabs when disabled');
        assertTrue(result.includes('```python'), 'Should still have python code');
        assertTrue(result.includes('```javascript'), 'Should still have js code');
    });

    // --- renderHeading with headingSlugMap ---
    test('renderHeading: uses slug map for heading slug', async () => {
        const ctx = makeContext({
            headingSlugMap: ['chinese-quick-start'],
            headingIndex: 0,
        });
        const result = await _renderHeading({
            elements: [makeTextElement('快速开始')]
        }, 2, ctx);
        assertTrue(result.includes('{#chinese-quick-start}'), 'Should use slug from map');
        assertEqual(ctx.headingIndex, 1, 'Should increment heading index');
    });

    test('renderHeading: falls back when slug map is null', async () => {
        const ctx = makeContext();
        const result = await _renderHeading({
            elements: [makeTextElement('Getting Started')]
        }, 2, ctx);
        assertTrue(result.includes('{#getting-started}'), 'Should fallback to slugify');
    });

    test('renderHeading: advances index for each heading', async () => {
        const ctx = makeContext({
            headingSlugMap: ['first-heading', 'second-heading'],
            headingIndex: 0,
        });
        await _renderHeading({ elements: [makeTextElement('A')] }, 2, ctx);
        await _renderHeading({ elements: [makeTextElement('B')] }, 2, ctx);
        assertEqual(ctx.headingIndex, 2, 'Should have counted 2 headings');
    });

    test('blocksToMdx: uses headingSlugMap option', async () => {
        const pageId = 'page_slugmap';
        const h2a = 'h2_sla';
        const h2b = 'h2_slb';
        const blocks = [
            makeBlock(1, { page: { elements: [makeTextElement('Title')] } }, pageId, [h2a, h2b]),
            makeBlock(4, { heading2: { elements: [makeTextElement('第一章')] } }, h2a),
            makeBlock(4, { heading2: { elements: [makeTextElement('第二章')] } }, h2b),
        ];
        const result = await blocksToMdx(blocks, {
            headingSlugMap: ['chapter-one', 'chapter-two'],
        });
        assertTrue(result.includes('{#chapter-one}'), 'Should use first slug from map');
        assertTrue(result.includes('{#chapter-two}'), 'Should use second slug from map');
    });

    // --- Metadata comment exports ---
    test('blocksToMdx: exports board as metadata comment', async () => {
        const pageId = 'page_board';
        const boardId = 'board_123';
        const blocks = [
            makeBlock(1, { page: { elements: [] } }, pageId, [boardId]),
            makeBlock(43, { board: { token: 'whitabc123' } }, boardId),
        ];
        const result = await blocksToMdx(blocks, {});
        assertTrue(result.includes('<!-- feishu-block: board, token: whitabc123 -->'), 'Should export board as metadata comment');
    });

    test('blocksToMdx: exports figma iframe as metadata comment', async () => {
        const pageId = 'page_figma';
        const iframeId = 'iframe_123';
        const blocks = [
            makeBlock(1, { page: { elements: [] } }, pageId, [iframeId]),
            makeBlock(26, { iframe: { component: { iframe_type: 8, url: 'https://figma.com/file/xyz' } } }, iframeId),
        ];
        const result = await blocksToMdx(blocks, {});
        assertTrue(result.includes('<!-- feishu-block: iframe, type: 8, url: https://figma.com/file/xyz -->'), 'Should export figma iframe as metadata comment');
    });

    test('blocksToMdx: exports superdemo as metadata comment', async () => {
        const pageId = 'page_supademo';
        const addonsId = 'addons_123';
        const blocks = [
            makeBlock(1, { page: { elements: [] } }, pageId, [addonsId]),
            makeBlock(40, { add_ons: { component_type_id: 'blk_682093ba9580c002363b9dc3', record: JSON.stringify({ id: 'demo123', isShowcase: true }) } }, addonsId),
        ];
        const result = await blocksToMdx(blocks, {});
        assertTrue(result.includes('<!-- feishu-block: superdemo, id: demo123, isShowcase: true -->'), 'Should export superdemo as metadata comment');
    });

    test('blocksToMdx: exports superdemo with isShowcase false', async () => {
        const pageId = 'page_supademo2';
        const addonsId = 'addons_456';
        const blocks = [
            makeBlock(1, { page: { elements: [] } }, pageId, [addonsId]),
            makeBlock(40, { add_ons: { component_type_id: 'blk_682093ba9580c002363b9dc3', record: JSON.stringify({ id: 'demo456', isShowcase: false }) } }, addonsId),
        ];
        const result = await blocksToMdx(blocks, {});
        assertTrue(result.includes('<!-- feishu-block: superdemo, id: demo456, isShowcase: false -->'), 'Should export superdemo with isShowcase false');
    });
}

module.exports = { run };
