import { ActionBusDispatchable } from "../../editing/actions/ActionBus";
import { UndoableAction } from "../../editing/actions/UndoableAction";
import { InstructionGroup } from "../../InstructionGroup";
import { Instruction } from "../baseInstructions/Instruction";
import { InstructionBlueprintRegistery } from "../InstructionBlueprintRegistery";
import { InstructionLine } from "../InstructionLine";
import { InstructionBlock } from "./InstructionBlock";


/** A block of multiple instructions */
export class CompositeInstructionBlock implements InstructionBlock {
    public parent?: CompositeInstructionBlock | undefined;
    public children: InstructionBlock[] = [];
    public numLines: number = 0;

    /** Instruction blueprints used for creating new instructions under the block */
    public blueprintRegistery?: InstructionBlueprintRegistery;

    public actionBus = new ActionBusDispatchable();

    constructor(public instruction?: Instruction | undefined) {
        this.actionBus.subscribe(AddInstructionAction, action => {
            if (action.parentBlock !== this) { return; }

            const group = this.getGroup();
            this._insertBlock(action.relativeIndex, action.block);

            if (group) {
                const nextLineIndex = group.locateLine(action.block.getLine(action.block.numLines - 1)) + 1;

                // insert into html
                if (nextLineIndex < group.numLines) {
                    const nextLineElm = group.getLine(nextLineIndex).elm.getHTMLElement();

                    for (const line of action.block.lineIter()) {
                        group.group.editor.elm.getHTMLElement().insertBefore(line.elm.getHTMLElement(), nextLineElm);
                    }
                } else {
                    for (const line of action.block.lineIter()) {
                        group.group.editor.elm.append(line);
                    }
                }

                for (const line of action.block.lineIter()) {
                    for (const editable of line.getEditables()) {
                        group.group.parentEditor.cursor.autocomplete.enteredValue(editable);
                    }
                }

                group.group.editor.updateHeight();
            }
        });

        this.actionBus.subscribe(RemoveInstructionAction, action => {
            if (action.block !== this) { return; }

            const instruction = this.children[action.relativeIndex];

            this._removeBlock(action.relativeIndex);

            const group = this.getGroup();

            if (group) {
                for (const line of instruction.lineIter()) {
                    group.group.editor._removeInstructionLine(line);
                    for (const editable of line.getEditables()) {
                        group.group.parentEditor.cursor.autocomplete.removedValue(editable);
                    }
                }
                group.group.editor.updateHeight();
            }
        });
    }

    /** Get line by number relative to this block */
    public getLine(index: number): InstructionLine {
        let curr = 0;
        for (const child of this.children) {
            if (index < curr + child.numLines) {
                return child.getLine(index - curr);
            }
            curr += child.numLines;
        }

        throw new Error("Line not found");
    }

    /** Find the line number of the specified line relative to this block */
    public locateLine(line: InstructionLine): number {
        let curr: InstructionBlock | undefined = line.parentBlock;
        let index = curr.locateLine(line);
        while (curr.parent && curr !== this) {
            const parentIndex = curr.parent.children.indexOf(curr);
            for (let i = 0; i < parentIndex; i++) {
                index += curr.parent.children[i].numLines;
            }
            curr = curr.parent;
        }
        if (curr !== this) { throw new Error("Line not in block"); }
        return index;
    }

    public *lineIter(): Generator<InstructionLine, any, unknown> {
        for (const child of this.children) {
            yield* child.lineIter();
        }
    }

    public getGroup(): InstructionGroupBlock | undefined {
        if (!this.parent) { return; }
        return this.parent.getGroup();
    }

    public parentInstruction(): Instruction | undefined {
        if (this.instruction) { return this.instruction; }
        return this.parent?.parentInstruction();
    }

    /** Performs an UndoableAction to insert a block */
    public insertBlock(index: number, block: InstructionBlock) {
        const editor = this.getGroup();
        if (!editor) { throw new Error("No editor attached"); }
        editor.group.parentEditor.undoLog.startGroup();
        editor.group.parentEditor.undoLog.perform(
            new AddInstructionAction(block, index, this)
        );
        editor.group.parentEditor.undoLog.endGroup();
    }

    /** Performs an UndoableAction to append a block */
    public appendBlock(block: InstructionBlock) {
        return this.insertBlock(this.children.length, block);
    }

    /** Performs an UndoableAction to remove a block */
    public removeBlock(block: number | InstructionBlock) {
        let index;
        if (typeof block === "number") {
            index = block;
        } else {
            index = this.children.indexOf(block);
            if (index < 0) { throw new Error("Cannot remove block that is not child"); }
        }

        const editor = this.getGroup();
        if (!editor) { throw new Error("No editor attached"); }
        editor.group.parentEditor.undoLog.perform(
            new RemoveInstructionAction(index, this.children[index], this)
        );
    }

    /** Insert an instruction block. Only to be used by the owning class and actions. */
    public _insertBlock(index: number, block: InstructionBlock) {
        this.children.splice(index, 0, block);
        block.parent = this;
        block.actionBus.parentBus = this.actionBus;

        let curr: InstructionBlock | undefined = this;
        while (curr != undefined) {
            curr.numLines += block.numLines;
            curr = curr.parent;
        }
    }

    /** Appends an instruction block. Only to be used by the owning class and actions. */
    public _appendBlock(block: InstructionBlock) {
        return this._insertBlock(this.children.length, block);
    }

    /** Remove an instruction block. Only to be used by the owning class and actions. */
    public _removeBlock(block: number | InstructionBlock) {
        let index;
        if (typeof block === "number") {
            index = block;
        } else {
            index = this.children.indexOf(block);
            if (index < 0) { throw new Error("Cannot remove block that is not child"); }
        }
        const instruction = this.children.splice(index, 1)[0];
        instruction.parent = undefined;
        instruction.actionBus.parentBus = undefined;

        let curr: InstructionBlock | undefined = this;
        while (curr != undefined) {
            curr.numLines -= instruction.numLines;
            curr = curr.parent;
        }
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

    public getTarget() {
        return this.parentBlock.actionBus;
    }

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

    public getTarget(): ActionBusDispatchable {
        return this.block.actionBus;
    }

    public inverse(): AddInstructionAction {
        return new AddInstructionAction(this.removedBlock, this.relativeIndex, this.block);
    }
}

export class InstructionGroupBlock extends CompositeInstructionBlock {
    constructor(public group: InstructionGroup) { super(); }

    public getGroup(): InstructionGroupBlock {
        return this;
    }

    public hasGroupEditor(): boolean {
        return true;
    }
}
