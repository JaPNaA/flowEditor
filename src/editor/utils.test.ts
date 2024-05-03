import { TwoWayMap, findEditableValuesInChangedString, singleDiffWithCursor } from "./utils";

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
    expect(singleDiffWithCursor("これはｔです", 0, "これはてです", 0))
        .toMatchObject({ index: 3, added: "て", removed: "ｔ" });
    expect(singleDiffWithCursor("これはｔ", 0, "これはて", 0))
        .toMatchObject({ index: 3, added: "て", removed: "ｔ" });
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

//#region findEditableValuesInChangedString

function editable(x: string) { return { getValue() { return x; } } }

test('findEditableValuesInChangedString: no changes', () => {
    expect(findEditableValuesInChangedString(
        [editable('a'), ' says: "', editable('test'), '"'],
        'a says : "test"', 0,
        'a says : "test"', 0
    )).toEqual({ values: ['a', 'test'], changedNonEditable: false });
});

test('findEditableValuesInChangedString: single editable edit', () => {
    expect(findEditableValuesInChangedString(
        [editable('a')],
        'a', 0,
        'b', 0
    )).toEqual({ values: ['b'], changedNonEditable: false });

    expect(findEditableValuesInChangedString(
        [editable('c')],
        'c', 0,
        'bcd', 0
    )).toEqual({ values: ['bcd'], changedNonEditable: false });
});

test('findEditableValuesInChangedString: starting editable edit', () => {
    expect(findEditableValuesInChangedString(
        [editable('b'), 'aa'],
        'baa', 0,
        'caa', 0
    )).toEqual({ values: ['c'], changedNonEditable: false });
    expect(findEditableValuesInChangedString(
        [editable('b'), 'aa'],
        'baa', 0,
        'cdeaa', 0
    )).toEqual({ values: ['cde'], changedNonEditable: false });
});

test('findEditableValuesInChangedString: ending editable edit', () => {
    expect(findEditableValuesInChangedString(
        ['aa', editable('c')],
        'aab', 0,
        'aac', 0
    )).toEqual({ values: ['c'], changedNonEditable: false });
    expect(findEditableValuesInChangedString(
        ['aa', editable('c')],
        'aab', 0,
        'aacde', 0
    )).toEqual({ values: ['cde'], changedNonEditable: false });
});

test('findEditableValuesInChangedString: editable edit (with other unchanged editable)', () => {
    expect(findEditableValuesInChangedString(
        [editable('a'), ' says: "', editable('test'), '"'],
        'a says: "test"', 0,
        'b says: "test"', 0
    )).toEqual({ values: ['b', 'test'], changedNonEditable: false });
    expect(findEditableValuesInChangedString(
        [editable('a'), ' says: "', editable('test'), '"'],
        'a says: "test"', 0,
        'a says: "toast"', 0
    )).toEqual({ values: ['a', 'toast'], changedNonEditable: false });
    expect(findEditableValuesInChangedString(
        [editable('a'), ' says: "', editable('test')],
        'a says: "test', 0,
        'b says: "test', 0
    )).toEqual({ values: ['b', 'test'], changedNonEditable: false });
    expect(findEditableValuesInChangedString(
        [editable('a'), ' says: "', editable('test')],
        'a says: "test', 0,
        'a says: "toast', 0
    )).toEqual({ values: ['a', 'toast'], changedNonEditable: false });
});

test('findEditableValuesInChangedString: multiple editable edits', () => {
    expect(findEditableValuesInChangedString(
        [editable('a'), ' says: "', editable('test'), '"'],
        'a says: "test"', 0,
        'bread says: "toast"', 0
    )).toEqual({ values: ['bread', 'toast'], changedNonEditable: false });
    expect(findEditableValuesInChangedString(
        ['If ', editable('a'), ' ', editable('>'), ' ', editable('b'), ', goto...'],
        'If a > b, goto...', 0,
        'If c <= d, goto...', 0
    )).toEqual({ values: ['c', '<=', 'd'], changedNonEditable: false });
});

test('findEditableValuesInChangedString: simple deletion', () => {
    expect(findEditableValuesInChangedString(
        ['If ', editable('a'), ' ', editable('>'), ' ', editable('b'), ', goto...'],
        'If a > b, goto...', 0,
        'If  > b, goto...', 0
    )).toEqual({ values: ['', '>', 'b'], changedNonEditable: false });
    expect(findEditableValuesInChangedString(
        ['If ', editable('a'), ' ', editable('>'), ' ', editable('b'), ', goto...'],
        'If a > b, goto...', 0,
        'If a  b, goto...', 0
    )).toEqual({ values: ['a', '', 'b'], changedNonEditable: false });
    expect(findEditableValuesInChangedString(
        ['If ', editable('a'), ' ', editable('>'), ' ', editable('b'), ', goto...'],
        'If a > b, goto...', 0,
        'If a > , goto...', 0
    )).toEqual({ values: ['a', '>', ''], changedNonEditable: false });
    expect(findEditableValuesInChangedString(
        [editable('a'), ' says: "', editable('test')],
        'a says: "test', 0,
        'a says: "', 0
    )).toEqual({ values: ['a', ''], changedNonEditable: false });
});


