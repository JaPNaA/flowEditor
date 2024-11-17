/**
 * Generates a unique ID for for objects in this instance of the
 * flowEditor.
 * 
 * The same object will return the same ID in subsequent calls.
 */
export class UIDGenerator {
    private count = 0;
    private map = new WeakMap();

    getId(object: any) {
        const existing = this.map.get(object);
        if (existing !== undefined) {
            return existing;
        } else {
            const id = this.count++;
            this.map.set(object, id);
            return id;
        }
    }
}
