/**
 * Markdown-to-Feishu block converter.
 *
 * Adapted from /Volumes/CaseSensitive/projects/feishu-markdown-bridge/src/markdown-to-feishu.js
 *
 * Converts Markdown/MDX content back into Feishu document blocks,
 * enabling the sync-back workflow (GitHub changes → Feishu updates).
 *
 * Uses docpal-cli's larkDocClient for API calls instead of raw fetch.
 * Pure conversion logic with no file I/O.
 */

const { marked } = require('marked');
const slugify = require('slugify');
const Bottleneck = require('bottleneck');
const larkDocClient = require('./larkDocClient');
const BlockDiffer = require('./blockDiffer');
const { KNOWN_JSX_TAGS } = require('./mdxPatcher');

// Block type mapping: string name -> Feishu block type integer
const BLOCK_TYPE_MAP = {
    page: 1, text: 2,
    heading1: 3, heading2: 4, heading3: 5, heading4: 6,
    heading5: 7, heading6: 8, heading7: 9, heading8: 10, heading9: 11,
    bullet: 12, ordered: 13, code: 14,
    quote: 15, todo: 16, bitable: 17, callout: 19,
    divider: 22, file: 23, grid: 24, grid_column: 25,
    iframe: 26, image: 27, sheet: 30, table: 31,
    quote_container: 34, add_ons: 40, board: 43,
};

// Language ID mapping: name -> Feishu integer ID
const LANG_ID_MAP = {
    PlainText: 1, Bash: 8, 'C++': 9, C: 10, CSS: 12, Dart: 15,
    Go: 23, HTML: 25, JSON: 29, Java: 30, JavaScript: 31,
    Kotlin: 33, LateX: 34, Lua: 37, Makefile: 39, Markdown: 40,
    PHP: 43, Perl: 44, Python: 51, Ruby: 54, Rust: 55,
    SQL: 57, Scala: 58, Shell: 61, Swift: 62, TypeScript: 64,
    YAML: 67, Dockerfile: 19, GraphQL: 71, TOML: 77,
    // Common aliases
    js: 31, ts: 64, py: 51, rb: 54, sh: 61, yml: 67,
    javascript: 31, typescript: 64, python: 51, golang: 23,
};

const BATCH_SIZE = 50; // Max blocks per create API call
const createLimiter = new Bottleneck({ maxConcurrent: 1, minTime: 52 });

class MarkdownToFeishu {
    /**
     * @param {Object} [config]
     * @param {Function} [config.resolveImage] - async (url, { documentId }) => { file_key } for image upload
     */
    constructor(config = {}) {
        this.resolveImage = config.resolveImage || null;
        this.imageBlocks = []; // Collect image blocks for deferred upload
    }

    /**
     * Convert markdown content to Feishu blocks.
     * @param {string} markdownContent - Raw markdown/MDX string
     * @returns {Promise<Object[]>} - Array of Feishu block objects
     */
    async convert(markdownContent) {
        // Strip YAML frontmatter
        let content = markdownContent.replace(/^---\n[\s\S]*?\n---\n?/, '');

        // Strip import statements
        content = content.replace(/^import\s+.*$/gm, '');

        // Strip translation artifacts that may leak from segmented translation
        content = content.replace(/<translation_context>[\s\S]*?<\/translation_context>\s*/gi, '');
        content = content.replace(/<text>\n?([\s\S]*?)\n?<\/text>/g, '$1');

        // Collapse blank lines between list items so marked treats them as one list
        // But don't collapse after JSX/HTML tag lines (ending with >) to keep tags separate
        content = content.replace(/(?<!>)\n{2,}( {0,3}[-*+] |\ {0,3}\d+\. )/g, '\n$1');

        // Extract and preserve JSX components before parsing
        const placeholders = {};
        let placeholderIdx = 0;

        // Preserve <!-- feishu-block: ... --> metadata comments
        content = content.replace(/<!-- feishu-block: (\w+), (.+?) -->/g, (match, type, data) => {
            const key = `__FEISHU_BLOCK_${placeholderIdx++}__`;
            placeholders[key] = { type, data };
            return key;
        });

        // Extract <Admonition>...</Admonition> blocks as placeholders
        // to prevent marked from splitting them into separate HTML tokens
        content = content.replace(/<Admonition[\s\S]*?<\/Admonition>/g, (match) => {
            const key = `__ADMONITION_${placeholderIdx++}__`;
            placeholders[key] = { type: 'admonition', data: match };
            return key;
        });

        // Tokenize with marked
        const tokens = marked.lexer(content);

        // Convert tokens to blocks
        const blocks = await this._tokensToBlocks(tokens, placeholders);

        return blocks;
    }

