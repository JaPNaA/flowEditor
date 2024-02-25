/** Change of line. Then, (only for "up", "same", "down") offset on line given by which editiable, then character offset in editable */
// export type UserInputCursorPositionRelative = ["top" | "up" | "same" | "down" | "bottom", number, number, Editable?];

export abstract class RejectableEvent {
    private rejected = false;

    public reject() {
        this.rejected = true;
    }

    public isRejected() {
        return this.rejected;
    }
}

export class UserInputEvent extends RejectableEvent {
    constructor(
        public readonly added: string,
        public readonly removed: string,
        public readonly newContent: string
    ) { super(); }
}

export class LineOperationEvent extends RejectableEvent {
    constructor(
        /** Is the operation on the current line or next line? */
        public readonly isNextLine: boolean,
        /** Is the operation an insertion or deletion? */
        public readonly isInsert: boolean
    ) { super(); }
}
