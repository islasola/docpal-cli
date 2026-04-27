/**
 * Post-processing utilities for MDX output.
 *
 * Adapted from /Volumes/CaseSensitive/projects/zdoc-redesign/plugins/lark-docs/larkUtils.js
 *
 * Key difference from legacy: operates on in-memory data (strings, Maps) instead of
 * scanning directories for JSON source files. File-based functions from the legacy
 * implementation (__fetch_doc_source, determine_file_path, __convert_link that reads .md files)
 * are replaced with in-memory equivalents.
 */

const slugify = require('slugify');

class LarkUtils {
    /**
     * @param {Object} config
     * @param {Map} [config.sourceMap] - Map of token -> { slug, title, ... } for link resolution
     * @param {Function} [config.resolveLink] - async (url) => string|null for on-the-fly link resolution
     */
    constructor(config = {}) {
        this.sourceMap = config.sourceMap || new Map();
        this.resolveLink = config.resolveLink || null;
    }

    /**
     * Recursively list valid target paths from a nested config object.
     * Pure in-memory traversal.
     * @param {Object} targets - Nested config { targetName: { path, ... } }
     * @param {string} [root=''] - Current path prefix
     * @returns {string[]} - List of dot-separated target paths
     */
    listValidTargets(targets, root = '') {
        const paths = [];
        if (!targets) return paths;

        for (const [key, value] of Object.entries(targets)) {
            const currentPath = root ? `${root}.${key}` : key;
            if (typeof value === 'object' && value.path) {
                paths.push(currentPath);
            }
            if (typeof value === 'object') {
                paths.push(...this.listValidTargets(value, currentPath));
            }
        }
        return paths;
    }

    /**
     * Resolve a target config by dot-separated path.
     * Safe dot-path traversal (replaces eval() in legacy code).
     * @param {Object} targets - Nested config
     * @param {string} targetPath - Dot-separated path like "en.milvus"
     * @returns {Object|null}
     */
    resolveTarget(targets, targetPath) {
        if (!targets || !targetPath) return null;
        return targetPath.split('.').reduce((obj, key) => {
            return obj && obj[key] !== undefined ? obj[key] : null;
        }, targets);
    }

    /**
     * Resolve an internal Feishu link to a relative markdown path.
     * Works on-the-fly using the sourceMap instead of reading JSON files.
     * @param {string} url - Feishu URL to resolve
     * @returns {Promise<string|null>} - Relative path like "./slug" or null if not found
     */
    async convertLink(url) {
        if (!url) return null;

        // Try the injected resolver first (for on-the-fly resolution)
        if (this.resolveLink) {
            const resolved = await this.resolveLink(url);
            if (resolved) return resolved;
        }

        // Try resolving from sourceMap
        try {
            const urlObj = new URL(url);
            const token = urlObj.pathname.split('/').pop();
            const hash = urlObj.hash.slice(1);

            // Try both node_token and token/obj_token lookups
            const keys = urlObj.pathname.split('/')[1] === 'wiki'
                ? ['origin_node_token', 'node_token']
                : ['token', 'obj_token'];

            let page = null;
            for (const key of keys) {
                for (const [, node] of this.sourceMap) {
                    if (node[key] === token) {
                        page = node;
                        break;
                    }
                }
                if (page) break;
            }

            if (page) {
                const slug = page.slug;
                let newUrl = `./${slug}`;

                if (hash && page.blocks && page.blocks.items) {
                    const headerBlock = page.blocks.items.find(b => b.block_id === hash);
                    if (headerBlock) {
                        const blockType = getBlockTypeName(headerBlock.block_type);
                        if (blockType && headerBlock[blockType]) {
                            let content = extractHeadingContent(headerBlock[blockType]);
                            content = cleanHeadingText(content);
                            if (content) {
                                const headingSlug = slugify(content, { lower: true, strict: true });
                                newUrl += `#${headingSlug}`;
                            }
                        }
                    }
                }

                return newUrl.replace(/\/\//g, '/');
            }
        } catch (err) {
            // URL parsing failed, not a resolvable link
        }

        return null;
    }

    /**
     * Check a markdown string for broken links.
     * @param {string} content - MDX or markdown content
     * @returns {{ broken: string[], anchors: string[] }} - Lists of broken link/anchor issues
     */
    detectBrokenLinks(content) {
        const broken = [];
        const anchors = [];

        if (!content) return { broken, anchors };

        const lines = content.split('\n');
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];

            // Check for [text](null) links
            const nullLinks = [...line.matchAll(/\[([^\]]*)\]\(null\)/g)];
            for (const match of nullLinks) {
                broken.push(`Line ${i + 1}: [${match[1]}](null)`);
            }

