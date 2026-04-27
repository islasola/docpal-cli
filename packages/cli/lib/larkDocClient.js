const fetch = require('node-fetch');
const FormData = require('form-data');
const larkAuth = require('./larkAuth');
const Bottleneck = require('bottleneck');

const FEISHU_HOST = process.env.FEISHU_HOST || 'https://open.feishu.cn';

// Rate limiters: max 1 concurrent, 52ms minimum (matching reference implementations)
const apiLimiter = new Bottleneck({ maxConcurrent: 1, minTime: 52 });
const downloadLimiter = new Bottleneck({ maxConcurrent: 1, minTime: 52 });

const MAX_RETRIES = 3;
const RETRY_BASE_DELAY = 1000;

class LarkDocClient {
    async request(method, path, body, options = {}) {
        return apiLimiter.schedule(async () => {
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

            const data = await res.json();

            // Handle rate limiting from API
            if (data.code === 99991400) {
                const resetAfter = parseInt(res.headers.get('x-ogw-ratelimit-reset') || '1', 10);
                console.warn(`Rate limited, waiting ${resetAfter}s...`);
                await new Promise(r => setTimeout(r, resetAfter * 1000));
                return this.request(method, path, body, options);
            }

            if (data.code !== 0 && data.code !== undefined) {
                throw new Error(`Lark API error: ${data.msg} (code: ${data.code})`);
            }

            return data.data || data;
        });
    }

