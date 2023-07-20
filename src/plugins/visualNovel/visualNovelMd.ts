const headingRegex = /^\s*(#{1,6})\s*(.+)$/mg;
const underscoreBoldRegex = /(^|\W)__([^\s](?:[^]*?[^\s])??)__(?=$|\W)/g;
const asteriskBoldRegex = /\*\*([^\s*](?:[^]*?[^\s*])?)\*\*/g;
const underscoreItalicRegex = /(^|\W)_([^\s](?:[^]*?[^\s])??)_(?=$|\W)/g;
const asteriskItalicRegex = /\*([^\s*](?:[^]*?[^\s*])?)\*/g;
const tagRegex = /&lt;([^<>&;]+?)&gt;([^]+?)&lt;\/\1&gt;/g;
const variableRegex = /{(.+?)}/g;

export function visualNovelMdToHTML(richText: string, getVariable?: (v: string) => string | undefined) {
    const preVariableText = _sanitizeHTML(richText)
        .replace(headingRegex, '<span class="volume" level="$1">$2</span>')
        .replace(underscoreBoldRegex, '$1<b>$2</b>')
        .replace(asteriskBoldRegex, '<b>$1</b>')
        .replace(underscoreItalicRegex, '$1<i>$2</i>')
        .replace(asteriskItalicRegex, '<i>$1</i>')
        .replace(tagRegex, '<span class="tag" tag="$1">$2</span>')
    if (getVariable) {
        return wrapInVisualNovelMd(replaceVariables(preVariableText, getVariable));
    } else {
        return wrapInVisualNovelMd(preVariableText);
    }
}

export function replaceVariables(text: string, getVariable: (v: string) => string | undefined) {
    return text.replace(variableRegex, (fullStr, varname) => {
        return getVariable(varname) || fullStr;
    });
}

function wrapInVisualNovelMd(text: string) {
    return '<span class="visualNovelMD">' + text + "</span>";
}

function _sanitizeHTML(text: string): string {
    return text.replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
}
