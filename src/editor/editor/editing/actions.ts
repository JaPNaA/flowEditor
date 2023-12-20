import { pluginHooks } from "../../index";
import { removeElmFromArray } from "../../../japnaaEngine2d/util/removeElmFromArray";
import { Editor } from "../Editor";
import { InstructionGroupEditor } from "../InstructionGroupEditor";
import { BranchInstructionLine, Instruction } from "../instruction/instructionTypes";
import { Editable } from "./Editable";
import { CompositeInstructionBlock, InstructionBlock } from "../instruction/InstructionBlock";

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
    constructor(public block: InstructionBlock, public relativeIndex: number, public parentBlock: CompositeInstructionBlock) { }

    public perform(): void {
        const group = this.parentBlock.getGroupEditor();
        this.parentBlock._insertBlock(this.relativeIndex, this.block);

        if (group) {
            const nextLineIndex = group.locateLine(this.block.getLine(this.block.numLines - 1)) + 1;

            // insert into html
            if (nextLineIndex < group.numLines) {
                const nextLineElm = group.getLine(nextLineIndex).elm.getHTMLElement();

                for (const line of this.block.lineIter()) {
                    group.editor.elm.getHTMLElement().insertBefore(line.elm.getHTMLElement(), nextLineElm);
                }
            } else {
                for (const line of this.block.lineIter()) {
                    group.editor.elm.append(line);
                }
            }

            for (const line of this.block.lineIter()) {
                group.editor._htmlInstructionLineToJS.set(line.elm.getHTMLElement(), line);
                for (const editable of line.getEditables()) {
                    group.editor.parentEditor.cursor.autocomplete.enteredValue(editable);
                }
            }

            group.editor.updateHeight();
        }

    }

    public inverse(): RemoveInstructionAction {
        return new RemoveInstructionAction(this.relativeIndex, this.parentBlock);
    }
}

export class RemoveInstructionAction implements UndoableAction {
    public removedInstruction?: InstructionBlock;

    constructor(public relativeIndex: number, public block: CompositeInstructionBlock) { }

    public perform(): void {
        const instruction = this.block.children[this.relativeIndex];
        this.removedInstruction = instruction;

        this.block._removeBlock(this.relativeIndex);

        const group = this.block.getGroupEditor();

        if (group) {
            for (const line of instruction.lineIter()) {
                group.editor._removeInstructionLine(line);
                for (const editable of line.getEditables()) {
                    group.editor.parentEditor.cursor.autocomplete.removedValue(editable);
                }
            }
            group.editor.updateHeight();
        }
    }

    public inverse(): AddInstructionAction {
        if (!this.removedInstruction) { throw new InverseBeforePerformError(); }
        return new AddInstructionAction(this.removedInstruction, this.relativeIndex, this.block);
    }
}

export class BranchTargetChangeAction implements UndoableAction {
    public previousBranchTarget?: InstructionGroupEditor | null;
    constructor(public branchTarget: InstructionGroupEditor | null, public branchLine: BranchInstructionLine) { }

    public perform(): void {
        this.previousBranchTarget = this.branchLine.branchTarget;
        const groupBlock = this.branchLine.parentBlock.getGroupEditor();
        if (!groupBlock) { throw new Error("No group editor"); }
        const group = groupBlock.editor;

        // remove parent/child relation
        if (this.previousBranchTarget) {
            removeElmFromArray(
                this.previousBranchTarget,
                group._childGroups
            );
            removeElmFromArray(
                group,
                this.previousBranchTarget._parentGroups
            );
        }

        // update instruction
        this.branchLine.branchTarget = this.branchTarget;
        this.branchLine._updateElmState();

        // update parent/child relations
        if (this.branchTarget) {
            this.branchTarget._parentGroups.push(group);
            group._childGroups.push(this.branchTarget);
        }

        // update render hitboxes
        group.updateAfterMove();
    }

    public inverse(): UndoableAction {
        return new BranchTargetChangeAction(this.previousBranchTarget || null, this.branchLine);
    }
}

export class EditableEditAction implements UndoableAction {
    public previousValue?: string;
    constructor(public editable: Editable, public newValue: string) { }

    public perform(): void {
        const autocomplete = this.editable.parentLine.parentBlock.getGroupEditor()?.editor.parentEditor.cursor.autocomplete;

        if (autocomplete) { autocomplete.removedValue(this.editable); }
        this.previousValue = this.editable._value;
        this.editable._value = this.newValue;
        this.editable.placeholder = false;
        if (autocomplete) { autocomplete.enteredValue(this.editable); }

        this.editable.parentLine.parentBlock.getGroupEditor()
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
