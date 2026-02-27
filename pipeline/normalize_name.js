#!/usr/bin/env node
/**
 * pipeline/normalize_name.js — Restaurant name normalization utility
 *
 * Produces canonical format: "[Chinese name] [English name]"
 * where English part is title-cased and comes from Google Places.
 *
 * Examples:
 *   麻辣诱惑 + "Chongqing Xiaomian"      → "麻辣诱惑 Chongqing Xiaomian"
 *   "Z & Y Restaurant (御食园川菜馆)" + "Z & Y Restaurant"  → "御食园川菜馆 Z & Y Restaurant"
 *   "Ming's tasty 名味阁" + "名味阁 Ming's Tasty"           → "名味阁 Ming's Tasty"
 *   "Jun Bistro" + "Jun Bistro"           → "Jun Bistro"
 *   "pho ha noi" + "Pho Ha Noi"           → "Pho Ha Noi"
 *   某餐厅 + 某餐厅                        → "某餐厅"
 */

'use strict';

// Chinese Unicode ranges: CJK unified ideographs + extensions + common punctuation
const CJK_RE = /[\u4e00-\u9fff\u3400-\u4dbf\u{20000}-\u{2a6df}\u{2a700}-\u{2b73f}\uff00-\uffef\u3000-\u303f]/gu;

/**
 * Returns true if str contains any Chinese characters.
 */
function hasChinese(str) {
    if (!str) return false;
    return /[\u4e00-\u9fff\u3400-\u4dbf\uff00-\uffef\u3000-\u303f]/u.test(str);
}

/**
 * Extracts only Chinese characters (and common Chinese punctuation) from a string.
 * e.g. "Z & Y Restaurant (御食园川菜馆)" → "御食园川菜馆"
 */
function extractChinese(str) {
    if (!str) return '';
    const matches = str.match(CJK_RE);
    return matches ? matches.join('') : '';
}

/**
 * Title-cases each whitespace-separated word (first char only).
 * e.g. "pho ha noi" → "Pho Ha Noi"
 * Preserves existing uppercase and does NOT capitalize after apostrophes.
 * e.g. "Ming's tasty" → "Ming's Tasty"  (not "Ming'S Tasty")
 */
function toTitleCase(str) {
    if (!str) return '';
    return str.trim().split(/\s+/).map(word =>
        word ? word.charAt(0).toUpperCase() + word.slice(1) : word
    ).join(' ');
}

/**
 * Strips Chinese characters and surrounding parentheses/brackets, then trims.
 * e.g. "Z & Y Restaurant (御食园川菜馆)" → "Z & Y Restaurant"
 * e.g. "名味阁 Ming's Tasty" → "Ming's Tasty"
 */
function extractEnglish(str) {
    if (!str) return '';
    // Remove content in parens/brackets if it contains only Chinese
    let result = str.replace(/[\(\[（【][^\)\]）】]*[\)\]）】]/g, match => {
        // Only remove if the bracket content is purely Chinese (no significant English)
        const inner = match.slice(1, -1);
        return hasChinese(inner) && extractChinese(inner) === inner.replace(/\s/g, '') ? '' : match;
    });
    // Remove all Chinese chars
    result = result.replace(CJK_RE, '');
    // Collapse multiple spaces
    result = result.replace(/\s+/g, ' ').trim();
    return result;
}

/**
 * Normalizes a restaurant name to canonical "[Chinese] [English]" format.
 *
 * Priority:
 * 1. Extract Chinese from xhsName
 * 2. Determine English:
 *    - googleName has no Chinese → toTitleCase(googleName)
 *    - googleName is mixed → toTitleCase(extractEnglish(googleName))
 *    - googleName is Chinese-only → toTitleCase(extractEnglish(xhsName))
 * 3. Compose:
 *    - Chinese + English → "${chinese} ${english}"
 *    - Chinese only → chinese
 *    - No Chinese → toTitleCase(googleName || xhsName)
 *
 * @param {string} xhsName - Original name from XHS post extraction
 * @param {string} googleName - Name from Google Places API (may be undefined)
 * @returns {string} Normalized restaurant name
 */
function normalizeRestaurantName(xhsName, googleName) {
    const xhs = (xhsName || '').trim();
    const google = (googleName || '').trim();

    const chinesePart = extractChinese(xhs);

    // Determine English part
    let englishPart = '';
    if (google) {
        if (!hasChinese(google)) {
            // Google name is purely English
            englishPart = toTitleCase(google);
        } else if (hasChinese(google) && extractEnglish(google).length > 0) {
            // Google name is mixed (has both Chinese and English)
            englishPart = toTitleCase(extractEnglish(google));
        } else {
            // Google name is Chinese-only → fall back to English from xhsName
            englishPart = toTitleCase(extractEnglish(xhs));
        }
    } else {
        // No googleName → fall back to English from xhsName
        englishPart = toTitleCase(extractEnglish(xhs));
    }

    // Compose result
    if (chinesePart && englishPart) {
        return `${chinesePart} ${englishPart}`;
    } else if (chinesePart) {
        return chinesePart;
    } else {
        // No Chinese characters at all
        return toTitleCase(google || xhs);
    }
}

module.exports = { normalizeRestaurantName, extractChinese, extractEnglish, toTitleCase, hasChinese };
