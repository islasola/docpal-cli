/**
 * Tests for markdownToFeishu module
 */

const MarkdownToFeishu = require('../lib/markdownToFeishu');

async function run({ test, assertEqual, assertTrue, assertFalse, assertDeepEqual }) {
    // --- convert ---
    await test('converts heading to Feishu block', async () => {
        const converter = new MarkdownToFeishu();
        const blocks = await converter.convert('# Hello World');
        assertTrue(blocks.length >= 1);
        const heading = blocks.find(b => b.block_type === 3);
        assertTrue(heading !== undefined, 'Should have a heading1 block');
        assertTrue(heading.heading1 !== undefined, 'Should have heading1 property');
    });

    await test('converts paragraph to Feishu text block', async () => {
        const converter = new MarkdownToFeishu();
        const blocks = await converter.convert('This is a paragraph.');
        assertTrue(blocks.length >= 1);
        const textBlock = blocks.find(b => b.block_type === 2);
        assertTrue(textBlock !== undefined, 'Should have a text block');
    });

    await test('converts code block', async () => {
        const converter = new MarkdownToFeishu();
        const blocks = await converter.convert('```python\nprint("hello")\n```');
        assertTrue(blocks.length >= 1);
        const codeBlock = blocks.find(b => b.block_type === 14);
        assertTrue(codeBlock !== undefined, 'Should have a code block');
        assertTrue(codeBlock.code !== undefined, 'Code block should have code property');
        assertEqual(codeBlock.code.style.language, 51); // Python = 51
    });

    await test('converts unordered list', async () => {
        const converter = new MarkdownToFeishu();
        const blocks = await converter.convert('- Item 1\n- Item 2');
        const bullets = blocks.filter(b => b.block_type === 12);
        assertTrue(bullets.length >= 2, 'Should have at least 2 bullet blocks');
    });

    await test('converts ordered list', async () => {
        const converter = new MarkdownToFeishu();
        const blocks = await converter.convert('1. First\n2. Second');
        const ordered = blocks.filter(b => b.block_type === 13);
        assertTrue(ordered.length >= 2, 'Should have at least 2 ordered blocks');
    });

    await test('converts divider', async () => {
        const converter = new MarkdownToFeishu();
        const blocks = await converter.convert('---');
        const divider = blocks.find(b => b.block_type === 22);
        assertTrue(divider !== undefined, 'Should have a divider block');
    });

    await test('strips YAML frontmatter', async () => {
        const converter = new MarkdownToFeishu();
        const content = '---\ntitle: Test\nslug: test\n---\n# Hello';
        const blocks = await converter.convert(content);
        // Should not create a text block with "---"
        const dashBlock = blocks.find(b =>
            b.text && b.text.elements && b.text.elements.some(e =>
                e.text_run && e.text_run.content && e.text_run.content.includes('---')
            )
        );
        assertFalse(dashBlock !== undefined, 'Should not have frontmatter as content');
    });

    // --- _parseInlineMarkdown ---
    await test('parses bold text', async () => {
        const converter = new MarkdownToFeishu();
        const elements = converter._parseInlineMarkdown('**bold**');
        const bold = elements.find(e => e.text_run && e.text_run.text_element_style && e.text_run.text_element_style.bold);
        assertTrue(bold !== undefined, 'Should have a bold element');
        assertEqual(bold.text_run.content, 'bold');
    });

    await test('parses italic text', async () => {
        const converter = new MarkdownToFeishu();
        const elements = converter._parseInlineMarkdown('*italic*');
        const italic = elements.find(e => e.text_run && e.text_run.text_element_style && e.text_run.text_element_style.italic);
        assertTrue(italic !== undefined, 'Should have an italic element');
    });

    await test('parses inline code', async () => {
        const converter = new MarkdownToFeishu();
        const elements = converter._parseInlineMarkdown('`code`');
        const code = elements.find(e => e.text_run && e.text_run.text_element_style && e.text_run.text_element_style.inline_code);
        assertTrue(code !== undefined, 'Should have an inline code element');
    });

    await test('parses links', async () => {
        const converter = new MarkdownToFeishu();
        const elements = converter._parseInlineMarkdown('[text](url)');
        const link = elements.find(e => e.text_run && e.text_run.text_element_style && e.text_run.text_element_style.link);
        assertTrue(link !== undefined, 'Should have a link element');
        assertEqual(link.text_run.content, 'text');
        assertEqual(link.text_run.text_element_style.link.url, 'url');
    });

    // --- heading with slug ---
    await test('heading strips {#slug} from text', async () => {
        const converter = new MarkdownToFeishu();
        const blocks = await converter.convert('# My Title {#my-title}');
        const heading = blocks.find(b => b.block_type === 3);
        assertTrue(heading !== undefined);
        const text = heading.heading1.elements[0].text_run.content;
        assertFalse(text.includes('{#my-title}'), 'Slug annotation should be stripped');
    });

    // --- heading levels ---
    await test('maps heading depths to correct block types', async () => {
        const converter = new MarkdownToFeishu();
        const blocks = await converter.convert('# H1\n## H2\n### H3');
        const h1 = blocks.find(b => b.block_type === 3);
        const h2 = blocks.find(b => b.block_type === 4);
        const h3 = blocks.find(b => b.block_type === 5);
        assertTrue(h1 !== undefined, 'Should have heading1 (type 3)');
        assertTrue(h2 !== undefined, 'Should have heading2 (type 4)');
        assertTrue(h3 !== undefined, 'Should have heading3 (type 5)');
    });

    // --- standalone JSX tags preserved ---
    await test('preserves standalone Procedures opening tag', async () => {
        const converter = new MarkdownToFeishu();
        const blocks = await converter.convert('<Procedures>\n\n1. Step one\n\n</Procedures>');
        const openTag = blocks.find(b =>
            b.block_type === 2 && b.text?.elements?.[0]?.text_run?.content === '<Procedures>'
        );
        assertTrue(openTag !== undefined, 'Should preserve <Procedures> as text block');
    });

    await test('preserves standalone Procedures closing tag', async () => {
        const converter = new MarkdownToFeishu();
        const blocks = await converter.convert('<Procedures>\n\n1. Step one\n\n</Procedures>');
        const closeTag = blocks.find(b =>
            b.block_type === 2 && b.text?.elements?.[0]?.text_run?.content === '</Procedures>'
        );
        assertTrue(closeTag !== undefined, 'Should preserve </Procedures> as text block');
    });

    await test('preserves ordered list items inside Procedures', async () => {
        const converter = new MarkdownToFeishu();
        const blocks = await converter.convert('<Procedures>\n\n1. Step one\n1. Step two\n\n</Procedures>');
        const ordered = blocks.filter(b => b.block_type === 13);
        assertTrue(ordered.length >= 2, 'Should have at least 2 ordered list blocks inside Procedures');
    });

    await test('strips unknown PascalCase HTML tags in fallback', async () => {
        const converter = new MarkdownToFeishu();
        const blocks = await converter.convert('<UnknownTag>\n\ntext\n\n</UnknownTag>');
        const tagBlock = blocks.find(b =>
            b.block_type === 2 && b.text?.elements?.[0]?.text_run?.content?.includes('<UnknownTag>')
        );
        assertTrue(tagBlock === undefined, 'Should NOT preserve unknown PascalCase tags');
    });

    // --- HTML entity decoding in _parseInlineMarkdown ---
    await test('decodes &#36; to $ in inline text', async () => {
        const converter = new MarkdownToFeishu();
        const elements = converter._parseInlineMarkdown('Price: &#36;24,000');
        const textEl = elements.find(e => e.text_run?.content?.includes('$'));
        assertTrue(textEl !== undefined, 'Should decode &#36; to $');
        assertFalse(elements.some(e => e.text_run?.content?.includes('&#36;')), 'Should not have literal &#36;');
    });

    await test('decodes &ast; to * in inline text', async () => {
        const converter = new MarkdownToFeishu();
        const elements = converter._parseInlineMarkdown('Zilliz&ast;');
        const textEl = elements.find(e => e.text_run?.content?.includes('*'));
        assertTrue(textEl !== undefined, 'Should decode &ast; to *');
    });

    await test('decodes &#36; in paragraph blocks', async () => {
        const converter = new MarkdownToFeishu();
        const blocks = await converter.convert('Cost is &#36;240 per year.');
        const textBlock = blocks.find(b => b.block_type === 2);
        assertTrue(textBlock !== undefined, 'Should have a text block');
        const content = textBlock.text.elements.map(e => e.text_run?.content || '').join('');
        assertTrue(content.includes('$'), 'Should have decoded $ in text block');
        assertFalse(content.includes('&#36;'), 'Should not have literal &#36;');
    });

    // --- Metadata comment blocks ---
    await test('converts board metadata comment to board block', async () => {
        const converter = new MarkdownToFeishu();
        const blocks = await converter.convert('<!-- feishu-block: board, token: abc123 -->');
        const boardBlock = blocks.find(b => b.block_type === 43);
        assertTrue(boardBlock !== undefined, 'Should have a board block');
        assertEqual(boardBlock.board?.token, 'abc123', 'Board token should match');
    });

    await test('converts iframe metadata comment to iframe block', async () => {
        const converter = new MarkdownToFeishu();
        const blocks = await converter.convert('<!-- feishu-block: iframe, type: 8, url: https://figma.com/file/xyz -->');
        const iframeBlock = blocks.find(b => b.block_type === 26);
        assertTrue(iframeBlock !== undefined, 'Should have an iframe block');
        assertEqual(iframeBlock.iframe?.component?.iframe_type, 8, 'iframe_type should be 8');
        assertEqual(iframeBlock.iframe?.component?.url, 'https://figma.com/file/xyz', 'URL should match');
    });

    await test('converts superdemo metadata comment to add_ons block', async () => {
        const converter = new MarkdownToFeishu();
        const blocks = await converter.convert('<!-- feishu-block: superdemo, id: demo123, isShowcase: true -->');
        const addonsBlock = blocks.find(b => b.block_type === 40);
        assertTrue(addonsBlock !== undefined, 'Should have an add_ons block');
        assertEqual(addonsBlock.add_ons?.component_type_id, 'blk_682093ba9580c002363b9dc3', 'component_type_id should match');
        const record = JSON.parse(addonsBlock.add_ons?.record || '{}');
        assertEqual(record.id, 'demo123', 'Record id should match');
        assertEqual(record.isShowcase, true, 'isShowcase should be true');
    });

    await test('converts superdemo metadata comment with isShowcase false', async () => {
        const converter = new MarkdownToFeishu();
        const blocks = await converter.convert('<!-- feishu-block: superdemo, id: demo456, isShowcase: false -->');
        const addonsBlock = blocks.find(b => b.block_type === 40);
        assertTrue(addonsBlock !== undefined, 'Should have an add_ons block');
        const record = JSON.parse(addonsBlock.add_ons?.record || '{}');
        assertEqual(record.isShowcase, false, 'isShowcase should be false');
    });

    // --- Image resolveImage callback ---
    await test('resolveImage callback is invoked and sets image token', async () => {
        let calledUrl = null;
        let calledOptions = null;
        const resolveImage = async (url, options) => {
            calledUrl = url;
            calledOptions = options;
            return { file_key: 'test_token_123' };
        };
        const converter = new MarkdownToFeishu({ resolveImage });
        const blocks = await converter.convert('![alt text](https://example.com/image.png)');

        // Images are processed after convert() now, so we need to call _processImageBlocks manually
        await converter._processImageBlocks(blocks, 'doc123');

        const imageBlock = blocks.find(b => b.block_type === 27);
        assertTrue(imageBlock !== undefined, 'Should have an image block');
        assertEqual(calledUrl, 'https://example.com/image.png', 'resolveImage should receive the URL');
        assertEqual(calledOptions?.documentId, 'doc123', 'resolveImage should receive documentId');
        assertEqual(imageBlock.image?.token, 'test_token_123', 'Image token should be set');
        assertTrue(imageBlock.image?._metadata === undefined, '_metadata should be removed after processing');
    });

    // --- Image token inheritance from local paths ---
    await test('inherits Feishu image token from local path when caption matches', async () => {
        const converter = new MarkdownToFeishu();
        const blocks = await converter.convert('![abc123](/abc123.png)');

        const imageBlock = blocks.find(b => b.block_type === 27);
        assertTrue(imageBlock !== undefined, 'Should have an image block');
        assertEqual(imageBlock.image?.token, 'abc123', 'Should inherit token from local path');
        assertTrue(imageBlock.image?._metadata === undefined, 'Should not have _metadata for inherited tokens');
    });

    await test('falls back to deferred upload for non-local image URLs', async () => {
        const converter = new MarkdownToFeishu();
        const blocks = await converter.convert('![alt text](https://example.com/image.png)');

        const imageBlock = blocks.find(b => b.block_type === 27);
        assertTrue(imageBlock !== undefined, 'Should have an image block');
        assertEqual(imageBlock.image?.token, '', 'Token should be empty for external URLs');
        assertTrue(imageBlock.image?._metadata?.needs_upload === true, 'Should have _metadata for deferred upload');
    });

    // --- Table header semantics ---
    await test('markdown table sets header_row true', async () => {
        const converter = new MarkdownToFeishu();
        const markdown = '| Name | Value |\n|------|-------|\n| A | 1 |\n| B | 2 |';
        const blocks = await converter.convert(markdown);

        const tableBlock = blocks.find(b => b.block_type === 31);
        assertTrue(tableBlock !== undefined, 'Should have a table block');
        assertTrue(tableBlock.table?.property?.header_row === true, 'Should set header_row to true');
    });

    await test('HTML table with th in first row sets header_row true', async () => {
        const converter = new MarkdownToFeishu();
        const html = '<table>\n  <tr><th>Name</th><th>Value</th></tr>\n  <tr><td>A</td><td>1</td></tr>\n</table>';
        const blocks = await converter.convert(html);

        const tableBlock = blocks.find(b => b.block_type === 31);
        assertTrue(tableBlock !== undefined, 'Should have a table block');
        assertTrue(tableBlock.table?.property?.header_row === true, 'Should set header_row from th tags');
        assertTrue(tableBlock.table?.property?.header_column === true, 'Should set header_column from th in column 0');
    });

    await test('HTML table with th in first row but not column 0 sets header_row but not header_column', async () => {
        const converter = new MarkdownToFeishu();
        const html = '<table>\n  <tr><td>Name</td><th>Value</th></tr>\n  <tr><td>A</td><td>1</td></tr>\n</table>';
        const blocks = await converter.convert(html);

        const tableBlock = blocks.find(b => b.block_type === 31);
        assertTrue(tableBlock !== undefined, 'Should have a table block');
        assertTrue(tableBlock.table?.property?.header_row === true, 'Should set header_row from th tags in row 0');
        assertTrue(tableBlock.table?.property?.header_column === false, 'Should not set header_column when no th in column 0');
    });

    // --- Callout emoji mapping ---
    await test('maps 🚧 icon to construction emoji', async () => {
        const converter = new MarkdownToFeishu();
        const blocks = await converter.convert('<Admonition type="danger" icon="🚧" title="Warning">\n\nContent\n\n</Admonition>');

        const callout = blocks.find(b => b.block_type === 19);
        assertTrue(callout !== undefined, 'Should have a callout block');
        assertEqual(callout.callout?.emoji_id, 'construction', 'Should map 🚧 to construction');
    });

    await test('maps 📘 icon to blue_book emoji', async () => {
        const converter = new MarkdownToFeishu();
        const blocks = await converter.convert('<Admonition type="info" icon="📘" title="Notes">\n\nContent\n\n</Admonition>');

        const callout = blocks.find(b => b.block_type === 19);
        assertTrue(callout !== undefined, 'Should have a callout block');
        assertEqual(callout.callout?.emoji_id, 'blue_book', 'Should map 📘 to blue_book');
    });

    await test('maps 💡 icon to light_bulb emoji', async () => {
        const converter = new MarkdownToFeishu();
        const blocks = await converter.convert('<Admonition type="tip" icon="💡" title="Tip">\n\nContent\n\n</Admonition>');

        const callout = blocks.find(b => b.block_type === 19);
        assertTrue(callout !== undefined, 'Should have a callout block');
        assertEqual(callout.callout?.emoji_id, 'light_bulb', 'Should map 💡 to light_bulb');
    });

    await test('maps 🔥 icon to fire emoji', async () => {
        const converter = new MarkdownToFeishu();
        const blocks = await converter.convert('<Admonition type="caution" icon="🔥" title="Caution">\n\nContent\n\n</Admonition>');

        const callout = blocks.find(b => b.block_type === 19);
        assertTrue(callout !== undefined, 'Should have a callout block');
        assertEqual(callout.callout?.emoji_id, 'fire', 'Should map 🔥 to fire');
    });

    await test('maps ⚠️ icon to warning emoji', async () => {
        const converter = new MarkdownToFeishu();
        const blocks = await converter.convert('<Admonition type="warning" icon="⚠️" title="Warning">\n\nContent\n\n</Admonition>');

        const callout = blocks.find(b => b.block_type === 19);
        assertTrue(callout !== undefined, 'Should have a callout block');
        assertEqual(callout.callout?.emoji_id, 'warning', 'Should map ⚠️ to warning');
    });

    await test('preserves background_color and border_color in callout', async () => {
        const converter = new MarkdownToFeishu();
        const blocks = await converter.convert('<Admonition type="info" icon="📘" title="Notes" background-color="light-orange" border-color="light-orange">\n\nContent\n\n</Admonition>');

        const callout = blocks.find(b => b.block_type === 19);
        assertTrue(callout !== undefined, 'Should have a callout block');
        assertEqual(callout.callout?.background_color, 'light-orange', 'Should preserve background_color');
        assertEqual(callout.callout?.border_color, 'light-orange', 'Should preserve border_color');
    });
}

module.exports = { run };