    /**
     * Create a new Feishu document and push markdown content to it.
     * @param {Object} params
     * @param {string} params.content - Markdown content
     * @param {string} [params.title] - Document title
     * @param {string} [params.folderToken] - Parent folder token
     * @param {string} [params.documentId] - Existing document ID to update
     * @returns {Promise<{ documentId: string, blocksCreated: number }>}
     */
    async pushToFeishu({ content, title, folderToken, documentId }) {
        const blocks = await this.convert(content);

        if (!documentId) {
            // Create new document
            const doc = await larkDocClient.createDoc(folderToken, title || 'Untitled');
            documentId = doc.document.document_id;
        } else {
            // Update existing document: delete old blocks first
            await this._clearDocument(documentId);
        }

        // Process deferred image uploads now that we have a document ID
        await this._processImageBlocks(blocks, documentId);

        // Create blocks in the document
        await this._createBlocks(documentId, blocks);

        return { documentId, blocksCreated: blocks.length };
    }

    /**
     * Patch an existing document with new content using the specified strategy.
     *
     * @param {Object} params
     * @param {string} params.documentId - Document to patch
     * @param {string} params.content - New markdown content
     * @param {'smart'|'replace'|'append'} [params.strategy='replace'] - Patch strategy
     *   - 'replace': Clear all content and recreate (default, original behavior)
     *   - 'append': Append new blocks after existing content
     *   - 'smart': Diff existing vs desired blocks, update changed, create new, delete removed
     * @returns {Promise<{ updated: number, created: number, deleted: number, strategy: string }>}
     */
    async patchDocument({ documentId, content, strategy = 'replace' }) {
        const newBlocks = await this.convert(content);

        // Process deferred image uploads before patching
        await this._processImageBlocks(newBlocks, documentId);

        const existing = await larkDocClient.getAllBlocks(documentId);

        const pageBlock = existing.items.find(b => b.block_type === 1);
        if (!pageBlock) {
            throw new Error('Document has no page block');
        }

        if (strategy === 'append') {
            return this._patchAppend(documentId, pageBlock, newBlocks);
        } else if (strategy === 'smart') {
            return this._patchSmart(documentId, existing, pageBlock, newBlocks);
        } else {
            return this._patchReplace(documentId, existing, pageBlock, newBlocks);
        }
    }

    async _patchReplace(documentId, existing, pageBlock, newBlocks) {
        let updated = 0;
        let created = 0;

        const existingChildren = (pageBlock.children || [])
            .map(id => existing.items.find(b => b.block_id === id))
            .filter(Boolean);

        for (let i = 0; i < Math.min(existingChildren.length, newBlocks.length); i++) {
            try {
                await larkDocClient.updateBlock(documentId, existingChildren[i].block_id, [newBlocks[i]]);
                updated++;
            } catch (err) {
                console.warn(`Failed to update block ${existingChildren[i].block_id}: ${err.message}`);
            }
        }

        for (let i = newBlocks.length; i < existingChildren.length; i++) {
            try {
                await larkDocClient.deleteBlock(documentId, existingChildren[i].block_id);
            } catch (err) {
                console.warn(`Failed to delete block ${existingChildren[i].block_id}: ${err.message}`);
            }
        }

        if (newBlocks.length > existingChildren.length) {
            const extraBlocks = newBlocks.slice(existingChildren.length);
            await this._createBlocks(documentId, extraBlocks);
            created = extraBlocks.length;
        }

        return { updated, created, deleted: Math.max(0, existingChildren.length - newBlocks.length), strategy: 'replace' };
    }

    async _patchAppend(documentId, pageBlock, newBlocks) {
        await this._createBlocks(documentId, newBlocks);
        return { updated: 0, created: newBlocks.length, deleted: 0, strategy: 'append' };
    }

