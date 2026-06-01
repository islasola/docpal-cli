const fetch = require('node-fetch');
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const APP_ID = process.env.APP_ID;
const APP_SECRET = process.env.APP_SECRET;
const FEISHU_HOST = process.env.FEISHU_HOST || 'https://open.feishu.cn';

const DEFAULT_PORT = 8401;

const DEFAULT_SCOPES = [
    'offline_access',
    'docx:document:readonly',
    'docx:document',
    'bitable:app:readonly',
    'bitable:app',
    'drive:drive:readonly',
    'drive:drive',
    'wiki:wiki:readonly',
    'wiki:wiki',
    'sheets:spreadsheet:readonly',
    'sheets:spreadsheet',
    'auth:user.id:read',
].join(' ');

const AUTH_FILE_PATH = process.env.DOCPAL_AUTH_FILE ||
    path.join(process.env.HOME || process.env.USERPROFILE || '~', '.docpal', 'auth.json');

class UserAuth {
    constructor() {
        this._tokenData = null;
        this._loaded = false;
    }

    _ensureDir() {
        const dir = path.dirname(AUTH_FILE_PATH);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
    }

    _readTokenFile() {
        try {
            if (fs.existsSync(AUTH_FILE_PATH)) {
                const data = fs.readFileSync(AUTH_FILE_PATH, 'utf8');
                return JSON.parse(data);
            }
        } catch (e) {
            return null;
        }
        return null;
    }

    _writeTokenFile(data) {
        this._ensureDir();
        fs.writeFileSync(AUTH_FILE_PATH, JSON.stringify(data, null, 2), 'utf8');
        try {
            fs.chmodSync(AUTH_FILE_PATH, 0o600);
        } catch (e) {
            // chmod may fail on some platforms; non-fatal
        }
        this._tokenData = data;
        this._loaded = true;
    }

    loadTokens() {
        if (this._loaded) return this._tokenData;
        this._tokenData = this._readTokenFile();
        this._loaded = true;
        return this._tokenData;
    }

    async exchangeCodeForTokens(code, redirectUri) {
        const res = await fetch(`${FEISHU_HOST}/open-apis/authen/v2/oauth/token`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json; charset=utf-8' },
            body: JSON.stringify({
                grant_type: 'authorization_code',
                client_id: APP_ID,
                client_secret: APP_SECRET,
                code,
                redirect_uri: redirectUri,
            }),
        });

        const data = await res.json();

        if (data.code !== 0) {
            throw new Error(`OAuth token exchange failed: ${data.error_description || data.msg || data.error || JSON.stringify(data)}`);
        }

