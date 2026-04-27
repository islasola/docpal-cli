/**
 * MDX Patching Module
 * Ported from /Volumes/CaseSensitive/projects/zdoc/plugins/mdx-parse/mdxPatcher.js
 * Consolidates the duplicated escape logic from larkDocWriter.__mdx_patches.
 *
 * Compiles MDX through @mdx-js/mdx and iteratively fixes common errors
 * (unescaped JSX tags, dollar signs, malformed tags, math brace conflicts).
 */

// Known JSX block components that must never be backslash-escaped.
const KNOWN_JSX_TAGS = new Set([
    'Admonition', 'Tabs', 'TabItem', 'DocCard', 'DocCardList',
    'Details', 'CodeBlock', 'ThemedImage', 'TOCInline', 'Highlight',
    'Banner', 'Bars', 'Blocks', 'Cards', 'Grid', 'Hero', 'Procedures',
    'RestSpecs', 'Stories', 'Supademo',
]);

/**
 * Compile MDX through @mdx-js/mdx and iteratively fix common errors.
 * @param {string} mdxContent - Raw MDX string to validate/patch.
 * @param {Object} [options]
 * @param {number} [options.maxIterations=50] - Maximum fix-and-retry cycles.
 * @returns {Promise<{ content: string, valid: boolean, errors: string[] }>}
 */