    async _patchSmart(documentId, existing, pageBlock, newBlocks) {
        const differ = new BlockDiffer({ matchBy: 'position' });
        const desiredBlocks = [
            { block_type: 1, block_id: 'desired_root', children: newBlocks.map((_, i) => `desired_${i}`) },
            ...newBlocks.map((block, i) => ({ ...block, block_id: `desired_${i}` }))
        ];
        const diff = differ.diff(existing.items, desiredBlocks);

        let updated = 0;
        let created = 0;
        let deleted = 0;

        for (const action of diff.toUpdate) {
            try {
                const existingBlock = existing.items.find(b => b.block_id === action.blockId);
                if (existingBlock) {
                    const patchData = { ...action.block };
                    delete patchData.block_id;
                    await larkDocClient.updateBlock(documentId, action.blockId, [patchData]);
                    updated++;
                }
            } catch (err) {
                console.warn(`Failed to smart-update block ${action.blockId}: ${err.message}`);
            }
        }

        for (const action of diff.toCreate) {
            try {
                const blockData = { ...action.block };
                delete blockData.block_id;
                await larkDocClient.createBlocks(documentId, [blockData]);
                created++;
            } catch (err) {
                console.warn(`Failed to smart-create block: ${err.message}`);
            }
        }

        for (const action of diff.toDelete) {
            try {
                await larkDocClient.deleteBlock(documentId, action.blockId);
                deleted++;
            } catch (err) {
                console.warn(`Failed to smart-delete block ${action.blockId}: ${err.message}`);
            }
        }

        return { updated, created, deleted, strategy: 'smart' };
    }

    // --- Token-to-Block Conversion ---

    async _tokensToBlocks(tokens, placeholders) {
        const blocks = [];

        for (const token of tokens) {
            const block = await this._tokenToBlock(token, placeholders);
            if (block) {
                if (Array.isArray(block)) {
                    blocks.push(...block);
                } else {
                    blocks.push(block);
                }
            }
        }

        return blocks;
    }

    async _tokenToBlock(token, placeholders) {
        switch (token.type) {
            case 'heading':
                return this._createHeadingBlock(token);
            case 'paragraph':
                return this._createTextBlock(token, placeholders);
            case 'code':
                return this._createCodeBlock(token);
            case 'list':
                return this._createListBlocks(token);
            case 'blockquote':
                return this._createBlockquoteBlock(token);
            case 'hr':
                return this._createDividerBlock();
            case 'table':
                return this._createTableBlock(token);
            case 'html':
                return this._parseHtmlBlock(token, placeholders);
            case 'space':
                return null;
            default:
                return null;
        }
    }

    _createHeadingBlock(token) {
        const level = Math.min(token.depth || 1, 9);
        const typeName = `heading${level}`;
        const blockType = BLOCK_TYPE_MAP[typeName];

        // Strip {#slug} from text if present
        let text = token.text || '';
        text = text.replace(/\s*\{#[a-z0-9-]+\}\s*$/g, '').trim();

        return {
            block_type: blockType,
            [typeName]: {
                elements: this._parseInlineMarkdown(text),
            },
        };
    }

    _createTextBlock(token, placeholders) {
        const text = token.text || token.raw || '';

        // Check for placeholder (e.g. Admonition)
        for (const [key, value] of Object.entries(placeholders || {})) {
            if (text.includes(key)) {
                if (value.type === 'admonition') {
                    return this._createCalloutFromHtml(value.data);
                }
                return this._createBlockFromMetadata(value);
            }
        }

        // Check for image-only paragraph
        const imgMatch = text.match(/^!\[([^\]]*)\]\(([^)]+)\)$/);
        if (imgMatch) {
            return this._createImageBlockFromUrl(imgMatch[2], imgMatch[1]);
        }

        return {
            block_type: BLOCK_TYPE_MAP.text,
            text: {
                elements: this._parseInlineMarkdown(text),
            },
        };
    }

    _createCodeBlock(token) {
        const lang = token.lang || 'PlainText';
        const langId = LANG_ID_MAP[lang] || LANG_ID_MAP[lang.toLowerCase()] || 1;
        const code = token.text || '';

        return {
            block_type: BLOCK_TYPE_MAP.code,
            code: {
                style: { language: langId },
                elements: [{ text_run: { content: code } }],
            },
        };
    }

