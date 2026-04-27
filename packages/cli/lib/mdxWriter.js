/**
 * Core Lark block-to-MDX conversion engine.
 * Extracted from larkDocWriter.__markdown and all block converters.
 * Pure conversion function — no I/O, no network calls, no filesystem access.
 * Image handling is delegated via a resolveImage callback.
 * Domain-specific logic (link rewriting, endpoint replacement) removed.
 *
 * Source: /Volumes/CaseSensitive/projects/zdoc/plugins/lark-docs/larkDocWriter.js
 */

const slugify = require('slugify');
const showdown = require('showdown');
const { filterByTarget } = require('./targetFilter');
const { getSlugForHeading } = require('./larkSlugify');

// Block type lookup table (54 elements, index = block_type - 1)
const BLOCK_TYPES = [
    "page", "text", "heading1", "heading2", "heading3", "heading4",
    "heading5", "heading6", "heading7", "heading8", "heading9",
    "bullet", "ordered", "code", "quote", null,
    "todo", "bitable", "callout", "chat_card", "diagram",
    "divider", "file", "grid", "grid_column", "iframe",
    "image", "isv", "mindnote", "sheet", "table",
    "table_cell", "view", "quote_container", "task", "okr",
    "okr_objective", "okr_key_result", "okr_progress", "add_ons", "jira_issue",
    "wiki_catelog", "board", "agenda", "agenda_item", "agenda_item_title",
    "agenda_item_content", "link_preview", "source_synced", "reference_synced",
    "sub_page_list", "ai_template"
];

// Code language lookup table (76 elements, index = language code)
const CODE_LANGS = [
    null, "PlainText", "ABAP", "Ada", "Apache", "Apex", "Assembly",
    "Bash", "CSharp", "C++", "C", "COBOL", "CSS", "CoffeeScript",
    "D", "Dart", "Delphi", "Django", "Dockerfile", "Erlang", "Fortran",
    "FoxPro", "Go", "Groovy", "HTML", "HTMLBars", "HTTP", "Haskell",
    "JSON", "Java", "JavaScript", "Julia", "Kotlin", "LateX", "Lisp",
    "Logo", "Lua", "MATLAB", "Makefile", "Markdown", "Nginx",
    "Objective", "OpenEdgeABL", "PHP", "Perl", "PostScript", "Power",
    "Prolog", "ProtoBuf", "Python", "R", "RPG", "Ruby", "Rust",
    "SAS", "SCSS", "SQL", "Scala", "Scheme", "Scratch", "Shell",
    "Swift", "Thrift", "TypeScript", "VBScript", "Visual", "XML",
    "YAML", "CMake", "Diff", "Gherkin", "GraphQL",
    "OpenGL Shading Language", "Properties", "Solidity", "TOML",
];

/**
 * Convert Lark document blocks to MDX string.
 * @param {Object[]} blocks - Flat array of Lark blocks from larkDocClient.getBlocks()
 * @param {Object} options
 * @param {Function} [options.resolveImage] - async (fileToken, blockMeta) => string URL
 * @param {string}   [options.target] - Target name for <include>/<exclude> filtering
 * @param {boolean}  [options.docusaurusTabs=true] - Wrap adjacent code blocks in <Tabs>
 * @returns {Promise<string>} - MDX body content (no front matter)
 */
