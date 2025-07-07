// These are utils for debugging, and should NOT be included in the final build.

const objIdMap = new WeakMap<any, number>();
let nextObjId = 1;

/**
 * Returns a unique ID for any object, useful for logging.
 */
export function objId(x: any) {
    if (objIdMap.has(x)) { return objIdMap.get(x); }
    const id = nextObjId++;
    objIdMap.set(x, id);
    return [id, x];
}
