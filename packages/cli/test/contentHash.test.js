const { contentHash } = require('../lib/contentHash');

function run({ test, assertEqual, assertTrue }) {
    test('contentHash: produces consistent hash for same content', () => {
        const h1 = contentHash('hello world');
        const h2 = contentHash('hello world');
        assertEqual(h1, h2, 'Same content should produce same hash');
    });

    test('contentHash: produces different hashes for different content', () => {
        const h1 = contentHash('hello world');
        const h2 = contentHash('goodbye world');
        assertTrue(h1 !== h2, 'Different content should produce different hashes');
    });

    test('contentHash: returns 12-character hex string', () => {
        const h = contentHash('test');
        assertEqual(h.length, 12, 'Hash should be 12 chars');
        assertTrue(/^[0-9a-f]{12}$/.test(h), 'Hash should be hex');
    });

    test('contentHash: handles null and undefined', () => {
        assertEqual(contentHash(null), '', 'Null should return empty string');
        assertEqual(contentHash(undefined), '', 'Undefined should return empty string');
    });

    test('contentHash: handles objects by JSON.stringify', () => {
        const obj = { a: 1, b: 2 };
        const h = contentHash(obj);
        assertEqual(h.length, 12, 'Object hash should be 12 chars');
        assertEqual(h, contentHash(JSON.stringify(obj)), 'Should match JSON string hash');
    });

    test('contentHash: empty string produces valid hash', () => {
        const h = contentHash('');
        assertEqual(h.length, 12, 'Empty string hash should be 12 chars');
    });
}

module.exports = { run };