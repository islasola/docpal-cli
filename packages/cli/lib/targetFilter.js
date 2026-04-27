/**
 * Target-based content filtering for MDX output.
 * Processes <include target="..."> and <exclude target="..."> tags
 * to conditionally include/exclude content sections based on target.
 *
 * Extracted from larkDocWriter.__filter_content and __match_filter_tags.
 */

/**
 * Filter content based on <include>/<exclude> target tags.
 * @param {string} content - MDX or markdown content with target tags.
 * @param {string} target - The current target name (e.g., "milvus-docs").
 * @returns {string} - Content with non-matching blocks removed.
 */
function filterByTarget(content, target) {
    if (!content || !target) return content;

    const matches = matchFilterTags(content);

    if (matches.length > 0) {
        const preText = content.slice(0, matches[0].startIndex);
        const matchText = content.slice(matches[0].startIndex, matches[0].endIndex);
        const postText = content.slice(matches[0].endIndex);
        const isTargetValid = target.split('.').includes(matches[0].target.trim());
        const startTagLength = `<${matches[0].tag} target="${matches[0].target}">`.length;
        const endTagLength = `</${matches[0].tag}>`.length;

        let newMatchText = matchText;

        if ((matches[0].tag === 'include' && isTargetValid) ||
            (matches[0].tag === 'exclude' && !isTargetValid)) {
            // Keep content, strip tags
            newMatchText = matchText.slice(startTagLength, -endTagLength);
        }

        if ((matches[0].tag === 'include' && !isTargetValid) ||
            (matches[0].tag === 'exclude' && isTargetValid)) {
            // Remove everything
            newMatchText = '';
        }

        return filterByTarget(preText + newMatchText + postText, target);
    }

    // Final cleanup
    return content
        .replace(/(\s*\n){3,}/g, '\n\n')
        .replace(/<br>/g, '<br/>')
        .replace(/(<br\/>){2,}/, '<br/>')
        .replace(/<br\/><\/p>/, '</p>')
        .replace(/\n\s*<tr>\n(\s*<td.*><p><\/p><\/td>\n)*\s*<\/tr>/g, '');
}

/**
 * Find all <include>/<exclude> tags with their positions.
 * @param {string} content
 * @returns {Array<{tag: string, target: string, startIndex: number, endIndex: number}>}
 */
function matchFilterTags(content) {
    const startTagRegex = /<(include|exclude) target="(.+?)"/gmi;
    const endTagRegex = /<\/(include|exclude)>/gmi;
    const matches = [...content.matchAll(startTagRegex)];
    const results = [];

    for (const match of matches) {
        const tag = match[1].toLowerCase();
        const target = match[2].trim();
        const rest = content.slice(match.index);

        const closeTagRegex = new RegExp(`</${tag}>`, 'gmi');
        const closeTagMatch = [...rest.matchAll(closeTagRegex)];

        const startIndex = match.index;
        let endIndex = -1;

        for (let i = 0; i < closeTagMatch.length; i++) {
            const t = content.slice(startIndex, startIndex + closeTagMatch[i].index + closeTagMatch[i][0].length);
            const startCount = t.match(startTagRegex) ? t.match(startTagRegex).length : 0;
            const endCount = t.match(endTagRegex) ? t.match(endTagRegex).length : 0;

            if (startCount === endCount) {
                endIndex = startIndex + closeTagMatch[i].index + closeTagMatch[i][0].length;
                break;
            }
        }

        if (endIndex === -1) {
            console.warn(`No matching end tag for ${tag} tag at index ${match.index}`);
        }

        results.push({ tag, target, startIndex, endIndex });
    }

    return results;
}

module.exports = { filterByTarget, matchFilterTags };
