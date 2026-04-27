const fetch = require('node-fetch');
const Bottleneck = require('bottleneck');

const APP_ID = process.env.APP_ID;
const APP_SECRET = process.env.APP_SECRET;
const FEISHU_HOST = process.env.FEISHU_HOST || 'https://open.feishu.cn';

const limiter = new Bottleneck({ maxConcurrent: 1, minTime: 33 });

class LarkAuth {
    constructor() {
        this.tenantAccessToken = undefined;
        this.tenantAccessTokenExpireTime = undefined;
        this._mode = process.env.DOCPLA_AUTH_MODE || 'bot'; // 'bot' or 'user'
        this._userAuth = null;
    }

    setMode(mode) {
        if (mode !== 'bot' && mode !== 'user') {
            throw new Error(`Invalid auth mode: ${mode}. Must be 'bot' or 'user'.`);
        }
        this._mode = mode;
    }

    getMode() {
        return this._mode;
    }

    _getUserAuth() {
        if (!this._userAuth) {
            this._userAuth = require('./userAuth');
        }
        return this._userAuth;
    }

    async fetchTenantToken() {
        const req = {
            method: 'post',
            body: JSON.stringify({
                app_id: APP_ID,
                app_secret: APP_SECRET
            }),
            headers: {
                'Content-Type': 'application/json'
            }
        };

        const res = await fetch(`${FEISHU_HOST}/open-apis/auth/v3/tenant_access_token/internal/`, req);
        const data = await res.json();

        if (data.code === 0) {
            this.tenantAccessToken = data.tenant_access_token;
            this.tenantAccessTokenExpireTime = Date.now() + data.expire * 1000;
        } else {
            throw new Error(`Failed to fetch token: ${data.msg}`);
        }
    }

    async tenantToken() {
        if (!this.tenantAccessToken || this.tenantAccessTokenExpireTime - Date.now() < 30000) {
            await limiter.schedule(() => this.fetchTenantToken());
        }
        return this.tenantAccessToken;
    }

    async token() {
        if (this._mode === 'user') {
            return this._getUserAuth().getUserAccessToken();
        }
        return this.tenantToken();
    }

    async headers() {
        const token = await this.token();
        return {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        };
    }
}

module.exports = new LarkAuth();