/**
 * Represents a selection involving DOM nodes.
 * Note that this is object has a subset of attributes from the default
 * Selection class.
 */
export class DOMSelection {
    constructor(
        public anchorNode: Node,
        public focusOffset: number
    ) { }
}
