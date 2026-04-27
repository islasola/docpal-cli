/**
 * Mock utilities for testing docpal-cli
 * Provides mock implementations of lib/ modules for isolated unit testing
 */

class MockLarkAuth {
    constructor() {
        this._tenantToken = 'mock-tenant-token';
        this._userToken = 'mock-user-access-token';
        this._mode = 'bot';
    }

    setMode(mode) {
        this._mode = mode;
    }

    getMode() {
        return this._mode;
    }

    async token() {
        if (this._mode === 'user') {
            return this._userToken;
        }
        return this._tenantToken;
    }

    async headers() {
        const token = await this.token();
        return {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        };
    }
}

class MockBitableClient {
    constructor() {
        this.bases = new Map();
        this.tables = new Map();
        this.records = new Map();
        this._nextId = 1;
        this._nextBaseId = 1;
        this._nextTableId = 1;
    }

    _id() {
        return `rec${this._nextId++}`;
    }

    async createBase(name, folderToken) {
        const token = `base_${this._nextBaseId++}`;
        this.bases.set(token, { name, folderToken, token });
        return { app: { app_token: token } };
    }

    async listTables(baseToken) {
        const tables = this.tables.get(baseToken) || [];
        return { items: tables };
    }

    async createTable(baseToken, name, fields = []) {
        const tableId = `tbl_${this._nextTableId++}`;
        const tables = this.tables.get(baseToken) || [];
        tables.push({ table_id: tableId, table_name: name, fields });
        this.tables.set(baseToken, tables);
        return { table: { table_id: tableId, table_name: name } };
    }

    async ensureTable(baseToken, name, fields = [], linkFields = []) {
        const existing = this.tables.get(baseToken) || [];
        let table = existing.find(t => t.table_name === name);

        if (!table) {
            table = await this.createTable(baseToken, name, fields);
            table._existed = false;
        } else {
            table = { ...table, _existed: true };
        }

        return table;
    }

    async findManualByName(baseToken, name) {
        const key = `${baseToken}:tblManuals`;
        const records = this.records.get(key) || [];
        return records.find(r => r.fields.Name === name) || null;
    }

    async resolveManual(baseToken, manualName) {
        if (!manualName) {
            const key = `${baseToken}:tblManuals`;
            const records = this.records.get(key) || [];
            if (records.length === 0) {
                throw new Error('No manuals found. Run `docpal manual create` first.');
            }
            if (records.length === 1) {
                return records[0];
            }
            const names = records.map(r => r.fields.Name).join(', ');
            throw new Error(`Multiple manuals found (${names}). Specify --manual <name>.`);
        }

        const manual = await this.findManualByName(baseToken, manualName);
        if (!manual) {
            throw new Error(`Manual "${manualName}" not found.`);
        }
        return manual;
    }

    async listFields(baseToken, tableId) {
        const tables = this.tables.get(baseToken) || [];
        const table = tables.find(t => t.table_id === tableId);
        return { items: table?.fields || [] };
    }

    async createField(baseToken, tableId, field) {
        // No-op in mock
        return { field: { field_name: field.field_name } };
    }

    async listRecords(baseToken, tableId, options = {}) {
        const key = `${baseToken}:${tableId}`;
        const records = this.records.get(key) || [];
        return { items: records };
    }

    async createRecord(baseToken, tableId, fields) {
        const key = `${baseToken}:${tableId}`;
        const records = this.records.get(key) || [];
        const record = {
            record_id: this._id(),
            fields: { ...fields }
        };
        records.push(record);
        this.records.set(key, records);
        return { record };
    }

    async updateRecord(baseToken, tableId, recordId, fields) {
        const key = `${baseToken}:${tableId}`;
        const records = this.records.get(key) || [];
        const record = records.find(r => r.record_id === recordId);
        if (record) {
            Object.assign(record.fields, fields);
        }
        return { record };
    }

    async deleteRecord(baseToken, tableId, recordId) {
        const key = `${baseToken}:${tableId}`;
        const records = this.records.get(key) || [];
        const index = records.findIndex(r => r.record_id === recordId);
        if (index >= 0) {
            records.splice(index, 1);
        }
        return {};
    }

    async searchRecords(baseToken, tableId, filter) {
        const key = `${baseToken}:${tableId}`;
        const records = this.records.get(key) || [];
        const conditions = filter?.conditions || [];
        const items = records.filter(r => {
            return conditions.every(c => {
                const value = r.fields[c.field_name];
                if (Array.isArray(c.value)) {
                    return c.value.includes(value);
                }
                return value === c.value;
            });
        });
        return { items };
    }

    reset() {
        this.bases.clear();
        this.tables.clear();
        this.records.clear();
        this._nextId = 1;
        this._nextBaseId = 1;
        this._nextTableId = 1;
    }
}

class MockLarkDocClient {
    constructor() {
        this.docs = new Map();
        this._nextId = 1;
    }

    _id() {
        return `doc_${this._nextId++}`;
    }

