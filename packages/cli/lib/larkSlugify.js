/**
 * Heading slug utilities for CJK documents.
 *
 * When headings contain CJK characters, standard slugify produces empty slugs.
 * Instead of translating via API (unreliable), this module maps headings from
 * a source English document to generate correct URL slugs by positional match.
 */

const slugify = require('slugify');

// Heading block types: 3=heading1 through 11=heading9
const HEADING_MIN_TYPE = 3;
const HEADING_MAX_TYPE = 11;

/**
 * Check if a string contains Chinese characters (CJK Unified Ideographs).
 * @param {string} text
 * @returns {boolean}
 */
function containsChinese(text) {
    if (!text) return false;
    return /\p{Unified_Ideograph}/u.test(text);
}

/**
 * Walk all blocks in document order (depth-first) and extract heading slugs.
 * Returns an array of slug strings, indexed by heading occurrence order.
 *
 * @param {Object[]} blocks - Flat array of Lark blocks (same format as getAllBlocks returns)
 * @returns {string[]} - Array of heading slugs in document order
 */
function buildHeadingSlugMap(blocks) {
    const blockMap = new Map();
    for (const block of blocks) {
        if (block && block.block_id) {
            blockMap.set(block.block_id, block);
        }
    }

    const slugs = [];

    function walk(blockList) {
        for (const block of blockList) {
            if (!block) continue;
            const bt = block.block_type;

            if (bt >= HEADING_MIN_TYPE && bt <= HEADING_MAX_TYPE) {
                const level = bt - HEADING_MIN_TYPE + 1;
                const headingData = block[`heading${level}`];
                const text = extractHeadingText(headingData);
                if (text) {
                    slugs.push(slugify(text.split('|')[0].trim(), { lower: true, strict: true }));
                }
            }

            if (block.children && block.children.length > 0) {
                const childBlocks = block.children
                    .map(id => blockMap.get(id))
                    .filter(Boolean);
                walk(childBlocks);
            }
        }
    }

    const pageBlock = blocks.find(b => b.block_type === 1);
    if (pageBlock && pageBlock.children) {
        const topLevel = pageBlock.children.map(id => blockMap.get(id)).filter(Boolean);
        walk(topLevel);
    } else {
        walk(blocks);
    }

    return slugs;
}

/**
 * Get a slug for a heading, using the source-doc slug map if available,
 * otherwise falling back to standard slugify.
 *
 * @param {string} headingText - The rendered heading text content
 * @param {number} headingIndex - Current heading counter (0-based)
 * @param {string[]|null} slugMap - Array of slugs from source doc, or null
 * @returns {string} - The slug to use
 */
function getSlugForHeading(headingText, headingIndex, slugMap) {
    if (slugMap && headingIndex < slugMap.length && slugMap[headingIndex]) {
        return slugMap[headingIndex];
    }
    return slugify(headingText.split('|')[0].trim(), { lower: true, strict: true });
}

/**
 * Extract heading content from block heading elements.
 * @param {Object} headingObj - Heading block data (e.g., heading1, heading2)
 * @returns {string} - Plain text content
 */
function extractHeadingText(headingObj) {
    if (!headingObj || !headingObj.elements) return '';
    return headingObj.elements
        .filter(el => el.text_run)
        .map(el => el.text_run.content || '')
        .join('');
}

module.exports = {
    containsChinese,
    extractHeadingText,
    buildHeadingSlugMap,
    getSlugForHeading,
};
