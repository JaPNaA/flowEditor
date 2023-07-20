export function isAncestor(child: Node | null, ancestor: Node): boolean {
    let curr = child;
    while (curr) {
        if (curr === ancestor) { return true; }
        curr = curr.parentNode;
    }
    return false;
}

export function getAncestorWhich(child: Node | null, test: (node: Node) => boolean): Node | null {
    let curr = child;
    while (curr) {
        if (test(curr)) { return curr; }
        curr = curr.parentNode;
    }
    return null;
}

export function download(blob: Blob, name: string) {
    const a = document.createElement("a");
    const url = URL.createObjectURL(blob);
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

export async function requestFile() {
    const input = document.createElement("input");
    input.type = "file";
    document.body.appendChild(input);
    input.click();
    document.body.removeChild(input);
    return new Promise<File>((res, rej) => {
        input.addEventListener("change", () => {
            const files = input.files;
            if (!files) { rej(); return; }
            res(files[0])
        });
    });
}

export function stringToBlob(string: string) {
    return new Blob([string], { type: "plain/text" });
}

/**
 * Loosely checks if a string starts with another string
 * @see https://github.com/JaPNaA/JaPNaA.github.io/blob/source/src/utils/looseStartsWith.ts
 * @param start Check the string starts with
 * @param str The string to check with
 * @returns score - larger is worse, -1 means it doesn't match
 */
export function looseStartsWith(start: string, str: string): number {
    const strLength = str.length;
    const startLower = start.toLowerCase();
    const strLower = str.toLowerCase();
    let currStrIndex = 0;
    let skipped = 0;

    outer: for (const char of startLower) {
        for (; currStrIndex < strLength;) {
            if (strLower[currStrIndex] === char) {
                currStrIndex++;
                continue outer;
            } else {
                skipped++;
                currStrIndex++;
            }
        }

        return -1;
    }

    return skipped;
}

export function sortAndFilterByLooseStart(start: string, strs: string[]): string[] {
    const suggestions: [string, number][] = [];
    for (const str of strs) {
        const score = looseStartsWith(start, str);
        if (score >= 0) {
            suggestions.push([str, score]);
        }
    }
    return suggestions.sort((a, b) => a[1] - b[1]).map(x => x[0]);
}
