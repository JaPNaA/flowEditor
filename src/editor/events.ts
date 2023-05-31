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
