import { TwoWayMap, singleDiffWithCursor } from "./utils";

//#region TwoWayMap

test('TwoWayMap: basic usage', () => {
    const map = new TwoWayMap<string, number>();
    map.set("one", 1);
    map.set("two", 2);
    expect(map.getV("one")).toBe(1);
    expect(map.getK(1)).toBe("one");
    expect(map.getV("two")).toBe(2);
    expect(map.getK(2)).toBe("two");

    map.deleteK("one");
    expect(map.getV("one")).toBeUndefined();
    expect(map.getK(1)).toBeUndefined();
    expect(map.getV("two")).toBe(2);
    expect(map.getK(2)).toBe("two");

    map.deleteV(2);
    expect(map.getV("one")).toBeUndefined();
    expect(map.getK(1)).toBeUndefined();
    expect(map.getV("two")).toBeUndefined();
    expect(map.getK(2)).toBeUndefined();
});

//#region singleDiffWithCursor

test('singleDiffWithCursor: no changes simple', () => {
    expect(singleDiffWithCursor("", 0, "", 0))
        .toBeNull()
    expect(singleDiffWithCursor("a", 0, "a", 0))
        .toBeNull()
    expect(singleDiffWithCursor("abcd", 1, "abcd", 3))
        .toBeNull()
});

test('singleDiffWithCursor: simple addition', () => {
    expect(singleDiffWithCursor("", 0, "a", 0))
        .toMatchObject({ index: 0, added: "a", removed: "" });
    expect(singleDiffWithCursor("a", 1, "ab", 2))
        .toMatchObject({ index: 1, added: "b", removed: "" });
    expect(singleDiffWithCursor("abcd", 2, "abxcd", 3))
        .toMatchObject({ index: 2, added: "x", removed: "" });
});

test('singleDiffWithCursor: simple backspace', () => {
    expect(singleDiffWithCursor("a", 1, "", 0))
        .toMatchObject({ index: 0, added: "", removed: "a" });
    expect(singleDiffWithCursor("ab", 2, "a", 1))
        .toMatchObject({ index: 1, added: "", removed: "b" });
    expect(singleDiffWithCursor("abxxcd", 3, "abcd", 2))
        .toMatchObject({ index: 2, added: "", removed: "xx" });
});

test('singleDiffWithCursor: simple delete', () => {
    expect(singleDiffWithCursor("a", 0, "", 0))
        .toMatchObject({ index: 0, added: "", removed: "a" });
    expect(singleDiffWithCursor("ab", 1, "a", 1))
        .toMatchObject({ index: 1, added: "", removed: "b" });
    expect(singleDiffWithCursor("abxxcd", 2, "abcd", 2))
        .toMatchObject({ index: 2, added: "", removed: "xx" });
});

test('singleDiffWithCursor: character substitution', () => {
    expect(singleDiffWithCursor("abcdef", 1, "abghijf", 1))
        .toMatchObject({ index: 2, added: "ghij", removed: "cde" });
    expect(singleDiffWithCursor("これはぺｎ", 0, "これはペン", 0))
        .toMatchObject({ index: 3, added: "ペン", removed: "ぺｎ" });
    expect(singleDiffWithCursor("これはぺｎです", 0, "これはペンです", 0))
        .toMatchObject({ index: 3, added: "ペン", removed: "ぺｎ" });
});

test('singleDiffWithCursor: same character', () => {
    expect(singleDiffWithCursor("aaaaaaaa", 1, "aaaaaaaa", 3))
        .toBeNull()
    expect(singleDiffWithCursor("aaaaaaaa", 8, "aaaaa", 5))
        .toMatchObject({ index: 5, added: "", removed: "aaa" });
    expect(singleDiffWithCursor("aaaaa", 2, "aaaaaaaa", 5))
        .toMatchObject({ index: 2, added: "aaa", removed: "" });
});

test('singleDiffWithCursor: real-world test', () => {
    expect(singleDiffWithCursor(' says: ""', 0, 'T says: ""', 1)) // insert 'T'
        .toMatchObject({ index: 0, added: 'T', removed: '' });
    expect(singleDiffWithCursor('T says: ""', 1, 'Tekitou says: ""', 7)) // autocomplete
        .toMatchObject({ index: 1, added: 'ekitou', removed: '' });
    expect(singleDiffWithCursor('Tekitou says: ""', 7, 'Tekitou  says: ""', 8)) // insert space
        .toMatchObject({ index: 7, added: ' ', removed: '' });
    expect(singleDiffWithCursor('Tekitou  says: ""', 7, 'Tekitou says: ""', 7)) // delete space
        .toMatchObject({ index: 7, added: '', removed: ' ' });
    expect(singleDiffWithCursor('Tekitou  says: ""', 8, 'Tekitou says: ""', 7)) // backspace space
        .toMatchObject({ index: 7, added: '', removed: ' ' });
    expect(singleDiffWithCursor('Tekitou says: ""', 15, 'Tekitou says: """', 15))
        .toMatchObject({ index: 15, added: '"', removed: '' });
    expect(singleDiffWithCursor('Tekitou says: "before"', 15, 'Tekitou says: ""pasted""', 15))
        .toMatchObject({ index: 15, added: '"pasted"', removed: 'before' });
    expect(singleDiffWithCursor('Tekitou says: """', 16, 'Tekitou says: ""', 15)) // backspace
        .toMatchObject({ index: 15, added: '', removed: '"' });
    expect(singleDiffWithCursor('Tekitou says: """', 15, 'Tekitou says: ""', 15)) // delete
        .toMatchObject({ index: 15, added: '', removed: '"' });
    expect(singleDiffWithCursor('Tekitou says: ""pasted""', 15, 'Tekitou says: ""pasted ""', 15))
        .toMatchObject({ index: 22, added: ' ', removed: '' });
    expect(singleDiffWithCursor('Tekitou says: ""pasted""', 23, 'Tekitou says: ""pasted" "', 24))
        .toMatchObject({ index: 23, added: ' ', removed: '' });
});