    _createListBlocks(token, ordered) {
        const isOrdered = ordered !== undefined ? ordered : token.ordered;
        const blockType = isOrdered ? BLOCK_TYPE_MAP.ordered : BLOCK_TYPE_MAP.bullet;
        const typeName = isOrdered ? 'ordered' : 'bullet';
        const blocks = [];

        for (const item of token.items) {
            const text = item.text || '';
            const block = {
                block_type: blockType,
                [typeName]: {
                    elements: this._parseInlineMarkdown(text),
                },
            };

            // Handle nested lists
            if (item.tokens) {
                const nested = item.tokens.find(t => t.type === 'list');
                if (nested) {
                    const childBlocks = this._createListBlocks(nested);
                    block.children = childBlocks.map(b => b);
                    // We need block_ids, but those are assigned server-side
                    // Store as children for later processing
                }
            }

            blocks.push(block);
        }

        return blocks;
    }

    async _createBlockquoteBlock(token) {
        // Convert to quote_container with child blocks
        const innerTokens = token.tokens || [];
        const childBlocks = await this._tokensToBlocks(innerTokens, {});

        return {
            block_type: BLOCK_TYPE_MAP.quote_container,
            children: childBlocks,
        };
    }

    _createDividerBlock() {
        return {
            block_type: BLOCK_TYPE_MAP.divider,
            divider: {},
        };
    }

    _createTableBlock(token) {
        const headers = token.header || [];
        const rows = token.rows || [];
        const allRows = [headers, ...rows];

        const rowSize = allRows.length;
        const columnSize = headers.length;

        // Build cells
        const cells = [];
        for (const row of allRows) {
            for (const cell of row) {
                cells.push({
                    block_type: BLOCK_TYPE_MAP.text,
                    text: {
                        elements: this._parseInlineMarkdown(cell.text || cell || ''),
                    },
                });
            }
        }

        return {
            block_type: BLOCK_TYPE_MAP.table,
            table: {
                property: {
                    row_size: rowSize,
                    column_size: columnSize,
                    header_row: true,
                    merge_info: cells.map(() => ({ col_span: 1, row_span: 1 })),
                },
                cells: cells.map(c => c), // Will be assigned block_ids by server
            },
            children: cells,
        };
    }

    _createImageBlockFromUrl(url, caption) {
        // If the URL is a local path that embeds a Feishu token, inherit it directly
        const tokenMatch = url.match(/^\/([a-zA-Z0-9]+)\.png$/);
        if (tokenMatch && caption === tokenMatch[1]) {
            return {
                block_type: BLOCK_TYPE_MAP.image,
                image: {
                    token: tokenMatch[1],
                },
            };
        }

        const block = {
            block_type: BLOCK_TYPE_MAP.image,
            image: {
                token: '',
                _metadata: {
                    needs_upload: true,
                    url: url,
                    caption: caption || '',
                },
            },
        };

        // Defer image upload
        this.imageBlocks.push(block);
        return block;
    }

    async _parseHtmlBlock(token, placeholders) {
        const html = token.text || token.raw || '';

        // Check for preserved feishu-block metadata
        for (const [key, value] of Object.entries(placeholders)) {
            if (html.includes(key)) {
                return this._createBlockFromMetadata(value);
            }
        }

        // Check for HTML table
        if (html.includes('<table')) {
            return this._createTableBlockFromHtml(html);
        }

        // Check for Admonition
        if (html.includes('<Admonition')) {
            return this._createCalloutFromHtml(html);
        }

        // Check for Grid
        if (html.includes('<Grid')) {
            return this._createGridFromHtml(html);
        }

        // Check for block-level JSX components (e.g., <Procedures>...</Procedures>)
        const jsxBlockMatch = html.match(/^\s*<([A-Z][A-Za-z0-9]*)[^>]*>([\s\S]*)<\/\1>\s*$/);
        if (jsxBlockMatch) {
            const tagName = jsxBlockMatch[1];
            const inner = jsxBlockMatch[2];
            // Parse inner markdown content
            const innerTokens = marked.lexer(inner.trim());
            const innerBlocks = await this._tokensToBlocks(innerTokens, {});
            return [
                {
                    block_type: BLOCK_TYPE_MAP.text,
                    text: { elements: [{ text_run: { content: `<${tagName}>` } }] },
                },
                ...innerBlocks,
                {
                    block_type: BLOCK_TYPE_MAP.text,
                    text: { elements: [{ text_run: { content: `</${tagName}>` } }] },
                },
            ];
        }

        // Check for standalone JSX opening/closing tags (e.g., <Procedures>, </Procedures>)
        // marked.lexer() splits these into separate HTML tokens when on their own lines
        const standaloneMatch = html.match(/^\s*(<\/?[A-Z][A-Za-z0-9]*[^>]*>)\s*$/);
        if (standaloneMatch) {
            const tag = standaloneMatch[1];
            const nameMatch = tag.match(/<\/?([A-Z][A-Za-z0-9]*)/);
            if (nameMatch && KNOWN_JSX_TAGS.has(nameMatch[1])) {
                return {
                    block_type: BLOCK_TYPE_MAP.text,
                    text: { elements: [{ text_run: { content: tag } }] },
                };
            }
        }

        // Fallback: create text block with raw HTML as content
        return {
            block_type: BLOCK_TYPE_MAP.text,
            text: {
                elements: [{ text_run: { content: html.replace(/<[^>]+>/g, '').trim() } }],
            },
        };
    }

