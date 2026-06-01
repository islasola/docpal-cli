const fetch = require('node-fetch');
const larkAuth = require('./larkAuth');
const Bottleneck = require('bottleneck');

const FEISHU_HOST = process.env.FEISHU_HOST || 'https://open.feishu.cn';

const MAX_RETRIES = 3;
const RETRY_BASE_DELAY = 1000;

function getLimiterKey(path) {
    if (path.includes('/bitable/')) return 'bitable';
    if (path.includes('/wiki/')) return 'wiki';
    if (path.includes('/docx/')) return 'docx';
    if (path.includes('/drive/')) return 'drive';
    if (path.includes('/sheets/')) return 'sheets';
    if (path.includes('/board/')) return 'board';
    if (path.includes('/im/')) return 'im';
    return 'default';
}

const limiters = {
    bitable: new Bottleneck({ maxConcurrent: 1, minTime: 600 }),
    wiki: new Bottleneck({ maxConcurrent: 1, minTime: 600 }),
    docx: new Bottleneck({ maxConcurrent: 1, minTime: 100 }),
    drive: new Bottleneck({ maxConcurrent: 1, minTime: 600 }),
    sheets: new Bottleneck({ maxConcurrent: 1, minTime: 200 }),
    board: new Bottleneck({ maxConcurrent: 1, minTime: 200 }),
    im: new Bottleneck({ maxConcurrent: 1, minTime: 200 }),
    default: new Bottleneck({ maxConcurrent: 1, minTime: 200 }),
    download: new Bottleneck({ maxConcurrent: 2, minTime: 200 }),
};

function jitter(baseDelay) {
    return baseDelay * (0.8 + Math.random() * 0.4);
}

async function feishuRequest(method, path, body, options = {}) {
    const limiterKey = options.limiter || getLimiterKey(path);
    const limiter = limiters[limiterKey] || limiters.default;

    return limiter.schedule(async () => {
        const headers = await larkAuth.headers();
        const url = `${FEISHU_HOST}${path}`;

        const res = await fetch(url, {
            method,
            headers: options.isMultipart ? headers : {
                ...headers,
                ...(options.headers || {})
            },
            ...(body && !options.isMultipart ? { body: JSON.stringify(body) } : body ? { body } : {})
        });

        // Handle HTTP 429 first
        if (res.status === 429) {
            const resetAfter = parseInt(res.headers.get('x-ogw-ratelimit-reset') || '1', 10);
            console.warn(`[rate limit] HTTP 429 on ${path}, waiting ${resetAfter}s...`);
            await new Promise(r => setTimeout(r, resetAfter * 1000));
            return feishuRequest(method, path, body, options);
        }

        let data;
        try {
            data = await res.json();
        } catch (err) {
            throw new Error(`Feishu API returned non-JSON: ${res.status} ${res.statusText} for ${path}`);
        }

        // Handle rate limit in response body
        if (data.code === 99991400) {
            const resetAfter = parseInt(res.headers.get('x-ogw-ratelimit-reset') || '1', 10);
            console.warn(`[rate limit] code 99991400 on ${path}, waiting ${resetAfter}s...`);
            await new Promise(r => setTimeout(r, resetAfter * 1000));
            return feishuRequest(method, path, body, options);
        }

        if (data.code !== 0 && data.code !== undefined) {
            throw new Error(`Feishu API error: ${data.msg} (code: ${data.code}, path: ${path})`);
        }

        return data.data || data;
    });
}

async function feishuRequestWithRetry(method, path, body, options = {}) {
    let lastError;
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        try {
            return await feishuRequest(method, path, body, options);
        } catch (err) {
            lastError = err;
            if (attempt < MAX_RETRIES - 1) {
                const delay = jitter(RETRY_BASE_DELAY * Math.pow(2, attempt));
                console.warn(`[retry] ${path} failed (attempt ${attempt + 1}/${MAX_RETRIES}), retrying in ${Math.round(delay)}ms: ${err.message}`);
                await new Promise(r => setTimeout(r, delay));
            }
        }
    }
    throw lastError;
}

async function feishuDownload(path, options = {}) {
    return limiters.download.schedule(async () => {
        const headers = await larkAuth.headers();
        const url = `${FEISHU_HOST}${path}`;
        const res = await fetch(url, { headers, ...(options.fetchOptions || {}) });

        if (res.status === 429) {
            const resetAfter = parseInt(res.headers.get('x-ogw-ratelimit-reset') || '1', 10);
            console.warn(`[rate limit] HTTP 429 on ${path}, waiting ${resetAfter}s...`);
            await new Promise(r => setTimeout(r, resetAfter * 1000));
            return feishuDownload(path, options);
        }

        if (!res.ok) {
            throw new Error(`Feishu download error: ${res.status} ${res.statusText} for ${path}`);
        }

        return res;
    });
}

module.exports = {
    feishuRequest,
    feishuRequestWithRetry,
    feishuDownload,
    limiters,
};