        return {
            access_token: data.access_token,
            refresh_token: data.refresh_token,
            expires_in: data.expires_in,
            refresh_token_expires_in: data.refresh_token_expires_in,
            scope: data.scope,
            token_type: data.token_type,
        };
    }

    async refreshTokens() {
        const tokens = this.loadTokens();
        if (!tokens || !tokens.refresh_token) {
            throw new Error('No refresh token available. Run `docpal auth login` first.');
        }

        const res = await fetch(`${FEISHU_HOST}/open-apis/authen/v2/oauth/token`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json; charset=utf-8' },
            body: JSON.stringify({
                grant_type: 'refresh_token',
                client_id: APP_ID,
                client_secret: APP_SECRET,
                refresh_token: tokens.refresh_token,
            }),
        });

        const data = await res.json();

        if (data.code !== 0) {
            throw new Error(`Token refresh failed: ${data.error_description || data.msg || data.error || JSON.stringify(data)}`);
        }

        const newTokens = {
            access_token: data.access_token,
            refresh_token: data.refresh_token || tokens.refresh_token,
            expires_in: data.expires_in,
            refresh_token_expires_in: data.refresh_token_expires_in,
            scope: data.scope,
            token_type: data.token_type,
            user_id: tokens.user_id,
            user_name: tokens.user_name,
            obtained_at: Date.now(),
        };

        if (data.expires_in) {
            newTokens.expires_at = Date.now() + data.expires_in * 1000;
        }
        if (data.refresh_token_expires_in) {
            newTokens.refresh_expires_at = Date.now() + data.refresh_token_expires_in * 1000;
        }

        this._writeTokenFile(newTokens);
        return newTokens;
    }

    async fetchUserInfo(accessToken) {
        try {
            const res = await fetch(`${FEISHU_HOST}/open-apis/authen/v1/user_info`, {
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json',
                },
            });
            const data = await res.json();
            if (data.code === 0 && data.data) {
                return {
                    user_id: data.data.user_id,
                    user_name: data.data.name,
                };
            }
        } catch (e) {
            return null;
        }
        return null;
    }

    async login(options = {}) {
        const scopes = options.scope || DEFAULT_SCOPES;
        const autoOpen = options.autoOpen !== false;
        const port = options.port || DEFAULT_PORT;

        if (!APP_ID) {
            throw new Error('APP_ID is not set. Add it to your .env file.');
        }
        if (!APP_SECRET) {
            throw new Error('APP_SECRET is not set. Add it to your .env file.');
        }

        const state = crypto.randomBytes(16).toString('hex');

        return new Promise((resolve, reject) => {
            const server = http.createServer(async (req, res) => {
                try {
                    const url = new URL(req.url, `http://localhost:${server.address().port}`);

                    if (url.pathname === '/callback') {
                        const code = url.searchParams.get('code');
                        const receivedState = url.searchParams.get('state');
                        const error = url.searchParams.get('error');

                        if (error) {
                            const errorDesc = url.searchParams.get('error_description') || error;
                            res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
                            res.end(`<html><body><h2>Authorization failed</h2><p>${errorDesc}</p></body></html>`);
                            server.close();
                            reject(new Error(`Authorization denied: ${errorDesc}`));
                            return;
                        }

                        if (receivedState !== state) {
                            res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
                            res.end('<html><body><h2>Authorization failed</h2><p>State mismatch. Possible CSRF attack.</p></body></html>');
                            server.close();
                            reject(new Error('OAuth state mismatch. Possible CSRF attack.'));
                            return;
                        }

                        if (!code) {
                            res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
                            res.end('<html><body><h2>Authorization failed</h2><p>No authorization code received.</p></body></html>');
                            server.close();
                            reject(new Error('No authorization code received from Feishu.'));
                            return;
                        }

                        const redirectUri = `http://localhost:${server.address().port}/callback`;

                        try {
                            const tokenData = await this.exchangeCodeForTokens(code, redirectUri);

                            const expiresAt = Date.now() + (tokenData.expires_in || 7200) * 1000;
                            const refreshExpiresAt = tokenData.refresh_token_expires_in
                                ? Date.now() + tokenData.refresh_token_expires_in * 1000
                                : null;

                            let userInfo = null;
                            try {
                                userInfo = await this.fetchUserInfo(tokenData.access_token);
                            } catch (e) {
                                // Non-fatal
                            }

                            const storedData = {
                                access_token: tokenData.access_token,
                                refresh_token: tokenData.refresh_token,
                                scope: tokenData.scope,
                                token_type: tokenData.token_type,
                                obtained_at: Date.now(),
                                expires_at: expiresAt,
                                refresh_expires_at: refreshExpiresAt,
                                ...userInfo,
                            };

                            this._writeTokenFile(storedData);

                            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
                            res.end('<html><body><h2>Authorization successful!</h2><p>You can close this tab and return to the terminal.</p></body></html>');

                            server.close();
                            resolve(storedData);
                        } catch (err) {
                            res.writeHead(500, { 'Content-Type': 'text/html; charset=utf-8' });
                            res.end(`<html><body><h2>Token exchange failed</h2><p>${err.message}</p></body></html>`);
                            server.close();
                            reject(err);
                        }
                    } else {
                        res.writeHead(404);
                        res.end('Not found');
                    }
                } catch (err) {
                    res.writeHead(500);
                    res.end('Internal error');
                }
            });

            server.listen(port, '127.0.0.1', () => {
                const actualPort = server.address().port;
                const redirectUri = `http://localhost:${actualPort}/callback`;
                const authUrl = `${FEISHU_HOST}/open-apis/authen/v1/authorize?app_id=${APP_ID}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scopes)}&state=${state}`;

                console.log(`\nOpening browser for Feishu authorization...`);
                console.log(`If the browser doesn't open, visit this URL:\n`);
                console.log(`  ${authUrl}\n`);
                console.log(`Listening for callback on http://localhost:${actualPort}\n`);

                if (autoOpen) {
                    const { exec } = require('child_process');
                    const openCmd = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open';
                    exec(`${openCmd} "${authUrl}"`, (err) => {
                        if (err) {
                            console.log('Could not open browser automatically. Please open the URL manually.');
                        }
                    });
                }

                const timeout = setTimeout(() => {
                    server.close();
                    reject(new Error('Authorization timed out after 5 minutes. Please try again.'));
                }, 5 * 60 * 1000);

                server.on('close', () => {
                    clearTimeout(timeout);
                });
            });
        });
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
        const accessTokenExpired = tokens.expires_at ? now >= tokens.expires_at : true;
        const refreshTokenExpired = tokens.refresh_expires_at ? now >= tokens.refresh_expires_at : false;

        return {
            authenticated: true,
            user_name: tokens.user_name || 'Unknown',
            user_id: tokens.user_id || 'Unknown',
            scope: tokens.scope || '',
            access_token_expires_at: tokens.expires_at ? new Date(tokens.expires_at).toISOString() : 'Unknown',
            access_token_expired: accessTokenExpired,
            refresh_token_expires_at: tokens.refresh_expires_at ? new Date(tokens.refresh_expires_at).toISOString() : 'Unknown',
            refresh_token_expired: refreshTokenExpired,
            obtained_at: tokens.obtained_at ? new Date(tokens.obtained_at).toISOString() : 'Unknown',
        };
    }

    logout() {
        try {
            if (fs.existsSync(AUTH_FILE_PATH)) {
                fs.unlinkSync(AUTH_FILE_PATH);
            }
        } catch (e) {
            throw new Error(`Failed to remove auth file: ${e.message}`);
        }
        this._tokenData = null;
        this._loaded = false;
    }

    async getUserAccessToken() {
        const tokens = this.loadTokens();

        if (!tokens || !tokens.access_token) {
            throw new Error('Not authenticated. Run `docpal auth login` first.');
        }

        const now = Date.now();
        const expiresAt = tokens.expires_at || (tokens.obtained_at + 7200 * 1000);
        const bufferMs = 5 * 60 * 1000; // 5 minute buffer

        if (now >= expiresAt - bufferMs) {
            if (!tokens.refresh_token) {
                throw new Error('Access token expired and no refresh token available. Run `docpal auth login` to re-authenticate.');
            }

            if (tokens.refresh_expires_at && now >= tokens.refresh_expires_at) {
                throw new Error('Both access token and refresh token expired. Run `docpal auth login` to re-authenticate.');
            }

            const refreshed = await this.refreshTokens();
            return refreshed.access_token;
        }

        return tokens.access_token;
    }
}

module.exports = new UserAuth();