async function blocksToMdx(blocks, options = {}) {
    const {
        resolveImage = null,
        resolveLink = null,
        target = null,
        docusaurusTabs = true,
        headingSlugMap = null,
    } = options;

    // Build a block lookup map for resolving children by block_id
    const blockMap = new Map();
    for (const block of blocks) {
        if (block && block.block_id) {
            blockMap.set(block.block_id, block);
        }
    }

    const context = {
        blockMap,
        resolveImage,
        resolveLink,
        target,
        docusaurusTabs,
        iframes: [], // cache for processed iframes
        headingSlugMap,
        headingIndex: 0,
    };

    // Find top-level children of the page block
    const pageBlock = blocks.find(b => b.block_type === 1);
    let topLevelBlocks;
    if (pageBlock && pageBlock.children) {
        topLevelBlocks = pageBlock.children
            .map(id => blockMap.get(id))
            .filter(Boolean);
    } else {
        // If no page block, use all blocks that aren't children of others
        topLevelBlocks = blocks;
    }

    const title = pageBlock ? await renderTextElements(pageBlock.page?.elements || [], context) : '';
    const body = await renderBlocks(topLevelBlocks, 0, context);

    let mdx = '';
    if (title) {
        mdx += `# ${title}\n\n`;
    }
    mdx += body;

    // Apply target filtering
    if (target) {
        mdx = filterByTarget(mdx, target);
    }

    // Final cleanup
    return mdx
        .replace(/(\s*\n){3,}/g, '\n\n')
        .replace(/<br>/g, '<br/>')
        .replace(/(<br\/>){2,}/g, '<br/>')
        .replace(/<br\/><\/p>/g, '</p>')
        .replace(/\n\s*<tr>\n(\s*<td.*><p><\/p><\/td>\n)*\s*<\/tr>/g, '');
}

/**
 * Render an array of blocks to markdown.
 */
async function renderBlocks(blocks, indent, context) {
    const parts = [];
    const idt = ' '.repeat(indent);

    for (let idx = 0; idx < blocks.length; idx++) {
        const block = blocks[idx];
        if (!block) continue;

        const prev = idx > 0 ? blocks[idx - 1] : null;
        const next = idx < blocks.length - 1 ? blocks[idx + 1] : null;
        const typeName = BLOCK_TYPES[block.block_type - 1];

        let result;

        if (typeName === undefined) {
            result = '[Unsupported block type]';
        } else if (typeName === 'text') {
            let content = await renderTextElements(block.text?.elements || [], context);
            if (content.trim().indexOf('\n') > 0) {
                content = content.split('\n').map(line => idt + line).join('\n');
            } else {
                content = idt + content;
            }
            result = content;
        } else if (typeName && typeName.includes('heading')) {
            const level = parseInt(typeName.slice(-1));
            result = idt + await renderHeading(block[`heading${level}`], level, context);
        } else if (typeName === 'bullet') {
            result = await renderBullet(block, indent, context);
        } else if (typeName === 'ordered') {
            result = await renderOrdered(block, indent, context);
        } else if (typeName === 'code') {
            result = await renderCode(block.code, indent, prev, next, blocks, context);
        } else if (typeName === 'quote_container') {
            result = await renderQuote(block, indent, context);
        } else if (typeName === 'image') {
            result = idt + await renderImage(block.image, context);
        } else if (typeName === 'iframe') {
            result = idt + await renderIframe(block);
        } else if (typeName === 'table') {
            result = await renderTable(block.table, indent, context);
        } else if (typeName === 'sheet') {
            result = await renderSheet(block.sheet, indent, context);
        } else if (typeName === 'callout') {
            result = await renderCallout(block, indent, context);
        } else if (typeName === 'board') {
            result = await renderBoard(block.board, indent);
        } else if (typeName === 'grid') {
            result = await renderGrid(block, indent, context);
        } else if (typeName === 'add_ons') {
            if (block.add_ons?.component_type_id === 'blk_682093ba9580c002363b9dc3') {
                result = await renderSupademo(block.add_ons, indent);
            }
        } else if (typeName === 'source_synced') {
            result = await renderSourceSynced(block, indent, context);
        } else if (block.block_type === 999 && block.children) {
            const children = block.children.map(id => context.blockMap.get(id)).filter(Boolean);
            result = await renderBlocks(children, indent, context);
        }

        if (result !== undefined && result !== '') {
            parts.push(result);
        }
    }

    return parts.join('\n\n');
}

// --- Block Converters ---

async function renderHeading(heading, level, context) {
    if (!heading) return '';
    let content = await renderTextElements(heading.elements || [], context);
    content = cleanHeadings(content, context.target);

    if (content.length > 0) {
        if (content.indexOf('{#') < 0) {
            const slug = getSlugForHeading(content, context.headingIndex++, context.headingSlugMap);
            return '#'.repeat(level) + ' ' + content + '{#' + slug + '}';
        }
        return '#'.repeat(level) + ' ' + content;
    }
    return '';
}

