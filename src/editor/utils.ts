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

export class TwoWayMap<K, V> {
    private kv = new Map<K, V>();
    private vk = new Map<V, K>();

    clear(): void {
        this.kv.clear();
        this.vk.clear();
    }

    deleteK(k: K): boolean {
        const v = this.kv.get(k);
        if (this.kv.delete(k)) {
            this.vk.delete(v!);
            return true;
        }
        return false;
    }

    deleteV(v: V): boolean {
        const k = this.vk.get(v);
        if (this.vk.delete(v)) {
            this.kv.delete(k!);
            return true;
        }
        return false;
    }

    getV(k: K): V | undefined {
        return this.kv.get(k);
    }

    getK(v: V): K | undefined {
        return this.vk.get(v);
    }

    set(key: K, value: V): this {
        this.kv.set(key, value);
        this.vk.set(value, key);
        return this;
    }
}

/**
 * Identify the change the user made based on difference in strings and cursor position.
 * @param lastValue original string before modification
 * @param lastCursor last cursor position
 * @param currentValue new string after modification
 * @param currentCursor new cursor position
 * @returns An object describing the change that occurred
 */
export function singleDiffWithCursor(lastValue: string, lastCursor: number, currentValue: string, currentCursor: number) {
    const currentValueLen = currentValue.length;
    const lastValueLen = lastValue.length;

    const maxStartMatch = Math.min(lastCursor, currentCursor);

    // match up to first cursor location
    let i: number;
    for (i = 0; i < maxStartMatch; i++) {
        if (currentValue[i] !== lastValue[i]) {
            break;
        }
    }

    // remove matching front and back characters
    const maxBackwardSearch = Math.min(currentValueLen, lastValueLen) - i;
    let j: number = 1;
    for (j = 1; j <= maxBackwardSearch; j++) {
        if (currentValue[currentValueLen - j] !== lastValue[lastValueLen - j]) {
            break;
        }
    }

    const maxLength = Math.min(lastValueLen, currentValueLen) - j;
    for (; i <= maxLength; i++) {
        if (currentValue[i] !== lastValue[i]) {
            break;
        }
    }

    // identify when no changes occur
    if (currentValueLen == lastValueLen && i > currentValueLen - j) {
        return null;
    }

    if (j <= 1) {
        return {
            index: i,
            added: currentValue.slice(i),
            removed: lastValue.slice(i)
        };
    } else {
        return {
            index: i,
            added: currentValue.slice(i, 1 - j),
            removed: lastValue.slice(i, 1 - j)
        };
    }
}
