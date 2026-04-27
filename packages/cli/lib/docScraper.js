/**
 * Document Scraper — fetches and builds in-memory document trees from Feishu.
 *
 * Key difference from legacy larkDocScraper: no JSON files are written to disk.
 * The entire tree (nodes, blocks, slugs, reference_synced resolution) is built
 * in memory and returned from fetch().
 *
 * Source: adapted from /Volumes/CaseSensitive/projects/zdoc-redesign/plugins/lark-docs/larkDocScraper.js
 */

const larkDocClient = require('./larkDocClient');
const bitableClient = require('./bitableClient');
const slugify = require('slugify');
const _ = require('lodash');

class DocScraper {
    /**
     * @param {Object} config
     * @param {string} config.rootToken - Wiki node token or drive folder token
     * @param {string} [config.baseToken] - Bitable app token for slug/publish metadata
     * @param {'wiki'|'drive'|'onePager'} config.sourceType
     * @param {string} [config.spaceId] - Wiki space ID (required for wiki source type)
     */
    constructor({ rootToken, baseToken, sourceType, spaceId }) {
        this.rootToken = rootToken;
        this.baseToken = baseToken;
        this.sourceType = sourceType;
        this.spaceId = spaceId || process.env.SPACE_ID;

        // Built during fetch()
        this.tree = null;       // Root node of the document tree
        this.slugs = {};        // Map: token -> { slug, title }
        this.records = [];      // Raw Bitable records
        this.sourceMap = new Map(); // Map: token -> node (flat lookup of all nodes)
    }

    /**
     * Fetch the document tree and return it.
     * @param {Object} [options]
     * @param {boolean} [options.recursive=true] - Fetch all children recursively
     * @returns {Promise<{ tree: Object, slugs: Object, sourceMap: Map }>}
     */
    async fetch(options = {}) {
        const { recursive = true } = options;

        if (this.baseToken) {
            await this._loadSlugs();
        }

        if (this.sourceType === 'wiki') {
            await this._fetchWikiTree(recursive);
        } else if (this.sourceType === 'drive') {
            await this._fetchDriveTree(recursive);
        } else if (this.sourceType === 'onePager') {
            await this._fetchOnePagerTree();
        }

        // Resolve reference_synced blocks in memory
        await this._resolveReferenceSynced();

        // Validate: all docx nodes must have blocks
        this._validateTree();

        return { tree: this.tree, slugs: this.slugs, sourceMap: this.sourceMap };
    }

    // --- Slug resolution from Bitable ---

    async _loadSlugs() {
        const tables = await bitableClient.listTables(this.baseToken);
        if (!tables.items || tables.items.length === 0) return;

        const tableId = tables.items[0].table_id;
        const records = await bitableClient.listRecords(this.baseToken, tableId, { pageSize: 500 });
        this.records = records.items || [];

        const rawSlugs = {};
        for (const record of this.records) {
            if (record.fields.Slug && record.fields.Docs) {
                const token = record.fields.Docs.link
                    ? record.fields.Docs.link.split('/').pop()
                    : null;
                if (token) {
                    rawSlugs[token] = {
                        slug: record.fields.Slug,
                        title: record.fields.Docs.text || ''
                    };
                }
            }
        }

        // Deduplicate slugs
        const uniqueSlugs = this._uniquify(
            Object.values(rawSlugs).map(s =>
                s.slug instanceof Array ? s.slug[0][s.slug[0].type] : s.slug
            )
        );
        const keys = Object.keys(rawSlugs);
        keys.forEach((key, i) => {
            if (rawSlugs[key].slug instanceof Array) {
                rawSlugs[key].slug[0][rawSlugs[key].slug[0].type] = uniqueSlugs[i];
            } else {
                rawSlugs[key].slug = uniqueSlugs[i];
            }
        });

        this.slugs = rawSlugs;
    }

    _uniquify(arr) {
        const seen = [];
        arr.forEach(item => {
            const lastIndex = seen.findLastIndex(s => s.match(new RegExp(`^${item}(_\\d+)?$`)));
            if (lastIndex === -1) {
                seen.push(item);
            } else {
                const seq = seen[lastIndex].match(/_\d+$/) ? parseInt(seen[lastIndex].match(/_\d+$/)[0].slice(1)) : 0;
                seen.push(`${item}_${parseInt(seq) + 1}`);
            }
        });
        return seen;
    }