    async createDoc(folderToken, title, options = {}) {
        const id = this._id();
        const doc = {
            document: {
                document_id: id,
                title,
                folder_token: folderToken
            }
        };
        this.docs.set(id, doc);
        return doc;
    }

    async getDoc(documentId) {
        return this.docs.get(documentId) || null;
    }

    async getBlocks(documentId, options = {}) {
        return { items: [{ block_id: 'root', block_type: 1 }] };
    }

    async getWikiNode(token) {
        return {
            node: {
                node_token: `wikcn_mock_${token.replace('doc_', '')}`,
                obj_type: 'docx',
                obj_token: token,
                title: 'Mock Wiki Node'
            }
        };
    }

    async resolveDocUrl(token, webHost) {
        const host = webHost || 'https://zilliverse.feishu.cn';
        const nodeToken = `wikcn_mock_${token.replace('doc_', '')}`;
        return {
            url: `${host}/wiki/${nodeToken}`,
            nodeToken,
            docToken: token,
            objType: 'docx',
        };
    }

    async listWikiNodes(spaceId, options = {}) {
        return { items: [] };
    }

    async listDriveFiles(folderToken, options = {}) {
        return { items: [] };
    }

    async downloadMedia(fileToken) {
        return Buffer.from('mock-image-data');
    }

    async downloadBoardPreview(boardToken) {
        return Buffer.from('mock-board-data');
    }

    async getAllBlocks(docToken) {
        return { items: [{ block_id: 'root', block_type: 1 }] };
    }

    reset() {
        this.docs.clear();
        this._nextId = 1;
    }
}

class MockGitHubClient {
    constructor() {
        this.repos = new Map();
        this.prs = new Map();
        this.branches = new Map();
        this.files = new Map();
        this.tags = [];
        this._prNumber = 1;
    }

    async getRepo(repo) {
        return { full_name: repo, default_branch: 'main' };
    }

    async getBranch(repo, branch) {
        return {
            object: { sha: 'abc123def456' }
        };
    }

    async createBranch(repo, newBranch, fromBranch) {
        const key = `${repo}:${newBranch}`;
        this.branches.set(key, { ref: `refs/heads/${newBranch}`, sha: 'abc123def456' });
        return { ref: `refs/heads/${newBranch}` };
    }

    async getFileContent(repo, path, ref = 'main') {
        const key = `${repo}:${path}:${ref}`;
        return this.files.get(key) || null;
    }

    async getFile(repo, path, ref = 'main') {
        const content = await this.getFileContent(repo, path, ref);
        if (!content) return null;
        return { sha: 'filesha123', content };
    }

    async createOrUpdateFile(repo, path, content, message, branch, sha = null) {
        const key = `${repo}:${path}:${branch}`;
        this.files.set(key, { content, sha: 'newsha123' });
        return { content: { sha: 'newsha123' } };
    }

    async createPullRequest(repo, title, head, base, body = '') {
        const number = this._prNumber++;
        const pr = {
            number,
            title,
            html_url: `https://github.com/${repo}/pull/${number}`,
            head: { ref: head, sha: 'abc123' },
            base: { ref: base },
            body
        };
        this.prs.set(`${repo}:${number}`, pr);
        return pr;
    }

    async listPullRequests(repo, options = {}) {
        const prs = [];
        for (const [key, pr] of this.prs) {
            if (key.startsWith(`${repo}:`)) {
                if (options.state && pr.state && pr.state !== options.state) continue;
                prs.push(pr);
            }
        }
        return prs;
    }

    async updatePullRequest(repo, prNumber, body) {
        const pr = this.prs.get(`${repo}:${prNumber}`);
        if (pr) {
            Object.assign(pr, body);
        }
        return pr;
    }

    async createTag(repo, tag, sha, message) {
        this.tags.push({ repo, tag, sha, message });
        return { ref: `refs/tags/${tag}` };
    }

    async listMergedPullRequests(repo, since, options = {}) {
        return [];
    }

    async listPullRequestFiles(repo, prNumber) {
        return [];
    }

    reset() {
        this.repos.clear();
        this.prs.clear();
        this.branches.clear();
        this.files.clear();
        this.tags = [];
        this._prNumber = 1;
    }
}

class MockConfigLoader {
    constructor() {
        this.config = {
            appId: 'test-app-id',
            appSecret: 'test-app-secret',
            baseToken: 'test-base-token',
            feishuHost: 'https://open.feishu.cn',
        };
    }

    get(key) {
        return this.config[key];
    }

    require(key) {
        const value = this.config[key];
        if (!value) {
            throw new Error(`Missing required config: ${key}`);
        }
        return value;
    }

    getBaseToken(cliOverride) {
        return cliOverride || this.config.baseToken;
    }

    requireBaseToken(cliOverride) {
        const token = this.getBaseToken(cliOverride);
        if (!token) {
            throw new Error('No base token configured');
        }
        return token;
    }
}

module.exports = {
    MockLarkAuth,
    MockBitableClient,
    MockLarkDocClient,
    MockGitHubClient,
    MockConfigLoader
};