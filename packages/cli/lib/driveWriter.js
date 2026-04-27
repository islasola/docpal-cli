/**
 * Drive-specific document writing utilities.
 *
 * Adapted from /Volumes/CaseSensitive/projects/zdoc-redesign/plugins/lark-docs/larkDriveWriter.js
 *
 * Handles the differences between wiki and drive source types:
 * - Drive uses `token` instead of `node_token`
 * - Drive folders map to Docusaurus sidebar categories
 * - Drive has index docx files (same name as folder) that provide the folder's content
 * - Drive-specific frontmatter fields (displayed_sidebar, added_since)
 *
 * Operates on in-memory trees from docScraper, not JSON files.
 */

const { blocksToMdx } = require('./mdxWriter');
const { patchMdx } = require('./mdxPatcher');
const { generateFrontMatter } = require('./frontMatter');
const { categorizeNode } = require('./sidebar');

/**
 * Convert an entire drive tree to MDX files (returned as in-memory records).
 *
 * @param {Object} tree - Root drive folder node from docScraper
 * @param {Object} options
 * @param {Function} [options.resolveImage] - Image resolver callback
 * @param {Function} [options.resolveLink] - Link resolver callback
 * @param {string} [options.target] - Target name for content filtering
 * @param {string} [options.displayedSidebar] - Sidebar key for frontmatter
 * @param {string} [options.outputPath] - Base output path (e.g., "docs")
 * @returns {Promise<Array<{ path: string, content: string, slug: string, title: string }>>}
 */
async function convertDriveTree(tree, options = {}) {
    const results = [];
    await convertDriveNode(tree, options, results, '');
    return results;
}

/**
 * Recursively convert a drive folder/docx node.
 */
async function convertDriveNode(node, options, results, parentPath) {
    if (!node) return;

    const nodeSlug = node.slug || node.name;
    const currentPath = parentPath ? `${parentPath}/${nodeSlug}` : nodeSlug;

    // If this is a docx, convert it
    if (node.type === 'docx' && node.blocks && node.blocks.items) {
        const content = await convertDriveDoc(node, { ...options, parentPath });
        if (content) {
            results.push({
                path: `${currentPath}.mdx`,
                content,
                slug: nodeSlug,
                title: node.title || node.name,
            });
        }
    }

    // If this is a folder, check for index docx and process children
    if (node.type === 'folder' || node.children) {
        // Check for index docx (docx with same name as folder)
        const indexDoc = (node.children || []).find(
            c => c.type === 'docx' && c.name === node.name
        );

        if (indexDoc && indexDoc.blocks && indexDoc.blocks.items) {
            // The index docx provides the folder's main content
            const content = await convertDriveDoc(indexDoc, {
                ...options,
                parentPath,
                displayedSidebar: options.displayedSidebar || nodeSlug,
            });
            if (content) {
                results.push({
                    path: `${currentPath}/index.mdx`,
                    content,
                    slug: nodeSlug,
                    title: indexDoc.title || indexDoc.name,
                });
            }
        }

        // Process children
        if (node.children) {
            for (const child of node.children) {
                // Skip the index docx — already handled above
                if (child.type === 'docx' && child.name === node.name) continue;
                await convertDriveNode(child, options, results, currentPath);
            }
        }
    }
}

/**
 * Convert a single drive docx node to MDX.
 */
async function convertDriveDoc(node, options = {}) {
    const {
        resolveImage = null,
        resolveLink = null,
        target = null,
        displayedSidebar = null,
        parentPath = '',
    } = options;

    // Build block map
    const blockMap = new Map();
    for (const block of node.blocks.items) {
        if (block && block.block_id) {
            blockMap.set(block.block_id, block);
        }
    }

    // Convert blocks to MDX
    const rawMdx = await blocksToMdx(node.blocks.items, {
        resolveImage,
        resolveLink,
        target,
    });

    // Patch MDX
    const { content: patchedMdx } = await patchMdx(rawMdx);

    // Generate frontmatter with drive-specific fields
    const title = node.title || node.name || '';
    const slug = node.slug || '';

    const frontMatter = generateFrontMatter({
        title,
        slug,
        displayed_sidebar: displayedSidebar,
        token: node.token || node.obj_token,
    });

    let content = frontMatter + '\n\n' + patchedMdx;

    // Resolve internal links if a resolver is provided
    if (resolveLink) {
        const LarkUtils = require('./larkUtils');
        const utils = new LarkUtils({ resolveLink });
        content = await utils.resolveInternalLinks(content);
    }

    return content;
}

/**
 * Get drive-specific sidebar items.
 * Handles the folder/docx hierarchy differently than wiki.
 *
 * @param {Object} tree - Root drive folder node
 * @param {string} [contentRoot=''] - Path prefix
 * @returns {Array} - Docusaurus sidebar items
 */
function getDriveSidebarItems(tree, contentRoot = '') {
    const items = [];

    if (!tree || !tree.children) return items;

    for (const child of tree.children) {
        const childSlug = child.slug || child.name;
        if (!childSlug) continue;

        const childPath = contentRoot ? `${contentRoot}/${childSlug}` : childSlug;

        if (child.type === 'folder' && child.children && child.children.length > 0) {
            // Folder becomes a category
            const hasIndexDoc = child.children.some(c => c.type === 'docx' && c.name === child.name);

            const category = {
                type: 'category',
                label: child.name || childSlug,
                items: getDriveSidebarItems(child, childPath),
            };

            if (hasIndexDoc) {
                category.link = {
                    type: 'doc',
                    id: `${childPath}/index`,
                };
            }

            items.push(category);
        } else if (child.type === 'docx') {
            items.push({
                type: 'doc',
                id: childPath,
                label: child.name || childSlug,
            });
        }
    }

    return items;
}

module.exports = {
    convertDriveTree,
    convertDriveNode,
    convertDriveDoc,
    getDriveSidebarItems,
};