    async _slugify(token, title = null) {
        let slug = this.slugs[token];

        if (!slug && title) {
            const match = Object.keys(this.slugs).filter(key => this.slugs[key].title === title);
            if (match.length > 0) {
                slug = this.slugs[match[0]];
            }
        }

        if (slug) {
            slug = slug.slug;
        }

        if (slug instanceof Array) {
            if (slug[0] instanceof Object) {
                return slug[0][slug[0].type];
            }
        }

        return slug || slugify(title || token, { lower: true, strict: true });
    }

    // --- Wiki tree fetching ---

    async _fetchWikiTree(recursive) {
        const nodeData = await larkDocClient.getWikiNode(this.rootToken);
        if (!nodeData || !nodeData.node) {
            throw new Error(`Wiki node not found: ${this.rootToken}`);
        }

        this.tree = nodeData.node;
        await this._fetchWikiChildren(this.tree, recursive);
    }

    async _fetchWikiChildren(node, recursive) {
        node.slug = await this._slugify(node.node_token, node.title);

        // Resolve shortcut nodes
        if (node.node_type === 'shortcut' && node.origin_node_token) {
            const resolved = await larkDocClient.getWikiNode(node.origin_node_token);
            if (resolved && resolved.node) {
                Object.assign(node, resolved.node);
            }
        }

        // Fetch blocks for this node
        if (node.obj_type === 'docx' || node.type === 'docx') {
            await this._fetchBlocks(node);
        }

        // Register in source map
        const nodeKey = node.origin_node_token || node.node_token || node.obj_token;
        if (nodeKey) this.sourceMap.set(nodeKey, node);

        if (node.has_child) {
            const children = await larkDocClient.listAllWikiNodes(this.spaceId, node.origin_node_token);

            for (let child of children) {
                // Resolve shortcuts
                if (child.node_type === 'shortcut' && child.origin_node_token) {
                    try {
                        const resolved = await larkDocClient.getWikiNode(child.origin_node_token);
                        if (resolved && resolved.node) {
                            Object.assign(child, resolved.node);
                        }
                    } catch (err) {
                        console.warn(`Failed to resolve shortcut ${child.origin_node_token}: ${err.message}`);
                    }
                }
                child.slug = await this._slugify(child.node_token, child.title);
            }

            node.children = children;

            if (recursive) {
                for (const child of node.children) {
                    await this._fetchWikiChildren(child, recursive);
                }
            }
        }
    }

    // --- Drive tree fetching ---

    async _fetchDriveTree(recursive) {
        const meta = await larkDocClient.getDriveFolderMeta(this.rootToken);
        if (!meta) {
            throw new Error(`Drive folder not found: ${this.rootToken}`);
        }

        this.tree = meta;
        await this._fetchDriveChildren(this.tree, null, recursive);
    }

    async _fetchDriveChildren(folderNode, pageToken, recursive) {
        folderNode.slug = await this._slugify(folderNode.token, folderNode.name);

        // Register in source map
        if (folderNode.token) this.sourceMap.set(folderNode.token, folderNode);

        const result = await larkDocClient.listDriveFiles(folderNode.token, { pageToken });

        if (result && result.files) {
            // Sort children alphabetically
            folderNode.children = result.files.sort((a, b) =>
                a.name.toUpperCase().localeCompare(b.name.toUpperCase())
            );

            // Check for index docx with same name as folder
            const indexDoc = folderNode.children.find(c => c.name === folderNode.name && c.type === 'docx');
            if (indexDoc) {
                const slug = await this._slugify(indexDoc.token, indexDoc.name);
                if (slug) folderNode.slug = slug;
            }

            if (recursive) {
                for (const child of folderNode.children) {
                    if (child.type === 'folder') {
                        child.slug = await this._slugify(child.token, child.name);
                        await this._fetchDriveChildren(child, null, recursive);
                    } else if (child.type === 'docx') {
                        await this._fetchBlocks(child);
                        child.slug = await this._slugify(child.token, child.name);
                        if (child.token) this.sourceMap.set(child.token, child);
                    }
                }
            }
        }

        // Handle pagination
        if (result && result.has_more && result.next_page_token) {
            await this._fetchDriveChildren(folderNode, result.next_page_token, recursive);
        }
    }

