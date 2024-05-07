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

/**
 * Given the areas and a change the user has made to a line, finds the new
 * values editables should take.
 * 
 * Note: assumes
 *   - noneditable regions are all or nothing. That is, no partial
 *     noneditable regions appear in currentValue.
 *   - OR there is only one partial noneditable region.
 * 
 * @param areas A list of areas -- strings represent parts of the string the
 * user cannot modify. Objects represent editable regions. Areas MUST contain
 * strings and editables in alternating order -- there must never be two
 * strings or two editables in a row.
 * @param lastValue Old string
 * @param lastCursor Previous cursor position (leftmost index if is a range)
 * @param currentValue New string
 * @param currentCursor New cursor position (leftmost index if is a range)
 * @returns A list of values for each editable as specified in areas.
 * Additionally, if any nonEditable regions were detected to be changed.
 */
export function findEditableValuesInChangedString(
    areas: (string | { getValue(): string })[],
    lastValue: string, lastCursor: number,
    currentValue: string, currentCursor: number
): { values: string[], changedNonEditable: boolean } {
    const diff = singleDiffWithCursor(lastValue, lastCursor, currentValue, currentCursor);
    const values: string[] = [];
    let changedNonEditable = false;

    // case: no differences
    if (!diff) {
        for (const area of areas) {
            if (typeof area !== 'string') {
                values.push(area.getValue());
            }
        }
        return { values, changedNonEditable };
    }

    // phase: before change
    let charIndex = 0;
    let areaIndex = 0;
    for (const area of areas) {
        if (typeof area === 'string') {
            if (charIndex + area.length <= diff.index) {
                charIndex += area.length;
            } else {
                break;
            }
        } else {
            const val = area.getValue();
            if (charIndex + val.length <= diff.index) {
                values.push(val);
                charIndex += val.length;
            } else {
                break;
            }
        }
        areaIndex++;
    }

    const endModifiedIndex = diff.index + diff.added.length;

    // determine index of last area that's outside modified region
    let lastUnmodifiedAreaCharIndex = currentValue.length;
    let lastUnmodifiedArea = areas.length;
    for (let i = areas.length - 1; i >= 0; i--) {
        const area = areas[i];
        let areaLen;
        if (typeof area === 'string') {
            areaLen = area.length;
            if (lastUnmodifiedAreaCharIndex - areaLen < endModifiedIndex) {
                break;
            }
        } else {
            areaLen = area.getValue().length;
            if (lastUnmodifiedAreaCharIndex - areaLen <= endModifiedIndex) {
                break;
            }
        }
        lastUnmodifiedAreaCharIndex -= areaLen;
        lastUnmodifiedArea = i;
    }

    let unaccountedDeltaLength = -diff.removed.length + diff.added.length;

    // phase: changed part
    while (charIndex <= endModifiedIndex && areaIndex < lastUnmodifiedArea) {
        const area = areas[areaIndex];

        if (typeof area === 'string') {
            const areaPosition = currentValue.indexOf(area, charIndex);
            if (areaPosition >= 0 && areaPosition < lastUnmodifiedAreaCharIndex) {
                if (values.length > 0) {
                    values[values.length - 1] += currentValue.slice(charIndex, areaPosition);
                    unaccountedDeltaLength += areaPosition - charIndex;
                } else {
                    changedNonEditable = true;
                }
                charIndex = areaPosition + area.length;
            } else {
                if (area.length + unaccountedDeltaLength < 0) {
                    unaccountedDeltaLength += area.length;
                } else {
                    charIndex += area.length + unaccountedDeltaLength;
                    unaccountedDeltaLength = 0;
                }
                changedNonEditable = true;
            }
            areaIndex++;
        } else { // area is editable
            if (areaIndex + 1 < lastUnmodifiedArea) { // has next area
                values.push("");
                unaccountedDeltaLength -= area.getValue().length;
                areaIndex++;
            } else { // ending editable
                values.push(currentValue.slice(charIndex, lastUnmodifiedAreaCharIndex));
                charIndex = lastUnmodifiedAreaCharIndex;
                areaIndex++;
            }
        }
    }

    if (values.length > 0 && typeof areas[areaIndex - 1] !== 'string') {
        values[values.length - 1] += currentValue.slice(charIndex, lastUnmodifiedAreaCharIndex);
    } else if (charIndex !== lastUnmodifiedAreaCharIndex) {
        changedNonEditable = true;
    }

    // phase: after change
    for (; areaIndex < areas.length; areaIndex++) {
        const area = areas[areaIndex];
        if (typeof area !== 'string') {
            values.push(area.getValue());
        }
    }

    return { values, changedNonEditable };
}