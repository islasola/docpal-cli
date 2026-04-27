/**
 * Docusaurus YAML front matter generation.
 * Extracted from larkDocWriter.__front_matters.
 * Domain-agnostic: no sidebar prefix logic, no title suffix appending.
 */

const yaml = require('js-yaml');

/**
 * Generate Docusaurus YAML front matter string.
 * @param {Object} params
 * @param {string} params.title - Document title.
 * @param {string} [params.slug] - URL slug (defaults to slugified title).
 * @param {string} [params.description] - Page description for meta.
 * @param {string[]} [params.keywords] - Keywords for SEO.
 * @param {string[]} [params.tags] - Tags array.
 * @param {number}  [params.sidebar_position] - Sidebar ordering.
 * @param {string}  [params.sidebar_label] - Sidebar display label override.
 * @param {string}  [params.displayed_sidebar] - Docusaurus sidebar key.
 * @param {boolean} [params.beta] - Beta flag.
 * @param {boolean} [params.notebook] - Notebook flag.
 * @param {string}  [params.added_since] - Version when added.
 * @param {string}  [params.deprecated_since] - Version when deprecated.
 * @param {string}  [params.type] - Doc type (Doc, API Ref, FAQ, Blog).
 * @param {string}  [params.token] - Feishu doc token.
 * @param {boolean} [params.hide_title] - Hide title in page.
 * @param {boolean} [params.hide_table_of_contents] - Hide TOC.
 * @param {Object}  [params.custom] - Additional key-value pairs for front matter.
 * @returns {string} - Complete front matter block including --- delimiters.
 */
function generateFrontMatter(params = {}) {
    const {
        title = '',
        slug,
        description,
        keywords,
        tags,
        sidebar_position,
        sidebar_label,
        displayed_sidebar,
        beta,
        notebook,
        added_since,
        deprecated_since,
        type,
        token,
        hide_title,
        hide_table_of_contents,
        custom
    } = params;

    const fm = {};

    if (title) fm.title = title;
    if (slug) fm.slug = `/${slug}`;
    if (sidebar_label) fm.sidebar_label = sidebar_label;
    if (sidebar_position !== undefined && sidebar_position !== null) {
        fm.sidebar_position = Number(sidebar_position);
    }
    if (displayed_sidebar) fm.displayed_sidebar = displayed_sidebar;

    // Boolean flags
    if (beta) fm.beta = true;
    if (notebook) fm.notebook = true;
    if (hide_title) fm.hide_title = true;
    if (hide_table_of_contents) fm.hide_table_of_contents = true;

    // Version tracking
    if (added_since) fm.added_since = added_since;
    if (deprecated_since) fm.deprecated_since = deprecated_since;

    // Description
    if (description) {
        fm.description = sanitizeDescription(description);
    }

    // Type and token
    if (type) fm.type = type;
    if (token) fm.token = token;

    // Keywords
    if (keywords && keywords.length > 0) {
        fm.keywords = keywords;
    }

    // Tags
    if (tags && tags.length > 0) {
        fm.tags = tags;
    }

    // Custom props
    if (custom && typeof custom === 'object') {
        Object.assign(fm, custom);
    }

    return '---\n' + yaml.dump(fm, { lineWidth: -1, noRefs: true }).trim() + '\n---';
}

/**
 * Sanitize description for YAML: strip HTML, collapse whitespace.
 */
function sanitizeDescription(text) {
    if (!text) return text;
    return text
        .trim()
        .replace(/\n/g, ' ')
        .replace(/\[(.*?)\]\(.*?\)/g, '$1')
        .replace(/<\/?[^>]+>/g, '')
        .replace(/"/g, '\\"')
        .replace(/\*+|_+/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

module.exports = { generateFrontMatter, sanitizeDescription };