    // --- OnePager tree fetching ---

    async _fetchOnePagerTree() {
        const nodeData = await larkDocClient.getWikiNode(this.rootToken);
        if (!nodeData || !nodeData.node) {
            throw new Error(`Wiki node not found: ${this.rootToken}`);
        }

        this.tree = nodeData.node;
        await this._fetchBlocks(this.tree);

        // Register root
        if (this.tree.origin_node_token) {
            this.sourceMap.set(this.tree.origin_node_token, this.tree);
        }

        await this._splitOnePager(this.tree);
    }

    async _splitOnePager(node) {
        if (!this.records || this.records.length === 0) {
            await this._loadSlugs();
        }

        const tokens = this.records
            .map(r => r.fields.Docs.link.split('#')[1])
            .sort((a, b) =>
                node.blocks.items.findIndex(block => block.block_id === a) -
                node.blocks.items.findIndex(block => block.block_id === b)
            );
        const indexes = tokens.map(t => node.blocks.items.findIndex(b => b.block_id === t));

        const pages = [];
        for (let i = 1; i < indexes.length; i++) {
            pages.push(node.blocks.items.slice(indexes[i - 1], indexes[i]));
            if (i === indexes.length - 1) {
                pages.push(node.blocks.items.slice(indexes[i]));
            }
        }

        if (pages.find(p => p.length === 0)) {
            throw new Error('OnePager has empty page');
        }

        const directChildren = [];

        for (const record of this.records) {
            const source = _.cloneDeep(node);
            source.obj_token = record.fields.Docs.link.split('#').pop();
            source.node_token = `${node.node_token}#${source.obj_token}`;
            source.parent_node_token = record.fields.Parent && record.fields.Parent[0] && record.fields.Parent[0].text
                ? this.records.find(r => r.fields['Seq. ID'] == record.fields.Parent[0].text).fields.Docs.link.split('#').pop()
                : node.node_token;
            source.title = record.fields.Docs.text;
            source.slug = await this._slugify(`${node.node_token}#${source.obj_token}`, source.title);

            // Blocks
            const blocks = pages.filter(p => record.fields.Docs.link.endsWith(p[0].block_id));
            if (blocks.length > 0) {
                source.blocks = { items: blocks[0], counts: blocks[0].length };
                source.blocks.items[0].block_type = 1;
                source.blocks.items[0].children = blocks[0]
                    .slice(1)
                    .filter(b => b.parent_id === node.obj_token)
                    .map(b => b.block_id);
                source.blocks.items[0].parent_id = '';

                const headingKey = Object.keys(source.blocks.items[0]).find(key => key.startsWith('heading'));
                if (headingKey) {
                    source.blocks.items[0].page = _.cloneDeep(source.blocks.items[0][headingKey]);
                    delete source.blocks.items[0][headingKey];
                }

                source.blocks.items.slice(1).forEach(block => {
                    if (block.parent_id === node.obj_token) {
                        block.parent_id = source.blocks.items[0].block_id;
                    }
                });
            }

            // Children
            if (this.records.find(r => parseInt(r.fields.Parent[0].text) === record.fields['Seq. ID'])) {
                source.has_child = true;
                source.children = [];
                const childRecords = this.records.filter(r => r.fields.Parent[0].text == record.fields['Seq. ID']);
                for (const childRecord of childRecords) {
                    const childSource = _.cloneDeep(node);
                    delete childSource.blocks;
                    childSource.obj_token = childRecord.fields.Docs.link.split('#').pop();
                    childSource.node_token = `${node.node_token}#${childSource.obj_token}`;
                    childSource.parent_node_token = source.node_token;
                    childSource.title = childRecord.fields.Docs.text;
                    childSource.slug = await this._slugify(`${node.node_token}#${childSource.obj_token}`, childSource.title);
                    source.children.push(childSource);
                }
            }

            if (source.parent_node_token === node.node_token) {
                const cpSource = _.cloneDeep(source);
                delete cpSource.blocks;
                delete cpSource.children;
                directChildren.push(cpSource);
            }

            this.sourceMap.set(source.obj_token, source);
        }

        node.children = directChildren;
        node.has_child = true;
    }

