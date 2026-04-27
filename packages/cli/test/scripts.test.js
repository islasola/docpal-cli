const { fixWhitespace } = require('../scripts/fix-mdx-whitespace');
const { findBrokenLinks, fixBrokenLinks } = require('../scripts/fix-broken-links');
const { checkTodos, checkExamples, checkFrontMatter, checkShort, checkStale } = require('../scripts/audit-doc-quality');

function run({ test, assertEqual, assertTrue, assertFalse }) {
    // --- fix-mdx-whitespace ---
    test('fixWhitespace: trims trailing whitespace', () => {
        const result = fixWhitespace('Hello   \nWorld  \n');
        assertTrue(result.fixes.length > 0, 'Should detect trailing whitespace');
        assertTrue(result.content.includes('Hello\n'), 'Should trim trailing spaces');
    });

    test('fixWhitespace: collapses excessive blank lines', () => {
        const input = 'Line 1\n\n\n\n\nLine 2';
        const result = fixWhitespace(input);
        assertTrue(result.fixes.some(f => f.includes('blank')), 'Should detect excessive blank lines');
        assertFalse(result.content.includes('\n\n\n\n'), 'Should not have 4+ newlines');
    });

    test('fixWhitespace: no changes for clean content', () => {
        const input = '# Hello\n\nWorld\n';
        const result = fixWhitespace(input);
        assertEqual(result.fixes.length, 0, 'Should have no fixes for clean content');
    });

    // --- fix-broken-links ---
    test('findBrokenLinks: detects broken slug links', () => {
        const content = '[Link](/missing-page)';
        const slugs = new Set(['existing-page']);
        const broken = findBrokenLinks(content, 'test', slugs);
        assertTrue(broken.some(b => b.type === 'broken-slug'), 'Should detect broken slug link');
    });

    test('findBrokenLinks: passes valid slug links', () => {
        const content = '[Link](/existing-page)';
        const slugs = new Set(['existing-page']);
        const broken = findBrokenLinks(content, 'test', slugs);
        assertFalse(broken.some(b => b.type === 'broken-slug'), 'Should not flag valid slug link');
    });

    test('findBrokenLinks: ignores external URLs', () => {
        const content = '[External](https://example.com)';
        const broken = findBrokenLinks(content, 'test', new Set());
        assertEqual(broken.length, 0, 'Should not flag external URLs');
    });

    test('fixBrokenLinks: comments out broken slug links', () => {
        const broken = [{ text: 'Link', url: '/missing', line: 1, type: 'broken-slug' }];
        const content = '[Link](/missing)';
        const result = fixBrokenLinks(content, broken);
        assertTrue(result.includes('<!-- BROKEN LINK'), 'Should wrap in HTML comment');
    });

    test('fixBrokenLinks: removes broken anchor links', () => {
        const broken = [{ text: 'link text', url: '#missing-anchor', line: 1, type: 'broken-anchor' }];
        const content = '[link text](#missing-anchor)';
        const result = fixBrokenLinks(content, broken);
        assertEqual(result, 'link text', 'Should convert anchor link to plain text');
    });

    // --- audit-doc-quality ---
    test('checkTodos: finds TODO markers', () => {
        const content = 'Some text\n<!-- TODO: Add description -->\nMore text';
        const issues = checkTodos(content, 'test.mdx');
        assertTrue(issues.length > 0, 'Should find TODO markers');
        assertTrue(issues[0].check === 'todos', 'Check type should be todos');
    });

    test('checkExamples: flags missing Examples section', () => {
        const content = '---\ntitle: Test\nslug: test\n---\n\nSome long content here that is over two hundred characters long so that it passes the minimum length check for the examples audit. We need to make sure this string is definitely beyond the two hundred character threshold to trigger the examples check.';
        const issues = checkExamples(content, 'test.mdx');
        assertTrue(issues.length > 0, 'Should flag missing Examples section');
    });

    test('checkExamples: passes docs with Examples section', () => {
        const content = '---\ntitle: Test\n---\n\n## Examples\n\nSome example code here';
        const issues = checkExamples(content, 'test.mdx');
        assertEqual(issues.length, 0, 'Should pass docs with Examples section');
    });

    test('checkFrontMatter: detects missing frontmatter', () => {
        const content = 'Just some plain text without frontmatter';
        const issues = checkFrontMatter(content, 'test.mdx');
        assertTrue(issues.some(i => i.message.includes('Missing')), 'Should detect missing frontmatter');
    });

    test('checkFrontMatter: detects missing title', () => {
        const content = '---\nslug: test\n---\n\nContent';
        const issues = checkFrontMatter(content, 'test.mdx');
        assertTrue(issues.some(i => i.message.includes('title')), 'Should detect missing title');
    });

    test('checkFrontMatter: detects missing slug', () => {
        const content = '---\ntitle: Test\n---\n\nContent';
        const issues = checkFrontMatter(content, 'test.mdx');
        assertTrue(issues.some(i => i.message.includes('slug')), 'Should detect missing slug');
    });

    test('checkFrontMatter: passes valid frontmatter', () => {
        const content = '---\ntitle: Test\nslug: test\n---\n\nContent';
        const issues = checkFrontMatter(content, 'test.mdx');
        assertEqual(issues.length, 0, 'Should pass valid frontmatter');
    });

    test('checkShort: flags short pages', () => {
        const content = '---\ntitle: Test\nslug: test\n---\n\nHi';
        const issues = checkShort(content, 'test.mdx', 100);
        assertTrue(issues.length > 0, 'Should flag short pages');
        assertTrue(issues[0].message.includes('Short page'), 'Should mention short page');
    });

    test('checkStale: detects deprecated_since', () => {
        const content = '---\ntitle: Test\nslug: test\ndeprecated_since: 2.0\n---\n\nContent';
        const issues = checkStale(content, 'test.mdx');
        assertTrue(issues.some(i => i.check === 'stale'), 'Should detect deprecated_since');
    });

    test('checkStale: detects deprecated in body text', () => {
        const content = '---\ntitle: Test\nslug: test\n---\n\nThis feature is deprecated.';
        const issues = checkStale(content, 'test.mdx');
        assertTrue(issues.length > 0, 'Should detect deprecated keyword');
    });
}

module.exports = { run };