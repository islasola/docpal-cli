/**
 * Sidebar generation and node categorization for Docusaurus.
 *
 * Adapted from zdoc-redesign's larkDocWriter.generate_sidebar() and categorize_node().
 * Operates on in-memory document trees instead of JSON source files.
 */

/**
 * Categorize a wiki/drive node as "meaningful" or "meaningless".
 * Meaningless nodes are index/placeholder pages with no real content — they
 * should not generate standalone .md files, only serve as sidebar categories.
 *
 * @param {Object} node - Document tree node with blocks
 * @returns {'meaningful'|'meaningless'}
 */
function categorizeNode(node) {
    if (!node.blocks || !node.blocks.items || node.blocks.items.length === 0) {
        return 'meaningless';
    }

    // Find the page block (block_type 1)
    const pageBlock = node.blocks.items.find(b => b.block_type === 1);
    if (!pageBlock || !pageBlock.children || pageBlock.children.length === 0) {
        return 'meaningless';
    }

    // Get non-page children
    const childBlocks = pageBlock.children
        .map(id => node.blocks.items.find(b => b.block_id === id))
        .filter(Boolean)
        .filter(b => b.block_type !== 1);

    // Count word content from text elements
    let wordCount = 0;
    for (const block of childBlocks) {
        const typeName = getBlockTypeName(block.block_type);
        if (typeName === 'text' && block.text) {
            wordCount += countWords(block.text.elements);
        } else if (typeName && typeName.startsWith('heading') && block[typeName]) {
            wordCount += countWords(block[typeName].elements);
        } else if (typeName === 'code' && block.code) {
            // Code blocks don't count as meaningful prose
        } else if (typeName === 'image' || typeName === 'divider') {
            // These don't count as meaningful prose
        } else if (typeName === 'table' || typeName === 'sheet') {
            // Tables and sheets are meaningful
            wordCount += 10;
        } else if (typeName === 'bullet' || typeName === 'ordered') {
            wordCount += countWords((block[typeName] || block.bullet || block.ordered)?.elements || []);
        }
    }

    // A node is meaningless if it has very little text content
    // (just a title and maybe a link to a child page)
    return wordCount < 15 ? 'meaningless' : 'meaningful';
}

/**
 * Generate a Docusaurus sidebar JSON from the document tree.
 *
 * @param {Object} tree - Root node of the document tree
 * @param {Object} [options]
 * @param {string} [options.contentRoot] - Content root path (e.g., "docs")
 * @param {boolean} [options.skipMeaningless=true] - Skip generating index pages for meaningless nodes
 * @returns {Object} - Docusaurus sidebar structure
 */
function generateSidebar(tree, options = {}) {
    const {
        contentRoot = '',
        skipMeaningless = true,
    } = options;

    return buildSidebarItems(tree, contentRoot, skipMeaningless);
}

/**
 * Recursively build sidebar items from tree nodes.
 */
function buildSidebarItems(node, currentPath, skipMeaningless) {
    const items = [];

    if (!node.children || node.children.length === 0) {
        return items;
    }

    for (const child of node.children) {
        const childSlug = child.slug;
        if (!childSlug) continue;

        const childPath = currentPath ? `${currentPath}/${childSlug}` : childSlug;

        if (child.has_child && child.children && child.children.length > 0) {
            // This node is a category with children
            const category = {
                type: 'category',
                label: child.title || child.name || childSlug,
                items: buildSidebarItems(child, childPath, skipMeaningless),
            };

            // Add link if the node is meaningful
            if (!skipMeaningless || categorizeNode(child) === 'meaningful') {
                category.link = {
                    type: 'doc',
                    id: childPath,
                };
            }

            items.push(category);
        } else {
            // Leaf node — add as a doc link
            items.push({
                type: 'doc',
                id: childPath,
                label: child.title || child.name || childSlug,
            });
        }
    }

    return items;
}

/**
 * Generate sidebar as a JSON string suitable for writing as a Docusaurus sidebar file.
 *
 * @param {Object} tree - Root document tree
 * @param {Object} [options] - Same options as generateSidebar
 * @returns {string} - JSON string
 */
function generateSidebarJson(tree, options = {}) {
    const sidebar = generateSidebar(tree, options);
    return JSON.stringify(sidebar, null, 2);
}

// --- Helpers ---

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

function countWords(elements) {
    if (!elements || !Array.isArray(elements)) return 0;
    let text = '';
    for (const el of elements) {
        if (el.text_run) text += el.text_run.content || '';
    }
    return text.trim().split(/\s+/).filter(w => w.length > 0).length;
}

module.exports = {
    categorizeNode,
    generateSidebar,
    generateSidebarJson,
    buildSidebarItems,
};
