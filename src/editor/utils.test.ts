import { getChanges } from "./utils";

test('getChanges no changes simple', () => {
    expect(getChanges("", 0, "", 0)).toEqual({ index: 0, added: "", removed: "" });
});