    // --- Block fetching ---

    async _fetchBlocks(node) {
        let token;
        if (node.obj_type === 'docx' && node.obj_token) {
            token = node.obj_token;
        } else if (node.type === 'docx' && node.token) {
            token = node.token;
        }

        if (!token) return;

        const { items } = await larkDocClient.getAllBlocks(token);
        node.blocks = { items, counts: items.length };

        // Fetch embedded sheet data
        for (const item of items) {
            if (item.sheet && item.sheet.token) {
                const parts = item.sheet.token.split('_');
                const sheetToken = parts[0];
                const sheetTitle = parts[1];
                try {
                    item.sheet.meta = await larkDocClient.getSheetMeta(sheetToken, sheetTitle);
                    item.sheet.values = await larkDocClient.getSheetValues(sheetToken, sheetTitle);
                } catch (err) {
                    console.warn(`Failed to fetch sheet ${item.sheet.token}: ${err.message}`);
                }
            }
        }
    }

    // --- Reference-synced block resolution (in-memory) ---

    async _resolveReferenceSynced() {
        for (const [token, node] of this.sourceMap) {
            if (!node.blocks || !node.blocks.items) continue;

            const replacements = [];
            let appendBlocks = [];

            for (const block of node.blocks.items) {
                if (block.block_type === 50 && block.reference_synced) {
                    const { source_document_id, source_block_id } = block.reference_synced;

                    // Fetch the source document's blocks
                    const sourceNode = { obj_type: 'docx', obj_token: source_document_id };
                    await this._fetchBlocks(sourceNode);

                    const sourceBlock = sourceNode.blocks.items.find(b => b.block_id === source_block_id);
                    if (sourceBlock) {
                        const blockId = block.block_id;
                        const parentId = block.parent_id;

                        // Replace reference_synced block content with source block content
                        Object.keys(block).forEach(key => delete block[key]);
                        Object.keys(sourceBlock).forEach(key => block[key] = sourceBlock[key]);
                        block.parent_id = parentId;

                        // Append child blocks from source
                        appendBlocks.push(...this._fetchBlockChildren(sourceBlock, sourceNode));

                        replacements.push({
                            parent_id: parentId,
                            reference_block_id: blockId,
                            source_block_id: source_block_id,
                        });
                    }
                }
            }

            if (appendBlocks.length > 0) {
                node.blocks.items = node.blocks.items.concat(appendBlocks);
            }

            if (replacements.length > 0) {
                for (const replacement of replacements) {
                    const parent = node.blocks.items.find(b => b.block_id === replacement.parent_id);
                    if (parent && parent.children) {
                        const index = parent.children.indexOf(replacement.reference_block_id);
                        if (index !== -1) {
                            parent.children[index] = replacement.source_block_id;
                        }
                    }
                }
            }
        }
    }

    _fetchBlockChildren(block, node) {
        let children = [];
        if (block.children) {
            for (const childId of block.children) {
                const child = node.blocks.items.find(b => b.block_id === childId);
                if (child) {
                    children.push(child);
                    children = children.concat(this._fetchBlockChildren(child, node));
                }
            }
        }
        return children;
    }

    // --- Validation ---

    _validateTree() {
        const errors = [];
        for (const [token, node] of this.sourceMap) {
            const isDocx = node.obj_type === 'docx' || node.type === 'docx';
            if (isDocx && (!node.blocks || !node.blocks.items || node.blocks.items.length === 0)) {
                errors.push(`  - ${token} (${node.title || node.name || 'unknown'})`);
            }
        }
        if (errors.length > 0) {
            throw new Error(`${errors.length} docx source(s) are missing blocks:\n${errors.join('\n')}`);
        }
    }
}

module.exports = DocScraper;
