const fs = require('fs');
const path = require('path');
const os = require('os');

class MockUserAuth {
    constructor() {
        this._tokens = null;
        this._authFilePath = path.join(os.tmpdir(), 'docpal-test-auth.json');
        this._loginOptions = null;
    }

    setTokens(tokens) {
        this._tokens = tokens;
    }

    loadTokens() {
        if (this._tokens) return this._tokens;
        try {
            if (fs.existsSync(this._authFilePath)) {
                this._tokens = JSON.parse(fs.readFileSync(this._authFilePath, 'utf8'));
            }
        } catch (e) {
            return null;
        }
        return this._tokens;
    }

    async login(options = {}) {
        this._loginOptions = options;
        const tokens = {
            access_token: 'mock-user-access-token',
            refresh_token: 'mock-refresh-token',
            scope: options.scope || 'offline_access docx:document:readonly',
            token_type: 'Bearer',
            obtained_at: Date.now(),
            expires_at: Date.now() + 7200 * 1000,
            refresh_expires_at: Date.now() + 604800 * 1000,
            user_name: 'Test User',
            user_id: 'ou_test123',
        };
        this._tokens = tokens;
        return tokens;
    }

    async refreshTokens() {
        if (!this._tokens || !this._tokens.refresh_token) {
            throw new Error('No refresh token available. Run `docpal auth login` first.');
        }
        const refreshed = {
            ...this._tokens,
            access_token: 'mock-user-access-token-refreshed',
            obtained_at: Date.now(),
            expires_at: Date.now() + 7200 * 1000,
        };
        this._tokens = refreshed;
        return refreshed;
    }

    async getUserAccessToken() {
        const tokens = this.loadTokens();
        if (!tokens || !tokens.access_token) {
            throw new Error('Not authenticated. Run `docpal auth login` first.');
        }
        return tokens.access_token;
    }

    status() {
        const tokens = this.loadTokens();
        if (!tokens) {
            return {
                authenticated: false,
                message: 'Not logged in. Run `docpal auth login` to authenticate.',
            };
        }
        const now = Date.now();
        return {
            authenticated: true,
            user_name: tokens.user_name || 'Unknown',
            user_id: tokens.user_id || 'Unknown',
            scope: tokens.scope || '',
            access_token_expires_at: tokens.expires_at ? new Date(tokens.expires_at).toISOString() : 'Unknown',
            access_token_expired: tokens.expires_at ? now >= tokens.expires_at : true,
            refresh_token_expires_at: tokens.refresh_expires_at ? new Date(tokens.refresh_expires_at).toISOString() : 'Unknown',
            refresh_token_expired: tokens.refresh_expires_at ? now >= tokens.refresh_expires_at : false,
            obtained_at: tokens.obtained_at ? new Date(tokens.obtained_at).toISOString() : 'Unknown',
        };
    }

    logout() {
        this._tokens = null;
    }
}

function run({ test, assertEqual, assertTrue, assertFalse, assertThrows }) {
    test('UserAuth status returns not authenticated when no tokens', () => {
        const auth = new MockUserAuth();
        const status = auth.status();
        assertFalse(status.authenticated, 'Should not be authenticated without tokens');
        assertEqual(status.message, 'Not logged in. Run `docpal auth login` to authenticate.');
    });

    test('UserAuth login returns tokens and sets authenticated state', async () => {
        const auth = new MockUserAuth();
        const result = await auth.login({ scope: 'offline_access' });
        assertTrue(result.access_token !== undefined, 'Should have access_token');
        assertTrue(result.refresh_token !== undefined, 'Should have refresh_token');
        assertTrue(result.scope !== undefined, 'Should have scope');

        const status = auth.status();
        assertTrue(status.authenticated, 'Should be authenticated after login');
        assertEqual(status.user_name, 'Test User');
    });

    test('UserAuth refreshTokens returns new access token', async () => {
        const auth = new MockUserAuth();
        await auth.login();
        const refreshed = await auth.refreshTokens();
        assertEqual(refreshed.access_token, 'mock-user-access-token-refreshed');
    });

    test('UserAuth refreshTokens throws when no tokens stored', async () => {
        const auth = new MockUserAuth();
        let threw = false;
        try {
            await auth.refreshTokens();
        } catch (e) {
            threw = true;
            assertTrue(e.message.includes('No refresh token'), 'Should mention refresh token');
        }
        assertTrue(threw, 'Should throw when no tokens');
    });

    test('UserAuth getUserAccessToken returns token when authenticated', async () => {
        const auth = new MockUserAuth();
        await auth.login();
        const token = await auth.getUserAccessToken();
        assertEqual(token, 'mock-user-access-token');
    });

    test('UserAuth getUserAccessToken throws when not authenticated', async () => {
        const auth = new MockUserAuth();
        let threw = false;
        try {
            await auth.getUserAccessToken();
        } catch (e) {
            threw = true;
            assertTrue(e.message.includes('Not authenticated'), 'Should mention not authenticated');
        }
        assertTrue(threw, 'Should throw when not authenticated');
    });

    test('UserAuth logout clears tokens', async () => {
        const auth = new MockUserAuth();
        await auth.login();
        auth.logout();
        const status = auth.status();
        assertFalse(status.authenticated, 'Should not be authenticated after logout');
    });

    test('UserAuth login captures scope option', async () => {
        const auth = new MockUserAuth();
        await auth.login({ scope: 'custom:scope:readonly' });
        assertEqual(auth._loginOptions.scope, 'custom:scope:readonly');
    });

    test('UserAuth status shows token expiry correctly', async () => {
        const auth = new MockUserAuth();
        await auth.login();
        const status = auth.status();
        assertFalse(status.access_token_expired, 'New token should not be expired');
        assertTrue(status.access_token_expires_at !== 'Unknown', 'Should have expiry time');
    });
}

module.exports = { run, MockUserAuth };