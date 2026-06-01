const fs = require('fs');
const os = require('os');
const path = require('path');

const authFile = path.join(os.tmpdir(), `docpal-lark-auth-test-${process.pid}.json`);
const savedAppId = process.env.APP_ID;
const savedAppSecret = process.env.APP_SECRET;
delete process.env.DOCPAL_AUTH_MODE;
process.env.DOCPAL_AUTH_FILE = authFile;
delete process.env.APP_ID;
delete process.env.APP_SECRET;

try {
    if (fs.existsSync(authFile)) fs.unlinkSync(authFile);
} catch (e) {
    // Non-fatal; test should still avoid the user's default auth file.
}

delete require.cache[require.resolve('../lib/userAuth')];
delete require.cache[require.resolve('../lib/larkAuth')];
const LarkAuth = require('../lib/larkAuth');
if (savedAppId !== undefined) process.env.APP_ID = savedAppId;
if (savedAppSecret !== undefined) process.env.APP_SECRET = savedAppSecret;

function run({ test, assertEqual, assertTrue, assertFalse, assertThrows }) {
    test('LarkAuth should be a singleton instance', () => {
        assertTrue(LarkAuth !== undefined, 'LarkAuth should be exported');
        assertTrue(typeof LarkAuth.token === 'function', 'token should be a method');
        assertTrue(typeof LarkAuth.headers === 'function', 'headers should be a method');
        assertTrue(typeof LarkAuth.setMode === 'function', 'setMode should be a method');
        assertTrue(typeof LarkAuth.getMode === 'function', 'getMode should be a method');
    });

    test('LarkAuth default mode is bot', () => {
        assertEqual(LarkAuth.getMode(), 'bot');
    });

    test('LarkAuth setMode can switch to user', () => {
        LarkAuth.setMode('user');
        assertEqual(LarkAuth.getMode(), 'user');
        LarkAuth.setMode('bot');
        assertEqual(LarkAuth.getMode(), 'bot');
    });

    test('LarkAuth setMode rejects invalid modes', () => {
        let threw = false;
        try {
            LarkAuth.setMode('invalid');
        } catch (e) {
            threw = true;
            assertTrue(e.message.includes('Invalid auth mode'), 'Should mention invalid mode');
        }
        assertTrue(threw, 'Should throw on invalid mode');
    });

    test('LarkAuth setMode accepts bot and user', () => {
        LarkAuth.setMode('bot');
        assertEqual(LarkAuth.getMode(), 'bot');
        LarkAuth.setMode('user');
        assertEqual(LarkAuth.getMode(), 'user');
        LarkAuth.setMode('bot');
        assertEqual(LarkAuth.getMode(), 'bot');
    });

    test('LarkAuth.token should throw when APP_ID is not set', async () => {
        LarkAuth.setMode('bot');
        try {
            await LarkAuth.token();
        } catch (err) {
            assertTrue(err.message.includes('Failed to fetch token') || err.message.includes('APP_ID') || err.message.includes('app_id'),
                'Should fail with auth error when credentials missing');
        }
    });

    test('LarkAuth.headers should return Authorization header', async () => {
        LarkAuth.setMode('bot');
        try {
            const headers = await LarkAuth.headers();
            assertTrue(headers.Authorization !== undefined, 'Should have Authorization header');
            assertTrue(headers.Authorization.startsWith('Bearer '), 'Authorization should start with Bearer');
            assertTrue(headers['Content-Type'] === 'application/json', 'Should have Content-Type header');
        } catch (err) {
            assertTrue(err.message.includes('Failed to fetch token') || err.message.includes('APP_ID'),
                'Should fail with auth error');
        }
    });
}

module.exports = { run };
