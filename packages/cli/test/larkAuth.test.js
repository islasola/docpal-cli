const LarkAuth = require('../lib/larkAuth');

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
            assertTrue(err.message.includes('Failed to fetch token') || err.message.includes('app_id'),
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
            assertTrue(err.message.includes('Failed to fetch token'), 'Should fail with auth error');
        }
    });
}

module.exports = { run };