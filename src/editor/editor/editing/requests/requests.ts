import { InstructionLine } from "../../instruction/components/InstructionLine";
import { Editable } from "../Editable";

export class LineOperationRequest {
    constructor(
        public readonly line: InstructionLine,
        /** Is the operation on the current line or next line? */
        public readonly isNextLine: boolean,
        /** Is the operation an insertion or deletion? */
        public readonly isInsert: boolean
    ) { }
}

export class EditRequest {
    constructor(
        public readonly newContent: string,
        public readonly editable: Editable,
        /**
         * Set for edit requests triggered from the input capture, and
         * have already been handled.
         */
        public readonly inputCapturePreUpdated: boolean
    ) { }
}
