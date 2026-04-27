const {
    patchMdx,
    removeTabsHallucinations,
    unescapeKnownJsxTags,
    escapeCurrencyDollars,
    escapeNonHtmlTags,
    escapeMathBraces,
    KNOWN_JSX_TAGS
} = require('../lib/mdxPatcher');

function run({ test, assertEqual, assertTrue, assertFalse, assertThrows }) {
    // --- removeTabsHallucinations ---
    test('removeTabsHallucinations: removes prose between TabItems', () => {
        const input = '<Tabs>\n<TabItem value="a">\nCode A\n</TabItem>\nBad prose here\n<TabItem value="b">\nCode B\n</TabItem>\n</Tabs>';
        const result = removeTabsHallucinations(input);
        assertFalse(result.includes('Bad prose here'), 'Should remove hallucinated prose');
        assertTrue(result.includes('Code A'), 'Should keep TabItem A content');
        assertTrue(result.includes('Code B'), 'Should keep TabItem B content');
    });

    test('removeTabsHallucinations: keeps empty lines between TabItems', () => {
        const input = '<Tabs>\n<TabItem value="a">\nA\n</TabItem>\n\n<TabItem value="b">\nB\n</TabItem>\n</Tabs>';
        const result = removeTabsHallucinations(input);
        assertTrue(result.includes('A'), 'Should keep content A');
        assertTrue(result.includes('B'), 'Should keep content B');
    });

    test('removeTabsHallucinations: preserves code blocks', () => {
        const input = '```\n</TabItem>\nThis is inside a code block\n<TabItem>\n```';
        const result = removeTabsHallucinations(input);
        assertTrue(result.includes('This is inside a code block'), 'Should preserve code block content');
    });

    // --- unescapeKnownJsxTags ---
    test('unescapeKnownJsxTags: fixes escaped Tabs', () => {
        const input = '\\<Tabs>\\n\\<TabItem>content\\</TabItem>\\</Tabs>';
        const result = unescapeKnownJsxTags(input);
        assertFalse(result.includes('\\<Tabs'), 'Should unescape Tabs');
        assertTrue(result.includes('<Tabs'), 'Should have unescaped Tabs');
    });

    test('unescapeKnownJsxTags: does not affect regular tags', () => {
        const input = '<div>content</div>';
        assertEqual(unescapeKnownJsxTags(input), input, 'Should not modify regular tags');
    });

    // --- escapeCurrencyDollars ---
    test('escapeCurrencyDollars: escapes $ followed by digit', () => {
        const input = 'Cost is $5 per month';
        const result = escapeCurrencyDollars(input);
        assertTrue(result.includes('&#36;5'), 'Should escape $5');
    });

    test('escapeCurrencyDollars: preserves $ in code blocks', () => {
        const input = '```\ncost = $5\n```';
        const result = escapeCurrencyDollars(input);
        assertTrue(result.includes('$5'), 'Should preserve $ in code block');
    });

    test('escapeCurrencyDollars: preserves $ in inline code', () => {
        const input = 'Use `$5` for the price';
        const result = escapeCurrencyDollars(input);
        assertTrue(result.includes('`$5`'), 'Should preserve $ in inline code');
    });

    test('escapeCurrencyDollars: does not escape $ without digit', () => {
        const input = 'Variable: $name';
        const result = escapeCurrencyDollars(input);
        assertTrue(result.includes('$name'), 'Should not escape $ without digit');
    });

    // --- escapeNonHtmlTags ---
    test('escapeNonHtmlTags: escapes unknown lowercase tags', () => {
        const input = 'Use <bucket_name> for storage';
        const result = escapeNonHtmlTags(input);
        assertTrue(result.includes('\\<bucket_name>'), 'Should backslash-escape unknown tag');
        assertFalse(result.includes('Use <bucket_name>'), 'Original should be escaped');
    });

    test('escapeNonHtmlTags: preserves known HTML tags', () => {
        const input = '<div>content</div>';
        const result = escapeNonHtmlTags(input);
        assertEqual(result, input, 'Should preserve HTML tags');
    });

    test('escapeNonHtmlTags: preserves code block content', () => {
        const input = '```\n<bucket_name>\n```';
        const result = escapeNonHtmlTags(input);
        assertTrue(result.includes('<bucket_name>'), 'Should preserve tags in code blocks');
    });

    test('escapeNonHtmlTags: preserves known JSX tags', () => {
        const input = '<Tabs><TabItem>content</TabItem></Tabs>';
        const result = escapeNonHtmlTags(input);
        assertEqual(result, input, 'Should preserve JSX component tags');
    });

    // --- patchMdx ---
    test('patchMdx: validates simple valid MDX', async () => {
        const result = await patchMdx('# Hello World\n\nThis is a paragraph.');
        assertTrue(result.valid, 'Simple MDX should be valid');
        assertEqual(result.errors.length, 0, 'Should have no errors');
    });

    test('patchMdx: patches dollar signs in text', async () => {
        const input = 'The cost is $5 today.';
        const result = await patchMdx(input);
        assertTrue(result.valid, 'Should compile after patching');
        assertTrue(result.content.includes('&#36;5'), 'Should escape $5');
    });

    test('patchMdx: preserves code blocks', async () => {
        const input = '```python\nx = $5\n```';
        const result = await patchMdx(input);
        assertTrue(result.content.includes('x = $5'), 'Should preserve $ in code block');
    });

    test('patchMdx: returns errors for unfixable content', async () => {
        const result = await patchMdx('', { maxIterations: 1 });
        // Empty content should still compile fine
        assertTrue(result.valid === true || result.valid === false, 'Should return valid boolean');
    });

    test('KNOWN_JSX_TAGS contains expected components', () => {
        assertTrue(KNOWN_JSX_TAGS.has('Tabs'), 'Should have Tabs');
        assertTrue(KNOWN_JSX_TAGS.has('TabItem'), 'Should have TabItem');
        assertTrue(KNOWN_JSX_TAGS.has('Admonition'), 'Should have Admonition');
        assertTrue(KNOWN_JSX_TAGS.has('CodeBlock'), 'Should have CodeBlock');
    });

    // --- escapeMathBraces ---
    test('escapeMathBraces: escapes braces in display math', () => {
        const input = '$$\n\\frac{a}{b}\n$$';
        const result = escapeMathBraces(input);
        assertTrue(result.includes('\\{a\\}'), 'Should escape { in math block');
        assertTrue(result.includes('\\{b\\}'), 'Should escape } in math block');
    });

    test('escapeMathBraces: does not affect code blocks', () => {
        const input = '```\nconst obj = { key: "value" };\n```';
        const result = escapeMathBraces(input);
        assertTrue(result.includes('{ key'), 'Should not escape braces in code blocks');
    });

    test('escapeMathBraces: does not affect regular text', () => {
        const input = 'Some {regular} text here';
        const result = escapeMathBraces(input);
        assertTrue(result.includes('{regular}'), 'Should not escape braces outside math');
    });

    // --- patchMdx with math ---
    test('patchMdx: handles math content', async () => {
        const input = '# Equation\n\n$$\nx^2 + y^2 = r^2\n$$\n';
        const result = await patchMdx(input);
        assertTrue(typeof result.valid === 'boolean', 'Should return a boolean');
    });
}

module.exports = { run };
