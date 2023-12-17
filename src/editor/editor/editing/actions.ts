import { pluginHooks } from "../../index";
import { removeElmFromArray } from "../../../japnaaEngine2d/util/removeElmFromArray";
import { Editor } from "../Editor";
import { InstructionGroupEditor } from "../InstructionGroupEditor";
import { BranchInstructionLine, Instruction } from "../instruction/instructionTypes";
import { Editable } from "./Editable";
import { CompositeInstructionBlock } from "../instruction/InstructionBlock";

export class UndoLog {
    private currLogGroup: UndoableAction[] = [];
    private log: UndoableAction[][] = [];

    private groupDepth = 0;
    private frozen = false;

    public onAfterActionPerform!: Function;

    public undo() {
        this.flushLogGroup();
        const logs = this.log.pop();
        if (!logs) { return; }
        let log;
        while (log = logs.pop()) {
            const action = log.inverse();
            action.perform();
            pluginHooks.onAction(action);
        }
        this.onAfterActionPerform();
    }

    public freeze() {
        this.frozen = true;
    }

    public thaw() {
        this.frozen = false;
    }

    public startGroup() {
        this.groupDepth++;
    }

    public endGroup() {
        this.groupDepth--;
        if (this.groupDepth == 0) {
            this.flushLogGroup();
        } else if (this.groupDepth < 0) {
            throw new Error("Undo group depths not matching");
        }
    }

    public perform(action: UndoableAction) {
        if (!this.frozen) { this.currLogGroup.push(action); }
        action.perform();
        pluginHooks.onAction(action);
        this.onAfterActionPerform();
    }

    private flushLogGroup() {
        if (this.currLogGroup.length) {
            this.log.push(this.currLogGroup);
            this.currLogGroup = [];
        }
    }
}

export interface UndoableAction {
    perform(): void;
    inverse(): UndoableAction;
}

export class AddGroupAction implements UndoableAction {
    constructor(public group: InstructionGroupEditor, public editor: Editor) { }

    public perform(): void {
        this.editor._groupEditors.push(this.group);
        this.editor._children.addChild(this.group);
        this.editor.cursor.registerInstructionGroup(this.group);

        // add parent-child relations
        for (const child of this.group._childGroups) {
            child._parentGroups.push(this.group);
        }
        for (const parent of this.group._parentGroups) {
            parent._childGroups.push(this.group);
        }
    }

    public inverse(): RemoveGroupAction {
        return new RemoveGroupAction(this.group, this.editor);
    }
}

export class RemoveGroupAction implements UndoableAction {
    constructor(public group: InstructionGroupEditor, public editor: Editor) { }

    public perform(): void {
        removeElmFromArray(this.group, this.editor._groupEditors);
        this.editor._children.removeChild(this.group);
        this.editor.cursor.unregisterInstructionGroup(this.group);

        // remove parent-child relations
        for (const child of this.group._childGroups) {
            removeElmFromArray(this.group, child._parentGroups);
        }
        for (const parent of this.group._parentGroups) {
            removeElmFromArray(this.group, parent._childGroups);
        }
    }

    public inverse(): AddGroupAction {
        return new AddGroupAction(this.group, this.editor);
    }
}

export class MarkGroupAsStartAction implements UndoableAction {
    public previousStartGroup?: InstructionGroupEditor;

    constructor(public group: InstructionGroupEditor | undefined, public editor: Editor) { }

    public perform(): void {
        this.previousStartGroup = this.editor._startGroup;
        if (this.previousStartGroup) {
            this.previousStartGroup._isStartGroup = false;
        }
        this.editor._startGroup = this.group;
        if (this.group) {
            this.group._isStartGroup = true;
        }
    }

    public inverse(): MarkGroupAsStartAction {
        return new MarkGroupAsStartAction(this.previousStartGroup, this.editor)
    }
}

export class AddInstructionAction implements UndoableAction {
    constructor(public instruction: Instruction, public index: number, public block: CompositeInstructionBlock, public group: InstructionGroupEditor) { }

