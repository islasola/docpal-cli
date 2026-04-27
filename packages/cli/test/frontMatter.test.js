const { generateFrontMatter, sanitizeDescription } = require('../lib/frontMatter');

function run({ test, assertEqual, assertTrue, assertFalse, assertThrows }) {
    test('generateFrontMatter: minimal front matter with title only', () => {
        const result = generateFrontMatter({ title: 'Getting Started' });
        assertTrue(result.startsWith('---\n'), 'Should start with ---');
        assertTrue(result.endsWith('\n---'), 'Should end with ---');
        assertTrue(result.includes('title: Getting Started'), 'Should include title');
    });

    test('generateFrontMatter: includes slug with leading slash', () => {
        const result = generateFrontMatter({ title: 'Test', slug: 'getting-started' });
        assertTrue(result.includes('slug: /getting-started'), 'Slug should have leading /');
    });

    test('generateFrontMatter: includes sidebar position', () => {
        const result = generateFrontMatter({ title: 'Test', sidebar_position: 3 });
        assertTrue(result.includes('sidebar_position: 3'), 'Should include sidebar_position');
    });

    test('generateFrontMatter: includes sidebar label', () => {
        const result = generateFrontMatter({ title: 'Test', sidebar_label: 'Start Here' });
        assertTrue(result.includes('sidebar_label: Start Here'), 'Should include sidebar_label');
    });

    test('generateFrontMatter: includes beta flag when true', () => {
        const result = generateFrontMatter({ title: 'Test', beta: true });
        assertTrue(result.includes('beta: true'), 'Should include beta: true');
    });

    test('generateFrontMatter: omits beta when false', () => {
        const result = generateFrontMatter({ title: 'Test', beta: false });
        assertFalse(result.includes('beta'), 'Should not include beta when false');
    });

    test('generateFrontMatter: includes keywords array', () => {
        const result = generateFrontMatter({
            title: 'Test',
            keywords: ['vector', 'search']
        });
        assertTrue(result.includes('keywords:'), 'Should have keywords key');
        assertTrue(result.includes('- vector'), 'Should include first keyword');
        assertTrue(result.includes('- search'), 'Should include second keyword');
    });

    test('generateFrontMatter: includes version tracking', () => {
        const result = generateFrontMatter({
            title: 'Test',
            added_since: '2.4',
            deprecated_since: '2.6'
        });
        assertTrue(result.includes('added_since: \'2.4\'') || result.includes('added_since: 2.4'),
            'Should include added_since');
        assertTrue(result.includes('deprecated_since: \'2.6\'') || result.includes('deprecated_since: 2.6'),
            'Should include deprecated_since');
    });

    test('generateFrontMatter: includes displayed_sidebar', () => {
        const result = generateFrontMatter({ title: 'Test', displayed_sidebar: 'docsSidebar' });
        assertTrue(result.includes('displayed_sidebar: docsSidebar'), 'Should include sidebar key');
    });

    test('generateFrontMatter: includes type and token', () => {
        const result = generateFrontMatter({ title: 'Test', type: 'Doc', token: 'abc123' });
        assertTrue(result.includes('type: Doc'), 'Should include type');
        assertTrue(result.includes('token: abc123'), 'Should include token');
    });

    test('generateFrontMatter: includes custom props', () => {
        const result = generateFrontMatter({
            title: 'Test',
            custom: { custom_prop: 'value', another: 42 }
        });
        assertTrue(result.includes('custom_prop: value'), 'Should include custom prop');
        assertTrue(result.includes('another: 42'), 'Should include another custom prop');
    });

    test('sanitizeDescription: strips HTML and links', () => {
        const result = sanitizeDescription('Check <a href="#">this</a> link');
        assertFalse(result.includes('<a'), 'Should strip HTML tags');
        assertFalse(result.includes('href'), 'Should strip link URLs');
        assertTrue(result.includes('this'), 'Should keep link text');
    });

    test('sanitizeDescription: collapses whitespace', () => {
        const result = sanitizeDescription('line one\nline two  extra');
        assertFalse(result.includes('\n'), 'Should collapse newlines');
    });
}

module.exports = { run };