function cleanHeadings(content, target) {
    if (target) {
        content = filterByTarget(content, target);
    }
    content = content.replace(/<\/?[^>]+(>|$)/g, '');
    return content.trim();
}

async function renderBullet(block, indent, context) {
    let children = '';
    if (block.children) {
        const childBlocks = block.children.map(id => context.blockMap.get(id)).filter(Boolean);
        children = await renderBlocks(childBlocks, indent + 4, context);
    }
    const content = await renderTextElements(block.bullet?.elements || [], context);
    return ' '.repeat(indent) + '- ' + content + '\n\n' + children;
}

async function renderOrdered(block, indent, context) {
    let children = '';
    if (block.children) {
        const childBlocks = block.children.map(id => context.blockMap.get(id)).filter(Boolean);
        children = await renderBlocks(childBlocks, indent + 4, context);
    }
    const content = await renderTextElements(block.ordered?.elements || [], context);
    return ' '.repeat(indent) + '1. ' + content + '\n\n' + children;
}

async function renderCode(code, indent, prev, next, blocks, context) {
    const validLangs = ['Python', 'JavaScript', 'Java', 'Go', 'Bash'];
    let lang = code.style?.language ? CODE_LANGS[code.style.language] : 'plaintext';

    let elements = (await Promise.all((code.elements || []).map(async x => {
        let content = await renderTextRun(x, code.elements, true, context);
        content = content.replaceAll('&#36;', '$');
        return content;
    }))).join('');

    if (lang === 'C++') return '';

    if (context.docusaurusTabs && validLangs.includes(lang)) {
        const prevType = prev ? BLOCK_TYPES[prev.block_type - 1] : null;
        const nextType = next ? BLOCK_TYPES[next.block_type - 1] : null;
        const prevLang = prev && prevType === 'code' && prev.code?.style?.language
            ? CODE_LANGS[prev.code.style.language] : null;
        const nextLang = next && nextType === 'code' && next.code?.style?.language
            ? CODE_LANGS[next.code.style.language] : null;

        // Determine position in tab group
        const hasPrevCode = prev && prevType === 'code' && validLangs.includes(prevLang) && prevLang !== lang;
        const hasNextCode = next && nextType === 'code' && validLangs.includes(nextLang) && nextLang !== lang;

        if (!hasPrevCode && hasNextCode) {
            // First block
            const values = collectTabValues(code, next, blocks, context);
            return codeBlockSplit(elements, indent, lang, 'first', values);
        }
        if (hasPrevCode && !hasNextCode) {
            // Last block
            return codeBlockSplit(elements, indent, lang, 'last');
        }
        if (hasPrevCode && hasNextCode) {
            // Middle block
            return codeBlockSplit(elements, indent, lang, 'middle');
        }
    }

    // Standalone code block (no tabs)
    return codeBlockSplit(elements, indent, lang);
}

function collectTabValues(code, next, blocks, context) {
    const values = [];
    let lang = code.style?.language ? CODE_LANGS[code.style.language] : 'plaintext';
    values.push({ label: getTabLabel(lang), value: lang.toLowerCase() });

    let current = next;
    while (current && BLOCK_TYPES[current.block_type - 1] === 'code' && current.code?.style?.language) {
        const currentLang = CODE_LANGS[current.code.style.language];
        values.push({ label: getTabLabel(currentLang), value: currentLang.toLowerCase() });
        const nextIdx = blocks.indexOf(current) + 1;
        current = blocks[nextIdx] || null;
    }

    return values;
}

function getTabLabel(lang) {
    switch (lang) {
        case 'JavaScript': return 'NodeJS';
        case 'Bash': return 'cURL';
        default: return lang;
    }
}