    _createBlockFromMetadata({ type, data }) {
        const params = {};
        for (const pair of data.split(', ')) {
            const [key, val] = pair.split(': ');
            if (key && val) params[key.trim()] = val.trim();
        }

        if (type === 'board') {
            return {
                block_type: BLOCK_TYPE_MAP.board,
                board: { token: params.token || '' },
            };
        }
        if (type === 'iframe') {
            return {
                block_type: BLOCK_TYPE_MAP.iframe,
                iframe: {
                    component: {
                        iframe_type: parseInt(params.type) || 0,
                        url: params.url || '',
                    },
                },
            };
        }
        if (type === 'sheet') {
            return {
                block_type: BLOCK_TYPE_MAP.sheet,
                sheet: { token: params.token || '' },
            };
        }
        if (type === 'superdemo') {
            return {
                block_type: BLOCK_TYPE_MAP.add_ons,
                add_ons: {
                    component_type_id: 'blk_682093ba9580c002363b9dc3',
                    record: JSON.stringify({
                        id: params.id || '',
                        isShowcase: params.isShowcase === 'true',
                    }),
                },
            };
        }

        return null;
    }

    _createTableBlockFromHtml(html) {
        // Extract table rows and cells from HTML
        const rowMatches = [...html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)];
        const allCellElements = [];
        let headerRow = false;
        let headerColumn = false;

        for (let rowIdx = 0; rowIdx < rowMatches.length; rowIdx++) {
            const rowMatch = rowMatches[rowIdx];
            const cellMatches = [...rowMatch[1].matchAll(/<t([hd])[^>]*>([\s\S]*?)<\/t\1>/g)];
            const rowCells = cellMatches.map(m => this._parseHtmlInline(m[2]));
            allCellElements.push(rowCells);

            // Detect header row (row 0 contains <th>)
            if (rowIdx === 0 && cellMatches.some(m => m[1] === 'h')) {
                headerRow = true;
            }
            // Detect header column (column 0 contains <th> in any row)
            if (cellMatches.length > 0 && cellMatches[0][1] === 'h') {
                headerColumn = true;
            }
        }

        if (allCellElements.length === 0) return null;

        const rowSize = allCellElements.length;
        const columnSize = Math.max(...allCellElements.map(r => r.length));
        const cells = [];

        for (const row of allCellElements) {
            for (let j = 0; j < columnSize; j++) {
                const elements = row[j] || [{ text_run: { content: ' ' } }];
                cells.push({
                    block_type: BLOCK_TYPE_MAP.text,
                    text: { elements },
                });
            }
        }