            // Check for broken anchors like [text](#)
            const badAnchors = [...line.matchAll(/\[([^\]]*)\]\([^)]*#\)/g)];
            for (const match of badAnchors) {
                anchors.push(`Line ${i + 1}: [${match[1]}](#)`);
            }
        }

        return { broken, anchors };
    }

    /**
     * Merge fallback source nodes into the primary tree (in-memory).
     * Adapted from fetch_fallback_sources — operates on sourceMap instead of files.
     * @param {Map} primarySourceMap - Primary source nodes
     * @param {Map} fallbackSourceMap - Fallback source nodes (e.g., previous version)
     * @param {'wiki'|'drive'} sourceType
     * @returns {Map} - Merged source map
     */
    mergeFallbackSources(primarySourceMap, fallbackSourceMap, sourceType) {
        if (!fallbackSourceMap || fallbackSourceMap.size === 0) return primarySourceMap;

        const merged = new Map(primarySourceMap);

        for (const [token, fallbackNode] of fallbackSourceMap) {
            if (!merged.has(token)) {
                // Node exists in fallback but not in primary — inherit it
                merged.set(token, fallbackNode);
            } else {
                const primaryNode = merged.get(token);

                // Merge children: add fallback children that aren't in primary
                if (fallbackNode.children && fallbackNode.children.length > 0) {
                    if (!primaryNode.children) primaryNode.children = [];

                    const existingSlugs = new Set(primaryNode.children.map(c => c.slug));
                    for (const fallbackChild of fallbackNode.children) {
                        if (!existingSlugs.has(fallbackChild.slug)) {
                            primaryNode.children.push(fallbackChild);
                            const childKey = fallbackChild.origin_node_token || fallbackChild.token || fallbackChild.obj_token;
                            if (childKey && !merged.has(childKey)) {
                                merged.set(childKey, fallbackChild);
                            }
                        }
                    }
                }
            }
        }

        return merged;
    }

    /**
     * Post-process MDX content for Milvus-specific output.
     * Transforms Docusaurus MDX into plain markdown compatible with milvus.io.
     * Operates on a string, returns the transformed string.
     * @param {string} content - MDX content
     * @returns {string}
     */
    postprocessForMilvus(content) {
        if (!content) return content;

        // Replace Docusaurus <Tabs> with <div class="multipleCode">
        content = content.replace(/<Tabs\s+groupId="code"[^>]*>/g, '<div class="multipleCode">');
        content = content.replace(/<\/Tabs>/g, '</div>');

        // Replace <TabItem> with <div>
        content = content.replace(/<TabItem\s+value='([^']*)'[^>]*>/g, '<div id="$1">');
        content = content.replace(/<\/TabItem>/g, '</div>');

        // Remove Docusaurus imports
        content = content.replace(/^import\s+.*\s+from\s+['"][^'"]*['"];?\s*$/gm, '');

        // Remove empty table rows
        content = content.replace(/\n\s*<tr>\n(\s*<td.*><p><\/p><\/td>\n)*\s*<\/tr>/g, '');

        // Clean up excess whitespace
        content = content.replace(/(\s*\n){3,}/g, '\n\n');

        return content;
    }

    /**
     * Scan content and resolve any internal Feishu links.
     * @param {string} content - MDX content with potentially unresolved Feishu URLs
     * @returns {Promise<string>} - Content with resolved links
     */
    async resolveInternalLinks(content) {
        if (!content || !this.sourceMap.size) return content;

        // Find all Feishu URLs in the content
        const feishuHost = process.env.FEISHU_HOST || 'open.feishu.cn';
        const urlRegex = new RegExp(`https?://[^)]*${feishuHost.replace(/\./g, '\\.')}[^)]*`, 'g');

        const matches = [...content.matchAll(urlRegex)];
        for (const match of matches) {
            const originalUrl = match[0];
            const resolved = await this.convertLink(originalUrl);
            if (resolved) {
                content = content.replace(originalUrl, resolved);
            }
        }

        return content;
    }
}

// --- Helper functions ---

const BLOCK_TYPE_NAMES = [
    "page", "text", "heading1", "heading2", "heading3", "heading4",
    "heading5", "heading6", "heading7", "heading8", "heading9",
    "bullet", "ordered", "code", "quote", null,
    "todo", "bitable", "callout", "chat_card", "diagram",
    "divider", "file", "grid", "grid_column", "iframe",
    "image", "isv", "mindnote", "sheet", "table",
];

function getBlockTypeName(blockType) {
    return BLOCK_TYPE_NAMES[blockType - 1] || null;
}

function extractHeadingContent(heading) {
    if (!heading || !heading.elements) return '';
    return heading.elements
        .filter(e => e.text_run)
        .map(e => e.text_run.content || '')
        .join('');
}

function cleanHeadingText(text) {
    return text
        .replace(/<\/?[^>]+(>|$)/g, '')
        .trim();
}

module.exports = LarkUtils;
