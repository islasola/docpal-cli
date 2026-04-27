const { createImageResolver, generateImageSlug, trimWhiteBorders } = require('../lib/imageHandler');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

function run({ test, assertEqual, assertTrue, assertFalse, assertThrows }) {
    test('generateImageSlug: uses caption when available', () => {
        const slug = generateImageSlug('token123', { caption: 'My Diagram' });
        assertEqual(slug, 'my-diagram', 'Should slugify caption');
    });

    test('generateImageSlug: uses hash when no caption', () => {
        const slug = generateImageSlug('token123', {});
        assertTrue(slug.startsWith('img-'), 'Should use hash prefix');
        assertTrue(slug.length > 4, 'Should have hash suffix');
    });

    test('generateImageSlug: produces consistent results', () => {
        const a = generateImageSlug('token123', {});
        const b = generateImageSlug('token123', {});
        assertEqual(a, b, 'Same input should produce same slug');
    });

    test('createImageResolver: returns placeholder URL without downloadFn', async () => {
        const resolver = createImageResolver({ mode: 'local' });
        const url = await resolver('fileToken123', {});
        assertTrue(typeof url === 'string', 'Should return a string URL');
        assertTrue(url.includes('fileToken123'), 'Should include token in URL');
    });

    test('createImageResolver: local mode writes file', async () => {
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'docpal-test-'));
        const mockBuffer = Buffer.from('fake image data');

        const resolver = createImageResolver({
            mode: 'local',
            local: {
                outputDir: tmpDir,
                publicPath: '/img'
            },
            downloadFn: async () => mockBuffer,
            slugFn: () => 'test-image'
        });

        const url = await resolver('token123', {});
        assertEqual(url, '/img/test-image.png', 'Should return local public path');

        const filePath = path.join(tmpDir, 'test-image.png');
        assertTrue(fs.existsSync(filePath), 'Should write file to disk');
        assertEqual(fs.readFileSync(filePath).toString(), 'fake image data', 'Content should match');

        // Cleanup
        fs.rmSync(tmpDir, { recursive: true });
    });

    test('createImageResolver: s3 mode calls uploadFn', async () => {
        let uploadedKey = null;
        let uploadedBuffer = null;

        const resolver = createImageResolver({
            mode: 's3',
            s3: {
                bucket: 'test-bucket',
                prefix: 'docs/',
                publicUrl: 'https://cdn.example.com'
            },
            downloadFn: async () => Buffer.from('img'),
            uploadFn: async (buf, key) => {
                uploadedBuffer = buf;
                uploadedKey = key;
            },
            slugFn: () => 'my-image'
        });

        const url = await resolver('token123', {});
        assertEqual(url, 'https://cdn.example.com/docs/my-image.png', 'Should return S3 URL');
        assertEqual(uploadedKey, 'docs/my-image.png', 'Should upload with correct key');
        assertEqual(uploadedBuffer.toString(), 'img', 'Should upload correct buffer');
    });

    test('createImageResolver: handles download failure gracefully', async () => {
        const resolver = createImageResolver({
            mode: 'local',
            downloadFn: async () => { throw new Error('Network error'); },
            slugFn: () => 'fail-image'
        });

        const url = await resolver('badToken', {});
        assertTrue(typeof url === 'string', 'Should return fallback URL even on error');
        assertTrue(url.includes('fail-image'), 'Should include slug in fallback');
    });

    test('trimWhiteBorders: returns buffer if sharp not available', async () => {
        const buf = Buffer.from([0x89, 0x50, 0x4e, 0x47]); // PNG header bytes
        // This test passes if trimWhiteBorders doesn't crash
        const result = await trimWhiteBorders(buf);
        assertTrue(Buffer.isBuffer(result), 'Should return a buffer');
    });
}

module.exports = { run };
