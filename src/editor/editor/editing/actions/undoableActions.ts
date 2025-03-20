import { Editor } from "../../Editor";
import { InstructionGroup } from "../../InstructionGroup";
import { BranchInstructionLine } from "../../instruction/instructionTypes";
import { Editable } from "../Editable";
import { CompositeInstructionBlock, InstructionBlock } from "../../instruction/InstructionBlock";
import { ActionInstance } from "./ActionBus";

export interface UndoableAction extends ActionInstance {
    // perform(): void;
    inverse(): UndoableAction;
}

export class AddGroupAction implements UndoableAction {
    public static key = Symbol();
    public key = AddGroupAction.key;

    constructor(public group: InstructionGroup, public editor: Editor) { }

    public inverse(): RemoveGroupAction {
        return new RemoveGroupAction(this.group, this.editor);
    }
}

export class RemoveGroupAction implements UndoableAction {
    public static key = Symbol();
    public key = RemoveGroupAction.key;

    constructor(public group: InstructionGroup, public editor: Editor) { }

    public inverse(): AddGroupAction {
        return new AddGroupAction(this.group, this.editor);
    }
}

export class MarkGroupAsStartAction implements UndoableAction {
    public static key = Symbol();
    public key = MarkGroupAsStartAction.key;

    constructor(
        public group: InstructionGroup | undefined,
        public previousStartGroup: InstructionGroup | undefined,
        public editor: Editor
    ) { }

    public inverse(): MarkGroupAsStartAction {
        return new MarkGroupAsStartAction(this.previousStartGroup, this.group, this.editor);
    }
}

export class AddInstructionAction implements UndoableAction {
    public static key = Symbol();
    public key = AddInstructionAction.key;

    constructor(
        public block: InstructionBlock,
        public relativeIndex: number,
        public parentBlock: CompositeInstructionBlock
    ) { }

    public inverse(): RemoveInstructionAction {
        return new RemoveInstructionAction(this.relativeIndex, this.block, this.parentBlock);
    }
}

export class RemoveInstructionAction implements UndoableAction {
    public static key = Symbol();
    public key = RemoveInstructionAction.key

    constructor(
        public relativeIndex: number,
        public removedBlock: InstructionBlock,
        public block: CompositeInstructionBlock
    ) { }

    public inverse(): AddInstructionAction {
        return new AddInstructionAction(this.removedBlock, this.relativeIndex, this.block);
    }
}

export class BranchTargetChangeAction implements UndoableAction {
    public static key = Symbol();
    public key = BranchTargetChangeAction.key;

    constructor(
        public branchTarget: InstructionGroup | null,
        public previousBranchTarget: InstructionGroup | null,
        public branchLine: BranchInstructionLine
    ) { }

    public inverse(): UndoableAction {
        return new BranchTargetChangeAction(this.previousBranchTarget, this.branchTarget, this.branchLine);
    }
}

export class EditableEditAction implements UndoableAction {
    public static key = Symbol();
    public key = EditableEditAction.key;

    constructor(
        public editable: Editable,
        public newValue: string,
        public previousValue: string
    ) { }

    public inverse(): EditableEditAction {
        return new EditableEditAction(this.editable, this.previousValue, this.newValue);
    }
}