    /**
     * Request with retry and exponential backoff.
     */
    async requestWithRetry(method, path, body, options = {}) {
        let lastError;
        for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
            try {
                return await this.request(method, path, body, options);
            } catch (err) {
                lastError = err;
                if (attempt < MAX_RETRIES - 1) {
                    const delay = RETRY_BASE_DELAY * Math.pow(2, attempt);
                    console.warn(`Request failed (attempt ${attempt + 1}/${MAX_RETRIES}), retrying in ${delay}ms: ${err.message}`);
                    await new Promise(r => setTimeout(r, delay));
                }
            }
        }
        throw lastError;
    }

    // --- Docx operations ---

    async createDoc(folderToken, title, options = {}) {
        const body = {
            folder_token: folderToken,
            title
        };
        if (options.content) {
            body.content = options.content;
        }
        return this.request('POST', '/open-apis/docx/v1/documents', body);
    }

    async getDoc(documentId) {
        return this.request('GET', `/open-apis/docx/v1/documents/${documentId}`);
    }

    async getBlocks(documentId, options = {}) {
        const params = new URLSearchParams();
        const pageSize = options.pageSize || options.page_size;
        const pageToken = options.pageToken || options.page_token;
        if (pageSize) params.append('page_size', pageSize);
        if (pageToken) params.append('page_token', pageToken);
        if (options.documentRevisionId) params.append('document_revision_id', options.documentRevisionId);

        const query = params.toString() ? `?${params.toString()}` : '';
        return this.requestWithRetry('GET', `/open-apis/docx/v1/documents/${documentId}/blocks${query}`);
    }

    /**
     * Fetch all blocks for a document, handling pagination.
     * @param {string} documentId
     * @returns {Promise<{ items: Object[] }>}
     */
    async getAllBlocks(documentId) {
        let allItems = [];
        let pageToken = undefined;
        do {
            const result = await this.getBlocks(documentId, {
                page_size: 500,
                page_token: pageToken
            });
            if (result.items) allItems = allItems.concat(result.items);
            const nextToken = result.page_token;
            if (nextToken === pageToken) break; // guard against infinite loop
            pageToken = nextToken;
        } while (pageToken);
        return { items: allItems };
    }

    /**
     * Fetch all blocks with children resolved into blockMap.
     * Returns { items, blockMap } where blockMap maps block_id -> block.
     */
    async getAllBlocksWithMap(documentId) {
        const { items } = await this.getAllBlocks(documentId);
        const blockMap = new Map();
        for (const block of items) {
            if (block && block.block_id) {
                blockMap.set(block.block_id, block);
            }
        }
        return { items, blockMap };
    }

    async createBlocks(documentId, children, index = -1) {
        const body = { children };
        if (index >= 0) body.index = index;
        return this.request('POST', `/open-apis/docx/v1/documents/${documentId}/blocks/${documentId}/children`, body);
    }

    async createDescendants(documentId, childrenId, descendants, index = -1) {
        const body = { children_id: childrenId, descendants };
        if (index >= 0) body.index = index;
        return this.request('POST', `/open-apis/docx/v1/documents/${documentId}/blocks/${documentId}/descendant`, body);
    }

    async updateBlock(documentId, blockId, requests) {
        return this.request('PATCH', `/open-apis/docx/v1/documents/${documentId}/blocks/${blockId}`, {
            update_blocks: {
                blocks: requests
            }
        });
    }

    async batchUpdateBlocks(documentId, requests) {
        return this.request('POST', `/open-apis/docx/v1/documents/${documentId}/blocks/batch_update`, {
            requests
        });
    }

    async deleteBlock(documentId, blockId) {
        return this.request('DELETE', `/open-apis/docx/v1/documents/${documentId}/blocks/${blockId}`);
    }

    // --- Wiki operations ---

    async getWikiNode(token) {
        return this.request('GET', `/open-apis/wiki/v2/spaces/get_node?token=${token}`);
    }

    /**
     * Resolve the web URL for a document.
     * For wiki docs, uses getWikiNode to get the node_token (which is what
     * appears in the URL). For drive docs, uses the document_id directly.
     *
     * @param {string} token - document_id or node_token
     * @param {string} webHost - the Feishu web host (e.g., 'https://zilliverse.feishu.cn')
     * @returns {Promise<{url: string, nodeToken: string|null, docToken: string}>}
     */
    async resolveDocUrl(token, webHost) {
        if (!webHost) {
            const configLoader = require('./configLoader');
            webHost = configLoader.feishuWebHost;
        }

        try {
            const nodeInfo = await this.getWikiNode(token);
            if (nodeInfo && nodeInfo.node) {
                const nodeToken = nodeInfo.node.node_token;
                const docToken = nodeInfo.node.obj_token || token;
                const objType = nodeInfo.node.obj_type || 'docx';

                return {
                    url: `${webHost}/wiki/${nodeToken}`,
                    nodeToken,
                    docToken,
                    objType,
                };
            }
        } catch (err) {
            // Not a wiki node — likely a drive doc
        }

        // Fallback: assume it's a docx accessible via /docx/ path
        return {
            url: `${webHost}/docx/${token}`,
            nodeToken: null,
            docToken: token,
            objType: 'docx',
        };
    }

    async listWikiNodes(spaceId, options = {}) {
        const params = new URLSearchParams();
        params.append('space_id', spaceId);
        const pageToken = options.pageToken || options.page_token;
        const pageSize = options.pageSize || options.page_size;
        if (pageToken) params.append('page_token', pageToken);
        if (pageSize) params.append('page_size', pageSize);
        if (options.parentNodeToken) params.append('parent_node_token', options.parentNodeToken);

        const query = params.toString();
        return this.request('GET', `/open-apis/wiki/v2/spaces/${spaceId}/nodes?${query}`);
    }

    /**
     * Recursively list all wiki nodes under a parent.
     * Returns flat array of all nodes.
     */
    async listAllWikiNodes(spaceId, parentNodeToken) {
        const allNodes = [];
        let pageToken = undefined;
        do {
            const result = await this.listWikiNodes(spaceId, {
                parentNodeToken,
                page_size: 50,
                page_token: pageToken
            });
            if (result.items) allNodes.push(...result.items);
            const nextToken = result.page_token;
            if (nextToken === pageToken) break; // guard against infinite loop
            pageToken = nextToken;
        } while (pageToken);
        return allNodes;
    }

    // --- Drive operations ---

    async listDriveFiles(folderToken, options = {}) {
        const params = new URLSearchParams();
        const pageSize = options.pageSize || options.page_size;
        const pageToken = options.pageToken || options.page_token;
        if (pageSize) params.append('page_size', pageSize);
        if (pageToken) params.append('page_token', pageToken);
        if (options.orderBy) params.append('order_by', options.orderBy);
        if (options.direction) params.append('direction', options.direction);

        const query = params.toString() ? `?${params.toString()}` : '';
        return this.request('GET', `/open-apis/drive/v1/files/${folderToken}/children${query}`);
    }

    async getDriveFileMeta(fileToken) {
        return this.request('GET', `/open-apis/drive/v1/files/${fileToken}/meta`);
    }

    /**
     * Get folder metadata (v2 explorer API).
     */
    async getDriveFolderMeta(folderToken) {
        return this.request('GET', `/open-apis/drive/explorer/v2/folder/${folderToken}/meta`);
    }

    // --- Image / Media operations ---

    async uploadImage(file, filename) {
        const form = new FormData();
        form.append('image', file, filename);
        form.append('image_type', 'message');

        return this.request('POST', '/open-apis/im/v1/images', form, { isMultipart: true });
    }

    /**
     * Upload media to Feishu Drive for use in docx documents.
     * @param {Buffer} fileBuffer - File buffer
     * @param {string} filename - File name with extension
     * @param {string} parentType - Upload point type, e.g. 'docx_image', 'docx_file'
     * @param {string} parentNode - Document ID or folder token
     * @returns {Promise<{file_token: string}>}
     */
    async uploadMedia(fileBuffer, filename, parentType, parentNode) {
        const form = new FormData();
        form.append('file_name', filename);
        form.append('parent_type', parentType);
        form.append('parent_node', parentNode);
        form.append('size', String(fileBuffer.length));
        form.append('file', fileBuffer, filename);

        return this.request('POST', '/open-apis/drive/v1/medias/upload_all', form, { isMultipart: true });
    }

    async downloadMedia(fileToken) {
        return downloadLimiter.schedule(async () => {
            const headers = await larkAuth.headers();
            const res = await fetch(`${FEISHU_HOST}/open-apis/drive/v1/medias/${fileToken}/download`, {
                headers
            });
            if (!res.ok) {
                throw new Error(`Failed to download media: ${res.status}`);
            }
            return res.buffer();
        });
    }

    /**
     * Download board/whiteboard preview as PNG.
     * @param {string} boardToken
     * @returns {Promise<Buffer>}
     */
    async downloadBoardPreview(boardToken) {
        return downloadLimiter.schedule(async () => {
            const headers = await larkAuth.headers();
            const url = `${FEISHU_HOST}/open-apis/board/v1/whiteboards/${boardToken}/download_as_image`;
            const res = await fetch(url, { headers });

            if (!res.ok) {
                throw new Error(`Failed to download board preview: ${res.status}`);
            }

            // Accumulate streaming response into buffer
            const chunks = [];
            for await (const chunk of res.body) {
                chunks.push(chunk);
            }
            return Buffer.concat(chunks);
        });
    }

    /**
     * Download image for document block (uses drive media API).
     * @param {string} fileToken
     * @returns {Promise<Buffer>}
     */
    async downloadImage(fileToken) {
        return this.downloadMedia(fileToken);
    }

    // --- Sheet operations ---

    /**
     * Get sheet metadata (merge info, dimensions).
     */
    async getSheetMeta(spreadsheetToken, sheetTitle) {
        return this.request('GET', `/open-apis/sheets/v3/spreadsheets/${spreadsheetToken}/sheets/${sheetTitle}`);
    }

    /**
     * Get sheet values.
     */
    async getSheetValues(spreadsheetToken, sheetTitle) {
        return this.request('GET', `/open-apis/sheets/v2/spreadsheets/${spreadsheetToken}/values/${sheetTitle}`);
    }

    // --- Bitable operations (for scraper slug lookups) ---

    async listBitableTables(appToken) {
        return this.request('GET', `/open-apis/bitable/v1/apps/${appToken}/tables`);
    }

    async listBitableRecords(appToken, tableId, options = {}) {
        const params = new URLSearchParams();
        const pageSize = options.pageSize || options.page_size;
        const pageToken = options.pageToken || options.page_token;
        if (pageSize) params.append('page_size', pageSize);
        if (pageToken) params.append('page_token', pageToken);
        if (options.filter) params.append('filter', options.filter);

        const query = params.toString() ? `?${params.toString()}` : '';
        return this.request('GET', `/open-apis/bitable/v1/apps/${appToken}/tables/${tableId}/records${query}`);
    }

    /**
     * Batch delete multiple blocks from a document.
     * @param {string} documentId
     * @param {string[]} blockIds - Array of block IDs to delete
     * @returns {Promise<{ deleted: number, failed: number }>}
     */
    async batchDeleteBlocks(documentId, blockIds) {
        let deleted = 0;
        let failed = 0;
        for (const blockId of blockIds) {
            try {
                await this.deleteBlock(documentId, blockId);
                deleted++;
            } catch (err) {
                console.warn(`Failed to delete block ${blockId}: ${err.message}`);
                failed++;
            }
        }
        return { deleted, failed };
    }

    /**
     * Append blocks to a specific parent block in a document.
     * @param {string} documentId
     * @param {string} parentId - Parent block ID (typically the page root)
     * @param {Object[]} blocks - Array of Feishu block objects to create
     * @param {number} [index=-1] - Position to insert at (-1 = append)
     * @returns {Promise<Object>}
     */
    async appendBlocks(documentId, parentId, blocks, index = -1) {
        const body = { children: blocks };
        if (index >= 0) body.index = index;
        return this.request('POST', `/open-apis/docx/v1/documents/${documentId}/blocks/${parentId}/children`, body);
    }

    /**
     * Patch a single block's content in a document.
     * @param {string} documentId
     * @param {string} blockId
     * @param {Object} blockData - Updated block data
     * @returns {Promise<Object>}
     */
    async patchBlock(documentId, blockId, blockData) {
        return this.request('PATCH', `/open-apis/docx/v1/documents/${documentId}/blocks/${blockId}`, {
            update_blocks: {
                blocks: [blockData]
            }
        });
    }

    // --- Markdown to Feishu blocks conversion ---

    async createDocumentFromMarkdown(folderToken, title, markdownContent) {
        // Create an empty document
        const doc = await this.createDoc(folderToken, title);
        const documentId = doc.document.document_id;

        // For now, we create a simple text block with the markdown content
        // Full markdown parsing would be more complex
        const rootBlock = await this.getBlocks(documentId);
        const rootBlockId = rootBlock.items[0].block_id;

        await this.updateBlock(documentId, rootBlockId, [{
            block_type: 2, // text block
            text: {
                elements: [{
                    text_run: {
                        content: markdownContent
                    }
                }]
            }
        }]);

        return doc;
    }
}

module.exports = new LarkDocClient();
