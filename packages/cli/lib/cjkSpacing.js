'use strict';

const CJK_RANGE = /[一-鿿㐀-䶿　-〿＀-￯가-힯]/;
const CJK_PUNCT = /[　-〿＀-￯‘’“”、。，．；：—…《》]/;
const NON_CJK = /[a-zA-Z0-9#$%&@~`^|<>{}=+_[\]\\/]/;

function insertCjkSpacing(text) {
    const segments = [];
    let i = 0;
    while (i < text.length) {
        if (text.startsWith('```', i)) {
            const end = text.indexOf('```', i + 3);
            if (end !== -1) {
                segments.push(text.slice(i, end + 3));
                i = end + 3;
                continue;
            }
        }
        if (text[i] === '`') {
            const end = text.indexOf('`', i + 1);
            if (end !== -1) {
                segments.push(text.slice(i, end + 1));
                i = end + 1;
                continue;
            }
        }
        if (text[i] === '<') {
            const end = text.indexOf('>', i);
            if (end !== -1) {
                segments.push(text.slice(i, end + 1));
                i = end + 1;
                continue;
            }
        }
        if (text[i] === ']' && text[i + 1] === '(') {
            const end = text.indexOf(')', i + 2);
            if (end !== -1) {
                segments.push(text.slice(i, end + 1));
                i = end + 1;
                continue;
            }
        }

        const ch = text[i];
        const isCjk = CJK_RANGE.test(ch);
        const isCjkPunct = CJK_PUNCT.test(ch);
        const isNonCjk = NON_CJK.test(ch);

        if (isCjk && !isCjkPunct && i + 1 < text.length) {
            const next = text[i + 1];
            if (NON_CJK.test(next)) {
                segments.push(ch + ' ');
                i++;
                continue;
            }
        }

        if (isNonCjk && i + 1 < text.length) {
            const next = text[i + 1];
            if (CJK_RANGE.test(next) && !CJK_PUNCT.test(next)) {
                segments.push(ch + ' ');
                i++;
                continue;
            }
        }

        segments.push(ch);
        i++;
    }
    return segments.join('');
}

module.exports = { insertCjkSpacing };