    public perform(): void {
        const newBlock = this.instruction.block;
        const nextInstruction = this.block.getInstructions()[this.index];

        // insert into html
        if (nextInstruction) {
            const nextLine = nextInstruction.block.getLine(0);
            const nextLineElm = nextLine.elm.getHTMLElement();

            for (const line of newBlock.lineIter()) {
                this.group.elm.getHTMLElement().insertBefore(line.elm.getHTMLElement(), nextLineElm);
            }

            this.block._insertInstruction(this.index, this.instruction);
        } else {
            for (const line of newBlock.lineIter()) {
                this.group.elm.append(line);
            }

            this.block._insertInstruction(this.index, this.instruction);
        }

        for (const line of newBlock.lineIter()) {
            this.group._htmlInstructionLineToJS.set(line.elm.getHTMLElement(), line);
            for (const editable of line.getEditables()) {
                this.group.parentEditor.cursor.autocomplete.enteredValue(editable);
            }
        }

        this.group.updateHeight();
    }

    public inverse(): RemoveInstructionAction {
        return new RemoveInstructionAction(this.index, this.block, this.group);
    }
}

export class RemoveInstructionAction implements UndoableAction {
    public removedInstruction?: Instruction;

    constructor(public index: number, public block: CompositeInstructionBlock, public group: InstructionGroupEditor) { }

    public perform(): void {
        const instruction = this.block.getInstructions()[this.index];
        this.removedInstruction = instruction;

        this.block._removeInstruction(this.index);
        for (const line of instruction.block.lineIter()) {
            this.group._removeInstructionLine(line);
            for (const editable of line.getEditables()) {
                this.group.parentEditor.cursor.autocomplete.removedValue(editable);
            }
        }

        this.group.updateHeight();
    }

    public inverse(): AddInstructionAction {
        if (!this.removedInstruction) { throw new InverseBeforePerformError(); }
        return new AddInstructionAction(this.removedInstruction, this.index, this.block, this.group);
    }
}

export class BranchTargetChangeAction implements UndoableAction {
    public previousBranchTarget?: InstructionGroupEditor | null;
    constructor(public branchTarget: InstructionGroupEditor | null, public branchLine: BranchInstructionLine) { }

    public perform(): void {
        this.previousBranchTarget = this.branchLine.branchTarget;

        // remove parent/child relation
        if (this.previousBranchTarget) {
            removeElmFromArray(
                this.previousBranchTarget,
                this.branchLine.parentInstruction.block.getGroupEditor()._childGroups
            );
            removeElmFromArray(
                this.branchLine.parentInstruction.block.getGroupEditor(),
                this.previousBranchTarget._parentGroups
            );
        }

        // update instruction
        this.branchLine.branchTarget = this.branchTarget;
        this.branchLine._updateElmState();

        // update parent/child relations
        if (this.branchTarget) {
            this.branchTarget._parentGroups.push(this.branchLine.parentInstruction.block.getGroupEditor());
            this.branchLine.parentInstruction.block.getGroupEditor()._childGroups.push(this.branchTarget);
        }

        // update render hitboxes
        this.branchLine.parentInstruction.block.getGroupEditor().updateAfterMove();
    }

    public inverse(): UndoableAction {
        return new BranchTargetChangeAction(this.previousBranchTarget || null, this.branchLine);
    }
}

export class EditableEditAction implements UndoableAction {
    public previousValue?: string;
    constructor(public editable: Editable, public newValue: string) { }

    public perform(): void {
        const autocomplete = this.editable.parentLine.parentInstruction.block.hasGroupEditor() ?
            this.editable.parentLine.parentInstruction.block.getGroupEditor().parentEditor.cursor.autocomplete : undefined;

        if (autocomplete) { autocomplete.removedValue(this.editable); }
        this.previousValue = this.editable._value;
        this.editable._value = this.newValue;
        this.editable.placeholder = false;
        if (autocomplete) { autocomplete.enteredValue(this.editable); }

        this.editable.parentLine.parentInstruction.block.getGroupEditor()
        this.editable.update();
    }

    public inverse(): EditableEditAction {
        if (this.previousValue === undefined) { throw new InverseBeforePerformError(); }
        return new EditableEditAction(this.editable, this.previousValue);
    }
}

class InverseBeforePerformError extends Error {
    constructor() {
        super("Cannot inverse action before performing the action.");
    }
}