        return {
            block_type: BLOCK_TYPE_MAP.table,
            table: {
                property: {
                    row_size: rowSize,
                    column_size: columnSize,
                    header_row: headerRow,
                    header_column: headerColumn,
                    merge_info: cells.map(() => ({ col_span: 1, row_span: 1 })),
                },
                cells: cells.map(c => c),
            },
            children: cells,
        };
    }

    _parseHtmlInline(html) {
        // Strip paragraph/br tags
        html = html.replace(/<\/?p[^>]*>/gi, '').replace(/<br\s*\/?>/gi, '\n');
        const elements = [];
        const decodeEntities = s => s
            .replace(/&ast;/g, '*').replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
            .replace(/&#36;/g, '$');

        const regex = /<(code|strong|b|em|i|del|s)\b[^>]*>([\s\S]*?)<\/\1>|([^<]+)/g;
        let match;
        while ((match = regex.exec(html)) !== null) {
            if (match[3] !== undefined) {
                const text = decodeEntities(match[3].trim());
                if (text) elements.push({ text_run: { content: text } });
            } else {
                const tag = match[1].toLowerCase();
                const text = decodeEntities(match[2].replace(/<[^>]+>/g, ''));
                if (!text) continue;
                const style = {};
                if (tag === 'code') style.inline_code = true;
                else if (tag === 'strong' || tag === 'b') style.bold = true;
                else if (tag === 'em' || tag === 'i') style.italic = true;
                else if (tag === 'del' || tag === 's') style.strikethrough = true;
                elements.push({ text_run: { content: text, ...(Object.keys(style).length && { text_element_style: style }) } });
            }
        }

        return elements.length > 0 ? elements : [{ text_run: { content: ' ' } }];
    }

    _createCalloutFromHtml(html) {
        const emojiMatch = html.match(/icon="([^"]*)"/);
        const titleMatch = html.match(/title="([^"]*)"/);
        const emoji = emojiMatch ? emojiMatch[1] : '📘';
        const title = titleMatch ? titleMatch[1] : '';

        // Extract content between tags
        const contentMatch = html.match(/<Admonition[^>]*>([\s\S]*?)<\/Admonition>/);
        const content = contentMatch ? contentMatch[1].replace(/<[^>]+>/g, '').trim() : '';

        const children = [];
        if (title) {
            children.push({
                block_type: BLOCK_TYPE_MAP.text,
                text: { elements: [{ text_run: { content: title } }] },
            });
        }
        if (content) {
            children.push({
                block_type: BLOCK_TYPE_MAP.text,
                text: { elements: [{ text_run: { content } }] },
            });
        }

        // Expanded emoji mapping for richer callout semantics
        const EMOJI_TO_FEISHU = {
            '🚧': 'construction',
            '📘': 'blue_book',
            '💡': 'light_bulb',
            '🔥': 'fire',
            '⚠️': 'warning',
        };

        const emojiId = EMOJI_TO_FEISHU[emoji] || 'notebook';

        const calloutDef = {
            emoji_id: emojiId,
        };

        // Preserve background/border colors if present in the Admonition tag
        const bgColorMatch = html.match(/background-color="([^"]*)"/);
        const borderColorMatch = html.match(/border-color="([^"]*)"/);
        if (bgColorMatch) calloutDef.background_color = bgColorMatch[1];
        if (borderColorMatch) calloutDef.border_color = borderColorMatch[1];

        return {
            block_type: BLOCK_TYPE_MAP.callout,
            callout: calloutDef,
            children: children.length > 0 ? children : [{
                block_type: BLOCK_TYPE_MAP.text,
                text: { elements: [{ text_run: { content: ' ' } }] },
            }],
        };
    }

    _createGridFromHtml(html) {
        const columnSizeMatch = html.match(/columnSize="([^"]*)"/);
        const widthRatiosMatch = html.match(/widthRatios="([^"]*)"/);

        const columnSize = parseInt(columnSizeMatch?.[1]) || 2;
        const widthRatios = widthRatiosMatch?.[1]?.split(',').map(Number) || [];

        // Extract column content
        const divMatches = [...html.matchAll(/<div>([\s\S]*?)<\/div>/g)];
        const columns = [];

        for (const divMatch of divMatches) {
            const column = {
                block_type: BLOCK_TYPE_MAP.grid_column,
                grid_column: { width_ratio: widthRatios[columns.length] || 1 },
                children: [{
                    block_type: BLOCK_TYPE_MAP.text,
                    text: {
                        elements: [{ text_run: { content: divMatch[1].replace(/<[^>]+>/g, '').trim() } }],
                    },
                }],
            };
            columns.push(column);
        }

        return {
            block_type: BLOCK_TYPE_MAP.grid,
            grid: { column_size: columnSize },
            children: columns,
        };
    }

    // --- Inline Markdown Parsing ---

    _decodeHtmlEntities(s) {
        return s
            .replace(/&ast;/g, '*').replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
            .replace(/&#36;/g, '$');
    }

    _parseInlineMarkdown(text) {
        if (!text) return [];

        const elements = [];
        let remaining = text;

        // Simple character-by-character parser for inline styles
        while (remaining.length > 0) {
            // Bold: **text**
            let match = remaining.match(/^(\s*)\*\*(.+?)\*\*(\s*)/);
            if (match) {
                if (match[1]) elements.push({ text_run: { content: match[1] } });
                elements.push({
                    text_run: {
                        content: match[2],
                        text_element_style: { bold: true },
                    },
                });
                if (match[3]) elements.push({ text_run: { content: match[3] } });
                remaining = remaining.slice(match[0].length);
                continue;
            }

            // Italic: *text*
            match = remaining.match(/^(\s*)\*([^*]+?)\*(\s*)/);
            if (match) {
                if (match[1]) elements.push({ text_run: { content: match[1] } });
                elements.push({
                    text_run: {
                        content: match[2],
                        text_element_style: { italic: true },
                    },
                });
                if (match[3]) elements.push({ text_run: { content: match[3] } });
                remaining = remaining.slice(match[0].length);
                continue;
            }

            // Inline code: `text`
            match = remaining.match(/^(\s*)`([^`]+?)`(\s*)/);
            if (match) {
                if (match[1]) elements.push({ text_run: { content: match[1] } });
                elements.push({
                    text_run: {
                        content: match[2],
                        text_element_style: { inline_code: true },
                    },
                });
                if (match[3]) elements.push({ text_run: { content: match[3] } });
                remaining = remaining.slice(match[0].length);
                continue;
            }

            // Strikethrough: ~~text~~
            match = remaining.match(/^(\s*)~~(.+?)~~(\s*)/);
            if (match) {
                if (match[1]) elements.push({ text_run: { content: match[1] } });
                elements.push({
                    text_run: {
                        content: match[2],
                        text_element_style: { strikethrough: true },
                    },
                });
                if (match[3]) elements.push({ text_run: { content: match[3] } });
                remaining = remaining.slice(match[0].length);
                continue;
            }

            // Link: [text](url)
            match = remaining.match(/^(\s*)\[([^\]]+)\]\(([^)]+)\)(\s*)/);
            if (match) {
                if (match[1]) elements.push({ text_run: { content: match[1] } });
                elements.push({
                    text_run: {
                        content: match[2],
                        text_element_style: { link: { url: match[3] } },
                    },
                });
                if (match[4]) elements.push({ text_run: { content: match[4] } });
                remaining = remaining.slice(match[0].length);
                continue;
            }

            // Equation: $text$
            match = remaining.match(/^(\s*)\$([^$]+)\$(\s*)/);
            if (match) {
                if (match[1]) elements.push({ text_run: { content: match[1] } });
                elements.push({
                    equation: { content: match[2] },
                });
                if (match[3]) elements.push({ text_run: { content: match[3] } });
                remaining = remaining.slice(match[0].length);
                continue;
            }

            // Plain text: consume up to next special character
            match = remaining.match(/^[^*`~\[$]+/);
            if (match) {
                elements.push({ text_run: { content: match[0] } });
                remaining = remaining.slice(match[0].length);
            } else {
                // Consume single character to avoid infinite loop
                elements.push({ text_run: { content: remaining[0] } });
                remaining = remaining.slice(1);
            }
        }

        // Decode HTML entities in text_run content (e.g. &#36; → $, &ast; → *)
        for (const el of elements) {
            if (el.text_run?.content) {
                el.text_run.content = this._decodeHtmlEntities(el.text_run.content);
            }
        }

        return elements.length > 0 ? elements : [{ text_run: { content: ' ' } }];
    }

    // --- Image Upload ---

    async _processImageBlocks(blocks, documentId) {
        if (!this.resolveImage) return;

        for (const block of blocks) {
            if (block.image && block.image._metadata && block.image._metadata.needs_upload) {
                try {
                    const result = await this.resolveImage(block.image._metadata.url, { documentId });
                    if (result && result.file_key) {
                        block.image.token = result.file_key;
                    }
                } catch (err) {
                    console.warn(`Failed to upload image: ${err.message}`);
                }
                delete block.image._metadata;
            }

            // Process children recursively
            if (block.children && Array.isArray(block.children)) {
                await this._processImageBlocks(block.children, documentId);
            }
        }
    }

    // --- Document Operations ---

    async _clearDocument(documentId) {
        const { items } = await larkDocClient.getAllBlocks(documentId);
        const pageBlock = items.find(b => b.block_type === 1);
        if (!pageBlock || !pageBlock.children || pageBlock.children.length === 0) return;

        // Use batch_delete to remove all children of the page block in one call
        // Feishu API: DELETE .../blocks/:block_id/children/batch_delete { start_index, end_index }
        const childCount = pageBlock.children.length;
        try {
            await larkDocClient.request('DELETE',
                `/open-apis/docx/v1/documents/${documentId}/blocks/${pageBlock.block_id}/children/batch_delete`,
                { start_index: 0, end_index: childCount }
            );
        } catch (err) {
            console.warn(`Failed to batch-delete ${childCount} blocks: ${err.message}`);
        }
    }

    async _createBlocks(documentId, blocks) {
        // Filter out empty text blocks and broken image blocks
        const filtered = blocks.filter(b => {
            if (b.block_type === 2 && b.text) {
                const allEmpty = b.text.elements.every(e =>
                    e.text_run && (!e.text_run.content || e.text_run.content.trim() === '')
                );
                return !allEmpty;
            }
            if (b.block_type === 27 && (!b.image?.token || b.image._metadata?.needs_upload)) {
                return false;
            }
            return true;
        });

        const needsDescendant = filtered.some(b =>
            b.block_type === BLOCK_TYPE_MAP.table ||
            b.block_type === BLOCK_TYPE_MAP.callout ||
            (b.children && Array.isArray(b.children) && b.children.length > 0)
        );

        if (!needsDescendant) {
            for (let i = 0; i < filtered.length; i += BATCH_SIZE) {
                const batch = filtered.slice(i, i + BATCH_SIZE);
                await createLimiter.schedule(async () => {
                    await larkDocClient.createBlocks(documentId, batch, i);
                });
            }
            return;
        }

        // Use descendant API for everything to preserve order
        const childrenId = [];
        const descendants = [];
        let idx = 0;

        for (const b of filtered) {
            const tempId = `b${idx++}`;

            if (b.block_type === BLOCK_TYPE_MAP.table) {
                const { table, children: cellBlocks } = b;
                const { row_size, column_size, header_row, header_column } = table.property;
                const cells = cellBlocks || [];

                childrenId.push(tempId);
                const cellIds = cells.map((_, i) => `${tempId}c${i}`);
                const textIds = cells.map((_, i) => `${tempId}t${i}`);

                descendants.push({
                    block_id: tempId, block_type: 31,
                    table: {
                        property: {
                            row_size,
                            column_size,
                            header_row: header_row || false,
                            header_column: header_column || false,
                        }
                    },
                    children: cellIds,
                });
                for (let i = 0; i < cells.length; i++) {
                    descendants.push({ block_id: cellIds[i], block_type: 32, table_cell: {}, children: [textIds[i]] });
                    descendants.push({ block_id: textIds[i], block_type: 2, text: cells[i].text || { elements: [{ text_run: { content: ' ' } }] }, children: [] });
                }
            } else if (b.block_type === BLOCK_TYPE_MAP.callout && b.children?.length) {
                const childIds = b.children.map((_, i) => `${tempId}ch${i}`);
                childrenId.push(tempId);
                descendants.push({ block_id: tempId, block_type: 19, callout: b.callout, children: childIds });
                for (let i = 0; i < b.children.length; i++) {
                    const ch = b.children[i];
                    descendants.push({ block_id: childIds[i], block_type: ch.block_type || 2, text: ch.text || { elements: [{ text_run: { content: ' ' } }] }, children: [] });
                }
            } else {
                const blockDef = { block_id: tempId, block_type: b.block_type, children: [] };
                for (const key of ['text', 'heading1', 'heading2', 'heading3', 'heading4', 'heading5', 'heading6', 'heading7', 'heading8', 'heading9', 'code', 'quote', 'ordered', 'bullet', 'todo', 'divider', 'image']) {
                    if (b[key]) blockDef[key] = b[key];
                }
                childrenId.push(tempId);
                descendants.push(blockDef);
            }
        }

        await createLimiter.schedule(async () => {
            await larkDocClient.createDescendants(documentId, childrenId, descendants, 0);
        });
    }
}

module.exports = MarkdownToFeishu;