test('findEditableValuesInChangedString: multiple simple deletion', () => {
    expect(findEditableValuesInChangedString(
        ['If ', editable('a'), ' ', editable('>'), ' ', editable('b'), ', goto...'],
        'If a > b, goto...', 0,
        'If   b, goto...', 0
    )).toEqual({ values: ['', '', 'b'], changedNonEditable: false });
    expect(findEditableValuesInChangedString(
        ['If ', editable('a'), ' ', editable('>'), ' ', editable('b'), ', goto...'],
        'If a > b, goto...', 0,
        'If a  , goto...', 0
    )).toEqual({ values: ['a', '', ''], changedNonEditable: false });
    expect(findEditableValuesInChangedString(
        ['If ', editable('a'), ' ', editable('>'), ' ', editable('b'), ', goto...'],
        'If a > b, goto...', 0,
        'If   , goto...', 0
    )).toEqual({ values: ['', '', ''], changedNonEditable: false });
});

test('findEditableValuesInChangedString: unmodifiable area deletion', () => {
    // with noneditable
    expect(findEditableValuesInChangedString(
        [editable('They'), ' says: "', editable('something'), '"'],
        'They says: "something"', 11,
        'They says: something"', 11
    )).toEqual({ values: ['They', 'something'], changedNonEditable: true });
    expect(findEditableValuesInChangedString(
        [editable('They'), ' says: "', editable('something'), '"'],
        'They says: "something"', 12,
        'They s: "something"', 12
    )).toEqual({ values: ['They', 'something'], changedNonEditable: true });

    // no ending noneditable
    expect(findEditableValuesInChangedString(
        [editable('They'), ' says: "', editable('something')],
        'They says: "something', 11,
        'They says: something', 11
    )).toEqual({ values: ['They', 'something'], changedNonEditable: true });
    expect(findEditableValuesInChangedString(
        [editable('They'), ' says: "', editable('something')],
        'They says: "something', 12,
        'They s: "something', 12
    )).toEqual({ values: ['They', 'something'], changedNonEditable: true });
});

test('findEditableValuesInChangedString: multiple unmodifiable area deletion', () => {
    // note: we expect unmodifiable areas to be there or not (no partial unmodifiable areas)

    expect(findEditableValuesInChangedString(
        ['If ', editable('a'), ' ', editable('>'), ' ', editable('b'), ', goto...'],
        'If a > b, goto...', 0,
        'If , goto...', 0
    )).toEqual({ values: ['', '', ''], changedNonEditable: true });

    expect(findEditableValuesInChangedString(
        [editable('They'), ' says: "', editable('something'), '"'],
        'They says: "something"', 12,
        'They', 12
    )).toEqual({ values: ['They', ''], changedNonEditable: true });
});

test('findEditableValuesInChangedString: confusing editable value insertion', () => {
    // sanity check
    expect(singleDiffWithCursor('They says: "something"', 21, 'They says: "something"a"', 23))
        .toMatchObject({ index: 21, added: '"a', removed: "" });

    // the user inserts a quote inside the editable -- this should work
    expect(findEditableValuesInChangedString(
        [editable('They'), ' says: "', editable('something'), '"'],
        'They says: "something"', 21,
        'They says: "something""', 22
    )).toEqual({ values: ['They', 'something"'], changedNonEditable: false });

    expect(findEditableValuesInChangedString(
        [editable('They'), ' says: "', editable('something'), '"'],
        'They says: "something"', 21,
        'They says: "something"a"', 23
    )).toEqual({ values: ['They', 'something"a'], changedNonEditable: false });

    // sanity check
    expect(singleDiffWithCursor('They says: "something"', 22, 'They says: "something"a"', 24))
        .toMatchObject({ index: 22, added: 'a"', removed: "" });

    // the user inserts a quote outside the editable -- we should identify this as a noneditable edit
    expect(findEditableValuesInChangedString(
        [editable('They'), ' says: "', editable('something'), '"'],
        'They says: "something"', 22,
        'They says: "something"a"', 24
    )).toEqual({ values: ['They', 'something'], changedNonEditable: true });

    // the user should be able to insert a space anywhere
    expect(findEditableValuesInChangedString(
        ['If ', editable('a'), ' ', editable('>'), ' ', editable('b'), ', goto...'],
        'If a > b, goto...', 4,
        'If a  > b, goto...', 5,
    )).toEqual({ values: ['a ', '>', 'b'], changedNonEditable: false });
    expect(findEditableValuesInChangedString(
        ['If ', editable('a'), ' ', editable('>'), ' ', editable('b'), ', goto...'],
        'If a > b, goto...', 5,
        'If a  > b, goto...', 6,
    )).toEqual({ values: ['a', ' >', 'b'], changedNonEditable: false });
});

test('findEditableValuesInChangedString: confusing editable value deletion', () => {
    // the user deletes a quote inside the editable -- this should work
    expect(findEditableValuesInChangedString(
        [editable('They'), ' says: "', editable('something"'), '"'],
        'They says: "something""', 22,
        'They says: "something"', 21
    )).toEqual({ values: ['They', 'something'], changedNonEditable: false });

    expect(findEditableValuesInChangedString(
        [editable('They'), ' says: "', editable('something"a'), '"'],
        'They says: "something"a"', 23,
        'They says: "something"', 21
    )).toEqual({ values: ['They', 'something'], changedNonEditable: false });

    // the user should be able to delete a space in the editable
    expect(findEditableValuesInChangedString(
        ['If ', editable('a '), ' ', editable('>'), ' ', editable('b'), ', goto...'],
        'If a  > b, goto...', 5,
        'If a > b, goto...', 4,
    )).toEqual({ values: ['a', '>', 'b'], changedNonEditable: false });
    expect(findEditableValuesInChangedString(
        ['If ', editable('a'), ' ', editable(' >'), ' ', editable('b'), ', goto...'],
        'If a  > b, goto...', 6,
        'If a > b, goto...', 5,
    )).toEqual({ values: ['a', '>', 'b'], changedNonEditable: false });
});
