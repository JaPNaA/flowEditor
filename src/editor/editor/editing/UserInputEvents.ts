import { InstructionLine } from "../instruction/instructionTypes";
import { Editable } from "./Editable";

export abstract class RejectableEvent {
    private rejected = false;

    public reject() {
        this.rejected = true;
    }

    public isRejected() {
        return this.rejected;
    }
}

export class LineOperationEvent extends RejectableEvent {
    constructor(
        public readonly line: InstructionLine,
        /** Is the operation on the current line or next line? */
        public readonly isNextLine: boolean,
        /** Is the operation an insertion or deletion? */
        public readonly isInsert: boolean
    ) { super(); }
}