async function patchMdx(mdxContent, options = {}) {
    const maxIterations = options.maxIterations || 50;
    const errors = [];

    try {
        const { compile } = await import('@mdx-js/mdx');
        const remarkMath = (await import('remark-math')).default;

        // Pre-processing pipeline
        let patched = removeTabsHallucinations(mdxContent);
        patched = unescapeKnownJsxTags(patched);
        patched = escapeMathBraces(patched);
        patched = escapeCurrencyDollars(patched);
        patched = escapeNonHtmlTags(patched);

        let iteration = 0;
        const seenHashes = new Set();

        while (iteration < maxIterations) {
            // Cycle detection via DJB33 hash
            let h = 5381;
            for (let i = 0; i < patched.length; i++) {
                h = Math.imul(h, 33) ^ patched.charCodeAt(i);
            }
            if (seenHashes.has(h)) {
                console.warn('Cycle detected in MDX patch loop, stopping');
                break;
            }
            seenHashes.add(h);

            try {
                await compile(patched, { development: false, remarkPlugins: [remarkMath] });
                return { content: patched, valid: true, errors: [] };
            } catch (error) {
                errors.push(`Iteration ${iteration + 1}: ${error.message}`);

                let madeChanges = false;
                const offset = error.place?.offset;

                switch (error.ruleId) {
                    case 'acorn':
                        if (offset !== undefined && offset > 0 && offset < patched.length) {
                            for (let i = offset - 1; i >= 0; i--) {
                                if (patched[i] === '{') {
                                    patched = patched.slice(0, i) + '\\' + patched.slice(i);
                                    madeChanges = true;
                                    break;
                                }
                            }
                        }
                        break;

                    case 'end-tag-mismatch': {
                        // Try to fix wrong closing tags
                        const msg = error.message || '';
                        const wrongCloseMatch = msg.match(/Expected a closing tag for `<(\w+)>`.*but got `<(\w+)>/);
                        if (wrongCloseMatch) {
                            const expected = wrongCloseMatch[1];
                            const actual = wrongCloseMatch[2];
                            patched = patched.replace(
                                new RegExp(`</${actual}>`, 'g'),
                                `</${expected}>`
                            );
                            madeChanges = true;
                        }
                        // If it's a missing closing tag, try to escape the orphaned opening tag
                        if (!madeChanges && offset !== undefined) {
                            for (let i = Math.min(offset, patched.length - 1); i >= Math.max(0, offset - 100); i--) {
                                if (patched[i] === '<' && i + 1 < patched.length) {
                                    const tagNameMatch = patched.slice(i).match(/^<([A-Za-z][A-Za-z0-9]*)[\s>/]/);
                                    if (tagNameMatch && !KNOWN_JSX_TAGS.has(tagNameMatch[1])) {
                                        patched = patched.slice(0, i) + '&lt;' + patched.slice(i + 1);
                                        madeChanges = true;
                                        break;
                                    }
                                }
                            }
                        }
                        break;
                    }

                    case 'unexpected-closing-slash': {
                        const slashOffset = error.place?.offset;
                        if (slashOffset !== undefined) {
                            let tagStart = slashOffset - 1;
                            while (tagStart > 0 && patched[tagStart] !== '<') tagStart--;
                            let tagEnd = slashOffset;
                            while (tagEnd < patched.length && patched[tagEnd] !== '>') tagEnd++;

                            if (patched[tagStart] === '<' && tagEnd < patched.length) {
                                const before = patched.slice(0, tagStart);
                                let after = patched.slice(tagEnd + 1);
                                if (after.startsWith('\n')) after = after.slice(1);
                                patched = before + after;
                                madeChanges = true;
                            }
                        }
                        break;
                    }

                    case 'unexpected-character': {
                        if (offset !== undefined && offset > 0) {
                            const msg = error.message || '';
                            if ((msg.includes('U+003D') || /U\+003[0-9]/.test(msg))) {
                                // = or digit after < — escape the <
                                for (let i = offset - 1; i >= Math.max(0, offset - 10); i--) {
                                    if (patched[i] === '<') {
                                        patched = patched.slice(0, i) + '&lt;' + patched.slice(i + 1);
                                        madeChanges = true;
                                        break;
                                    }
                                }
                            } else if (msg.includes('U+002C') || msg.includes('U+002A') || msg.includes('U+3001')) {
                                // Comma, asterisk, or ideographic comma — escape nearest <
                                for (let i = offset - 1; i >= 0; i--) {
                                    if (patched[i] === '<') {
                                        patched = patched.slice(0, i) + '\\' + patched.slice(i);
                                        madeChanges = true;
                                        break;
                                    }
                                }
                            }
                        }
                        break;
                    }

                    default:
                        break;
                }

                if (!madeChanges) break;
            }

            iteration++;
        }

        return { content: patched, valid: false, errors };
    } catch (error) {
        console.error('Failed to apply MDX patches:', error.message);
        return { content: mdxContent, valid: false, errors: [error.message] };
    }
}

/**
 * Remove hallucinated prose between </TabItem> and next <TabItem>/<\/Tabs>.
 */
function removeTabsHallucinations(content) {
    const lines = content.split('\n');
    const result = [];
    let tabsDepth = 0;
    let afterTabItemClose = false;
    let inCodeBlock = false;

    for (const line of lines) {
        const trimmed = line.trim();

        if (trimmed.startsWith('```') || trimmed.startsWith('~~~')) {
            inCodeBlock = !inCodeBlock;
        }

        if (!inCodeBlock) {
            if (/^<Tabs[\s>]/.test(trimmed)) tabsDepth++;
            if (/^<\/Tabs>/.test(trimmed)) tabsDepth = Math.max(0, tabsDepth - 1);

            if (tabsDepth > 0) {
                if (trimmed === '</TabItem>') {
                    afterTabItemClose = true;
                    result.push(line);
                    continue;
                }
                if (afterTabItemClose) {
                    if (/^<TabItem[\s>]/.test(trimmed) || /^<\/Tabs>/.test(trimmed)) {
                        afterTabItemClose = false;
                    } else if (trimmed !== '') {
                        continue; // hallucinated prose, discard
                    }
                }
            } else {
                afterTabItemClose = false;
            }
        }

        result.push(line);
    }

    return result.join('\n');
}

/**
 * Unescape known JSX block components (e.g., \<Tabs> → <Tabs>).
 */
function unescapeKnownJsxTags(content) {
    const names = [...KNOWN_JSX_TAGS].join('|');
    const pattern = new RegExp(`\\\\<(/?(?:${names})\\b)`, 'g');
    return content.replace(pattern, '<$1');
}

/**
 * Escape braces inside math blocks ($$...$$) to prevent MDX JSX expression parsing.
 * Math blocks use { and } for LaTeX commands like \frac{a}{b} which conflict with
 * MDX's JSX expression syntax {expression}.
 *
 * Ported from zdoc-redesign's mdxPatcher.escapeMathBraces().
 */
function escapeMathBraces(content) {
    const lines = content.split('\n');
    const result = [];
    let inMathBlock = false;
    let inCodeBlock = false;

    for (const line of lines) {
        const stripped = line.trim();

        // Track fenced code blocks
        if (stripped.startsWith('```') || stripped.startsWith('~~~')) {
            inCodeBlock = !inCodeBlock;
            result.push(line);
            continue;
        }

        if (inCodeBlock) {
            result.push(line);
            continue;
        }

        // Track display math blocks ($$...$$)
        if (stripped === '$$') {
            inMathBlock = !inMathBlock;
            result.push(line);
            continue;
        }

        if (inMathBlock) {
            // Inside math block: escape { and } to prevent MDX parsing
            let escaped = line.replace(/\{/g, '\\{').replace(/\}/g, '\\}');
            result.push(escaped);
            continue;
        }

        // Outside math/code: handle inline math $...$
        let processed = line;
        // Match inline $...$ (not $$)
        processed = processed.replace(/(?<!\$)\$(?!\$)((?:[^$\\]|\\.)*)\$(?!\$)/g, (match, mathContent) => {
            return '$' + mathContent.replace(/\{/g, '\\{').replace(/\}/g, '\\}') + '$';
        });

        result.push(processed);
    }

    return result.join('\n');
}

/**
 * Replace currency $<digit> with &#36;<digit> outside fenced code blocks
 * and inline code spans.
 */
function escapeCurrencyDollars(content) {
    const lines = content.split('\n');
    let inCodeBlock = false;
    const result = [];

    for (let line of lines) {
        const stripped = line.trim();
        if (stripped.startsWith('```') || stripped.startsWith('~~~')) {
            inCodeBlock = !inCodeBlock;
        }

        if (!inCodeBlock) {
            const parts = line.split(/(`+[^`]+`+)/);
            line = parts.map((part, i) => {
                if (i % 2 === 0) {
                    return part.replace(/\$(?=\d)/g, '&#36;');
                }
                return part;
            }).join('');
        }

        result.push(line);
    }

    return result.join('\n');
}

/**
 * Escape non-HTML lowercase tags and non-JSX PascalCase tags outside code blocks.
 */
function escapeNonHtmlTags(content) {
    const KNOWN_HTML_TAGS = new Set([
        'a', 'abbr', 'address', 'area', 'article', 'aside', 'audio',
        'b', 'base', 'bdi', 'bdo', 'blockquote', 'br', 'button',
        'canvas', 'caption', 'cite', 'code', 'col', 'colgroup',
        'data', 'datalist', 'dd', 'del', 'details', 'dfn', 'dialog', 'div', 'dl', 'dt',
        'em', 'embed',
        'fieldset', 'figcaption', 'figure', 'footer', 'form',
        'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'head', 'header', 'hr', 'html',
        'i', 'iframe', 'img', 'input', 'ins',
        'kbd',
        'label', 'legend', 'li', 'link',
        'main', 'map', 'mark', 'menu', 'meta', 'meter',
        'nav', 'noscript',
        'object', 'ol', 'optgroup', 'option', 'output',
        'p', 'picture', 'pre', 'progress',
        'q',
        'rp', 'rt', 'ruby',
        's', 'samp', 'script', 'section', 'select', 'slot', 'small', 'source', 'span',
        'strong', 'style', 'sub', 'summary', 'sup',
        'table', 'tbody', 'td', 'template', 'textarea', 'tfoot', 'th', 'thead',
        'time', 'title', 'tr', 'track',
        'u', 'ul',
        'var', 'video',
        'wbr',
        'include', 'exclude',
    ]);

    const safeUppercaseTags = new Set(KNOWN_JSX_TAGS);
    const upperScanRegex = /[<]([A-Z][A-Za-z0-9]*)/g;
    let upperMatch;
    while ((upperMatch = upperScanRegex.exec(content)) !== null) {
        const tn = upperMatch[1];
        if (safeUppercaseTags.has(tn)) continue;
        if (new RegExp(`<\\/${tn}>`).test(content) ||
            new RegExp(`<${tn}\\s*\\/>`).test(content) ||
            new RegExp(`<${tn}\\s+`).test(content)) {
            safeUppercaseTags.add(tn);
        }
    }

    const lines = content.split('\n');
    let inCodeBlock = false;
    const result = [];

    for (let line of lines) {
        const stripped = line.trim();
        if (stripped.startsWith('```') || stripped.startsWith('~~~')) {
            inCodeBlock = !inCodeBlock;
        }

        if (!inCodeBlock) {
            const parts = line.split(/(`+[^`]+`+)/);
            line = parts.map((part, i) => {
                if (i % 2 === 0) {
                    // Escape non-HTML lowercase placeholder tags
                    part = part.replace(/(?<!\\)<\/?([a-z][a-z0-9]*(?:[_-][a-z0-9]+)*)\s*\/?>/g, (match, tagName) => {
                        return KNOWN_HTML_TAGS.has(tagName) ? match : '\\' + match;
                    });
                    // Escape unknown PascalCase tags
                    part = part.replace(/(?<!\\)<\/?([A-Z][A-Za-z0-9]*)\s*\/?>/g, (match, tagName) => {
                        if (safeUppercaseTags.has(tagName)) return match;
                        return match.replace(/</g, '&lt;').replace(/>/g, '&gt;');
                    });
                    // Escape dotted PascalCase tags (e.g., <CreateCollectionReq.FieldSchema>)
                    part = part.replace(/\\?<\/?([A-Z][A-Za-z0-9]*(?:\.[A-Za-z][A-Za-z0-9]*)+)\s*\/?>/g, (match) => {
                        return match.replace(/^\\/, '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
                    });
                    return part;
                }
                return part;
            }).join('');
        }

        result.push(line);
    }

    return result.join('\n');
}

module.exports = {
    patchMdx,
    removeTabsHallucinations,
    unescapeKnownJsxTags,
    escapeMathBraces,
    escapeCurrencyDollars,
    escapeNonHtmlTags,
    KNOWN_JSX_TAGS,
};
