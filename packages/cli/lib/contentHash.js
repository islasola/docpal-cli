const crypto = require('crypto');

function contentHash(content) {
    if (content == null) return '';
    const str = typeof content === 'string' ? content : JSON.stringify(content);
    return crypto.createHash('sha256').update(str).digest('hex').slice(0, 12);
}

module.exports = { contentHash };