function codeBlockSplit(elements, indent, lang, position, values = null) {
    elements = elements.split('\n').map(line => line.replaceAll('`', '\\`'));
    const divider = elements.indexOf(elements.filter(x => x.match(/^[#\/]\/* ==*/))[0]);
    const tabItemStart = `${' '.repeat(indent)}<TabItem value='${lang.toLowerCase()}'>\n`;
    const tabItemEnd = `${' '.repeat(indent)}</TabItem>`;
    const tabsEnd = `${' '.repeat(indent)}</Tabs>`;

    if (divider === -1) {
        const codeContent = `${' '.repeat(indent)}\`\`\`${lang.toLowerCase()}\n${' '.repeat(indent) + elements.join('\n' + ' '.repeat(indent))}\n${' '.repeat(indent)}\`\`\`\n`;

        switch (position) {
            case 'first': {
                const tabsStart = `${' '.repeat(indent)}<Tabs groupId="code" defaultValue='${values[0].value}' values={${JSON.stringify(values)}}>`;
                return [tabsStart, tabItemStart, codeContent, tabItemEnd].join('\n');
            }
            case 'last':
                return [tabItemStart, codeContent, tabItemEnd, tabsEnd].join('\n');
            case 'middle':
                return [tabItemStart, codeContent, tabItemEnd].join('\n');
            default:
                return codeContent;
        }
    } else {
        // Split code block with divider
        const commentMark = lang === 'Python' || lang === 'Bash' ? '# ' : '// ';
        const half1 = elements.slice(0, divider);
        const half1Label = half1[0].replace(commentMark, '');
        const half2 = elements.slice(divider);
        const half2Label = half2[1].replace(commentMark, '');

        const langLower = lang.toLowerCase();
        const innerValues = [
            { label: half1Label, value: langLower },
            { label: half2Label, value: `${langLower}_1` }
        ];

        const innerTabsStart = `${' '.repeat(indent)}<Tabs groupId="${langLower}" defaultValue='${innerValues[0].value}' values={${JSON.stringify(innerValues)}}>`;
        const innerTabItemStart1 = `${' '.repeat(indent)}<TabItem value='${innerValues[0].value}'>\n`;
        const innerTabItemStart2 = `${' '.repeat(indent)}<TabItem value='${innerValues[1].value}'>\n`;
        const innerTabItemEnd = `${' '.repeat(indent)}</TabItem>`;
        const innerTabsEnd = `${' '.repeat(indent)}</Tabs>`;

        const half1Code = `${' '.repeat(indent)}\`\`\`${langLower}\n${' '.repeat(indent) + half1.slice(1).join('\n' + ' '.repeat(indent))}\n${' '.repeat(indent)}\`\`\`\n`;
        const half2Code = `${' '.repeat(indent)}\`\`\`${langLower}\n${' '.repeat(indent) + half2.slice(3).join('\n' + ' '.repeat(indent))}\n${' '.repeat(indent)}\`\`\`\n`;

        switch (position) {
            case 'first':
                return [`${' '.repeat(indent)}<Tabs groupId="code" defaultValue='${values[0].value}' values={${JSON.stringify(values)}}>`,
                    tabItemStart, innerTabsStart, innerTabItemStart1, half1Code, innerTabItemEnd,
                    innerTabItemStart2, half2Code, innerTabItemEnd, innerTabsEnd, tabItemEnd].join('\n');
            case 'last':
                return [tabItemStart, innerTabsStart, innerTabItemStart1, half1Code, innerTabItemEnd,
                    innerTabItemStart2, half2Code, innerTabItemEnd, innerTabsEnd, tabItemEnd, tabsEnd].join('\n');
            case 'middle':
                return [tabItemStart, innerTabsStart, innerTabItemStart1, half1Code, innerTabItemEnd,
                    innerTabItemStart2, half2Code, innerTabItemEnd, innerTabsEnd, tabItemEnd].join('\n');
            default:
                return [innerTabsStart, innerTabItemStart1, half1Code, innerTabItemEnd,
                    innerTabItemStart2, half2Code, innerTabItemEnd, innerTabsEnd].join('\n');
        }
    }
}

async function renderQuote(block, indent, context) {
    const childBlocks = (block.children || []).map(id => context.blockMap.get(id)).filter(Boolean);
    const res = (await renderBlocks(childBlocks, indent, context)).split('\n');

    let type = 'info Notes';
    const possibleTitles = ['Notes', 'Note', '说明', 'ノート', 'Warning', 'Warn', '警告'];
    const title = possibleTitles.find(x => res[0] && res[0].includes(x));

    if (title && ['Warning', 'Warn', '警告'].indexOf(title) === -1) {
        type = `info 📘 ${title}`;
    } else if (title) {
        type = `caution 🚧 ${title}`;
    }

    const admType = type.split(' ')[0];
    const admIcon = type.split(' ')[1];
    const admTitle = type.split(' ').slice(2).join(' ');
    const admOpen = `<Admonition type="${admType}" icon="${admIcon}" title="${admTitle}">`;

    const converter = new showdown.Converter();
    let html = converter.makeHtml(res.slice(1).map(line => line.replace(/^\s*/g, '')).join('\n'));
    html = showdownToMdxSafe(html);

    const raw = ' '.repeat(indent) + admOpen + '\n\n' +
        ' '.repeat(indent) + html.split('\n').join('\n' + ' '.repeat(indent)) +
        '\n\n' + ' '.repeat(indent) + '</Admonition>';
    return raw.replace(/(\s*\n){3,}/g, '\n\n');
}

async function renderCallout(block, indent, context) {
    const childBlocks = (block.children || []).map(id => context.blockMap.get(id)).filter(Boolean);
    let childrenMd = await renderBlocks(childBlocks, indent, context);
    if (context.target) {
        childrenMd = filterByTarget(childrenMd, context.target);
    }
    const children = childrenMd.split('\n');

    const emoji = block.callout?.emoji_id;
    let admType;
    switch (emoji) {
        case 'construction':
            admType = `<Admonition type="danger" icon="🚧" title="${(children[0] || '').trim()}">`;
            break;
        case 'blue_book':
        case 'notebook':
            admType = `<Admonition type="info" icon="📘" title="${(children[0] || '').trim()}">`;
            break;
        case 'light_bulb':
            admType = `<Admonition type="tip" icon="💡" title="${(children[0] || '').trim()}">`;
            break;
        case 'fire':
            admType = `<Admonition type="caution" icon="🔥" title="${(children[0] || '').trim()}">`;
            break;
        case 'warning':
            admType = `<Admonition type="warning" icon="⚠️" title="${(children[0] || '').trim()}">`;
            break;
        default:
            admType = `<Admonition type="info" icon="📘" title="${(children[0] || '').trim()}">`;
    }

    const converter = new showdown.Converter();
    let html = converter.makeHtml(children.slice(1).map(line => line.replace(/^\s*/g, '')).join('\n'));
    html = showdownToMdxSafe(html);

    const raw = ' '.repeat(indent) + admType + '\n\n' +
        ' '.repeat(indent) + html.split('\n').join('\n' + ' '.repeat(indent)) +
        '\n\n' + ' '.repeat(indent) + '</Admonition>';
    return raw.replace(/(\s*\n){3,}/g, '\n\n');
}

async function renderImage(image, context) {
    if (!image) return '';
    const caption = image.caption?.content ? image.caption.content.trim() : (image.token || 'image');
    const imageSlug = slugify(caption, { lower: true, strict: true });

    let imageUrl;
    if (context.resolveImage && image.token) {
        imageUrl = await context.resolveImage(image.token, { caption });
    } else {
        imageUrl = `/${imageSlug}.png`;
    }

    return `![${caption}](${imageUrl} "${caption}")`;
}

async function renderBoard(board, indent) {
    if (!board) return '';
    return ' '.repeat(indent) + `<!-- feishu-block: board, token: ${board.token} -->`;
}

async function renderIframe(block) {
    const iframe = block.iframe;
    if (!iframe) return '';

    // Only handle Figma-type embeds (iframe_type === 8)
    if (iframe.component?.iframe_type !== 8) return '';

    const url = iframe.component?.url;
    if (url) {
        return `<!-- feishu-block: iframe, type: 8, url: ${url} -->`;
    }
    return '';
}

async function renderTable(table, indent, context) {
    if (!table) return '';
    const converter = new showdown.Converter({ underline: true });
    const cells = table.cells || [];
    const cellBlocks = cells.map(cell => {
        const block = context.blockMap.get(cell);
        return block?.children || [];
    });

    const cellTexts = await Promise.all(cellBlocks.map(async (children) => {
        const childBlocks = children.map(id => context.blockMap.get(id)).filter(Boolean);
        return (await renderBlocks(childBlocks, 1, context)).replace(/\n/g, '<br/>');
    }));

    const rowSize = table.property?.row_size || 0;
    const columnSize = table.property?.column_size || 0;
    let mergeInfo = table.property?.merge_info || [];

    // Handle merged cells
    mergeInfo = mergeInfo.map((merge, idx) => {
        if (merge) {
            for (let i = 1; i < (merge.col_span || 1); i++) {
                mergeInfo[idx + i] = null;
            }
            for (let j = 1; j < (merge.row_span || 1); j++) {
                mergeInfo[idx + j * columnSize] = null;
            }
        }
        return merge;
    });

    let html = ' '.repeat(indent) + '<table>\n';
    for (let i = 0; i < rowSize; i++) {
        html += ' '.repeat(indent) + '   <tr>\n';
        for (let j = 0; j < columnSize; j++) {
            const cellIdx = i * columnSize + j;
            const merge = mergeInfo[cellIdx];
            if (merge) {
                const colspan = merge.col_span > 1 ? ` colspan="${merge.col_span}"` : '';
                const rowspan = merge.row_span > 1 ? ` rowspan="${merge.row_span}"` : '';
                let cellText = (context.target ? filterByTarget(cellTexts[cellIdx] || '', context.target) : cellTexts[cellIdx] || '')
                    .trim().replace(/^\n/, '').replace(/<br\/>/g, '\n\n');
                cellText = converter.makeHtml(cellText).replace(/\n/g, '').replace(/&amp;/g, '&').replace(/\*/g, '&ast;');

                if (i === 0) {
                    html += ` ${' '.repeat(indent)}    <th${colspan}${rowspan}>${cellText}</th>\n`;
                } else {
                    html += ` ${' '.repeat(indent)}    <td${colspan}${rowspan}>${cellText}</td>\n`;
                }
            }
        }
        html += ' '.repeat(indent) + '   </tr>\n';
    }
    html += ' '.repeat(indent) + '</table>\n';
    return html;
}

async function renderSheet(sheet, indent, context) {
    if (!sheet) return '';
    const converter = new showdown.Converter({ underline: true });
    const merges = sheet.meta?.data?.sheet?.merges;
    const values = sheet.values?.data?.valueRange?.values || [];
    let result = ' '.repeat(indent) + '<table>\n';

    values.forEach((row, ridx) => {
        result += ' '.repeat(indent) + '    <tr>\n';
        row.forEach((cell, cidx) => {
            let colspan = '';
            let rowspan = '';
            if (merges) {
                const match = merges.filter(m => m.start_row_index === ridx && m.start_column_index === cidx);
                if (match.length > 0) {
                    colspan = `colspan="${match[0].end_column_index - match[0].start_column_index + 1}"`;
                    rowspan = `rowspan="${match[0].end_row_index - match[0].start_row_index + 1}"`;
                }
            }

            let cellStr = typeof cell === 'string' ? cell
                : typeof cell === 'number' ? cell.toString()
                    : typeof cell === 'object' ? sheetCell(cell) : '';

            cellStr = cellStr.trim().replace(/<br>/g, '\n\n');
            const cellHtml = converter.makeHtml(cellStr).replace(/\n/g, '');

            if (ridx === 0) {
                result += `${' '.repeat(indent) + '    '.repeat(2)}<th${colspan ? ' ' + colspan : ''}${rowspan ? ' ' + rowspan : ''}>${cellHtml}</th>\n`;
            } else {
                result += `${' '.repeat(indent) + '    '.repeat(2)}<td${colspan ? ' ' + colspan : ''}${rowspan ? ' ' + rowspan : ''}>${cellHtml}</td>\n`;
            }
        });
        result += ' '.repeat(indent) + '    </tr>\n';
    });

    result += ' '.repeat(indent) + '</table>\n';
    return result.replace('"{', '"\\{');
}

function sheetCell(cell) {
    if (Array.isArray(cell)) {
        return cell.map(block => {
            if (block.type === 'text') return block.text;
            if (block.type === 'url') return `<a href="${block.link}">${block.text}</a>`;
            return '';
        }).join('');
    }
    return '';
}

async function renderSupademo(addons, indent) {
    const record = JSON.parse(addons.record || '{}');
    return ' '.repeat(indent) + `<!-- feishu-block: superdemo, id: ${record.id || ''}, isShowcase: ${record.isShowcase ? 'true' : 'false'} -->`;
}

async function renderSourceSynced(block, indent, context) {
    const childBlocks = (block.children || []).map(id => context.blockMap.get(id)).filter(Boolean);
    return await renderBlocks(childBlocks, indent, context);
}

async function renderGrid(block, indent, context) {
    const gridColumns = (block.children || []).map(id => context.blockMap.get(id)).filter(Boolean);
    const columnSize = block.grid?.column_size || gridColumns.length;
    const widthRatios = gridColumns.map(col => col.grid_column?.width_ratio || 1);

    const columnsContent = await Promise.all(
        gridColumns.map(async column => {
            const childBlocks = (column.children || []).map(id => context.blockMap.get(id)).filter(Boolean);
            let childMd = await renderBlocks(childBlocks, indent + 8, context);
            childMd = childMd.replace(/({#[0-9a-z-]+})/g, '\\$1');
            return `${' '.repeat(indent + 4)}<div>\n\n${' '.repeat(indent + 8)}${childMd.trim()}\n\n${' '.repeat(indent + 4)}</div>`;
        })
    );

    return (
        `${' '.repeat(indent)}<Grid columnSize="${columnSize}" widthRatios="${widthRatios.join(',')}">\n\n` +
        columnsContent.join('\n\n') +
        `\n\n${' '.repeat(indent)}</Grid>\n`
    );
}

// --- Text Element Renderers ---

async function renderTextElements(elements, context) {
    if (!elements || elements.length === 0) return '';
    let paragraph = '';
    for (const element of elements) {
        if (element.text_run) {
            paragraph += await renderTextRun(element, elements, false, context);
        }
        if (element.mention_doc) {
            paragraph += await renderMentionDoc(element, context);
        }
        if (element.equation) {
            paragraph += renderEquation(element, elements);
        }
    }
    return paragraph;
}

async function renderTextRun(element, elements, asis, context) {
    let content = element.text_run?.content || '';
    const style = element.text_run?.text_element_style || {};

    if (!content.match(/^\s+$/) && !asis) {
        content = content.replace(/\$/g, '&#36;').replace(/\*/g, '&ast;');

        if (style.inline_code) {
            content = applyStyleMarkdown(element, elements, 'inline_code', '`');
            content = content.replaceAll('&#36;', '$').replaceAll('&ast;', '*');
        }

        if (style.bold) {
            content = applyStyleMarkdown(element, elements, 'bold', '**');
        }

        if (style.italic) {
            content = applyStyleMarkdown(element, elements, 'italic', '*');
        }

        if (style.strikethrough) {
            content = applyStyleMarkdown(element, elements, 'strikethrough', '~~');
        }

        if ('link' in style && style.link) {
            let url = decodeURIComponent(style.link.url || '');

            // Try on-the-fly link resolution if a resolver is provided
            if (context.resolveLink) {
                try {
                    const resolved = await context.resolveLink(url);
                    if (resolved) url = resolved;
                } catch (err) {
                    // Keep original URL if resolution fails
                }
            }

            const prefix = [...content.matchAll(/(^\*\*|^\*|^~~)/g)];
            const suffix = [...content.matchAll(/(\*\*$|\*$|~~$)/g)];
            const p = prefix.length > 0 ? prefix[0][0] : '';
            const s = suffix.length > 0 ? suffix[0][0] : '';
            content = `${p}[${content.replace(p, '').replace(s, '')}](${url})${s}`;
        }
    }

    return content;
}

function applyStyleMarkdown(element, elements, styleName, decorator) {
    const elementType = element.equation ? 'equation' : 'text_run';
    const content = element[elementType]?.content || '';
    const style = element[elementType]?.text_element_style || {};

    const prev = elements[elements.indexOf(element) - 1] || null;
    const prevType = prev ? (prev.equation ? 'equation' : 'text_run') : null;
    const next = elements[elements.indexOf(element) + 1] || null;
    const nextType = next ? (next.equation ? 'equation' : 'text_run') : null;

    if (!content.match(/^\s+$/)) {
        const prevHasStyle = prev && prevType && prev[prevType]?.text_element_style?.[styleName];
        const nextHasStyle = next && nextType && next[nextType]?.text_element_style?.[styleName];

        // Single element
        if (!prevHasStyle && style[styleName] && !nextHasStyle) {
            const prefixSpaces = content.match(/^\s*/)?.[0] || '';
            const suffixSpaces = content.match(/\s*$/)?.[0] || '';
            return `${prefixSpaces}${decorator}${content.trim()}${decorator}${suffixSpaces}`;
        }

        // First element
        if (!prevHasStyle && style[styleName] && nextHasStyle) {
            const prefixSpaces = content.match(/^\s*/)?.[0] || '';
            return `${prefixSpaces}${decorator}${content.trimStart()}`;
        }

        // Last element
        if (prevHasStyle && style[styleName] && !nextHasStyle) {
            const suffixSpaces = content.match(/\s*$/)?.[0] || '';
            return `${content.trimEnd()}${decorator}${suffixSpaces}`;
        }
    }

    return content;
}

async function renderMentionDoc(element, context) {
    const title = element.mention_doc?.title || '';
    let url = decodeURIComponent(element.mention_doc?.url || '');

    // Try on-the-fly link resolution if a resolver is provided
    if (url && context.resolveLink) {
        try {
            const resolved = await context.resolveLink(url);
            if (resolved) url = resolved;
        } catch (err) {
            // Keep original URL if resolution fails
        }
    }

    if (url) {
        return `[${title}](${url})`;
    }
    return title;
}

function renderEquation(element, elements) {
    const content = element.equation?.content || '';
    if (!content) return '';

    const prev = elements[elements.indexOf(element) - 1] || null;
    const next = elements[elements.indexOf(element) + 1] || null;
    const prevType = prev ? (prev.equation ? 'equation' : 'text_run') : null;
    const nextType = next ? (next.equation ? 'equation' : 'text_run') : null;

    // Standalone block equation
    if (!prev && !next) {
        return `$$\n${content.trim()}\n$$\n`;
    }

    // Inline equation
    if ((!prev || prevType === 'text_run') && (!next || nextType === 'text_run')) {
        return `$${content.trim()}$`;
    }

    return content;
}

// --- Utility ---

function showdownToMdxSafe(html) {
    // Escape { and } outside code/pre spans
    const parts = html.split(/(<(?:code|pre)(?:\s[^>]*)?>[\s\S]*?<\/(?:code|pre)>)/g);
    html = parts.map((part, i) => {
        if (i % 2 === 0) {
            return part.replace(/\{/g, '\\{').replace(/\}/g, '\\}');
        }
        return part;
    }).join('');

    // Convert <pre><code> to fenced code blocks
    html = html.replace(/<pre><code(?:\s+class="([^"]*)")?>([\s\S]*?)<\/code><\/pre>/g, (match, classAttr, code) => {
        let lang = '';
        if (classAttr) {
            const langMatch = classAttr.match(/(?:^|\s)language-(\S+)/);
            lang = langMatch ? langMatch[1] : (classAttr.split(/\s+/)[0] || '');
        }
        const decoded = code.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"');
        return '\n```' + lang + '\n' + decoded.replace(/^\n|\n$/g, '') + '\n```\n';
    });

    return html;
}

module.exports = {
    blocksToMdx,
    BLOCK_TYPES,
    CODE_LANGS,
    // Exported for testing
    _renderTextElements: renderTextElements,
    _renderHeading: renderHeading,
    _renderBullet: renderBullet,
    _renderCode: renderCode,
    _renderTable: renderTable,
    _renderImage: renderImage,
    _renderCallout: renderCallout,
    _renderQuote: renderQuote,
    _renderGrid: renderGrid,
    _renderMentionDoc: renderMentionDoc,
    _showdownToMdxSafe: showdownToMdxSafe,
    _applyStyleMarkdown: applyStyleMarkdown,
    _renderEquation: renderEquation,
    _codeBlockSplit: codeBlockSplit,
};
