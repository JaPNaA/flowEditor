import { InstructionGroupEditor } from "../InstructionGroupEditor";
import { AddInstructionAction, RemoveInstructionAction } from "../editing/actions";
import { Instruction, InstructionLine } from "./instructionTypes";

/**
 * A block of lines. May be nested (tree of instructions).
 * 
 * Each instruction has a block. Not all blocks are instructions.
 * 
 * Can identify all instructions and lines by an index relative to any parent block.
 * 
 * The root is always an InstructionGroupEditor, but there may not always be a root
 * (ex. the block is deleted.)
 */
export interface InstructionBlock {
    /** Parent block */
    parent?: CompositeInstructionBlock;
    /** Children blocks. Do not mutate. */
    children?: InstructionBlock[];
    /** Total number of lines in this block */
    numLines: number;
    /** Total number of instructions in this block */
    numInstructions: number;
    /** The instruction associated with the block */
    instruction?: Instruction;

    /** Traverse up to the root group editor, if one exists. */
    getGroupEditor(): InstructionGroupEditorBlock | undefined;

    /** Get a line by index inside this block. */
    getLine(index: number): InstructionLine;
    /** Returns the index of a line inside this block. */
    locateLine(line: InstructionLine): number;

    /** Traverse parents to find a parent with an associated instruction */
    parentInstruction(): Instruction | undefined;

    /** Iterator through all lines. */
    lineIter(): Generator<InstructionLine>;
}

/** A block of a single instruction */
export class SingleInstructionBlock implements InstructionBlock {
    public parent?: CompositeInstructionBlock | undefined;
    private lines: InstructionLine[] = [];
    public numLines: number = 0;
    public numInstructions: number = 1;

    constructor(public instruction?: Instruction) { }

    public getLine(index: number): InstructionLine {
        return this.lines[index];
    }

    public locateLine(line: InstructionLine): number {
        const index = this.lines.indexOf(line);
        if (index < 0) { throw new Error("Line not found"); }
        return index;
    }

    public *lineIter(): Generator<InstructionLine, any, unknown> {
        for (const line of this.lines) {
            yield line;
        }
    }

    public *instructionIter(): Generator<Instruction, any, unknown> {
        if (this.instruction) {
            yield this.instruction;
        }
    }

    public getGroupEditor(): InstructionGroupEditorBlock | undefined {
        if (!this.parent) { return; }
        return this.parent.getGroupEditor();
    }

    public parentInstruction(): Instruction | undefined {
        if (this.instruction) { return this.instruction; }
        return this.parent?.parentInstruction();
    }

    /** Insert a line. Only to be used by the owning Instruction class. */
    public _insertLine(index: number, line: InstructionLine) {
        this.lines.splice(index, 0, line);
        line._setParent(this);

        let curr: InstructionBlock | undefined = this;
        while (curr != undefined) {
            curr.numLines++;
            curr = curr.parent;
        }

        const group = this.getGroupEditor();
        if (group) {
            group.editor._insertInstructionLine(group.locateLine(line), line);
        }
    }

    public _appendLine(line: InstructionLine) {
        return this._insertLine(this.lines.length, line);
    }

    /** Removes a line. Only to be used by the owning Instruction class. */
    public _removeLine(index: number) {
        const removedLine = this.lines.splice(index, 1);
        if (removedLine.length === 0) { return; }

        let curr: InstructionBlock | undefined = this;
        while (curr != undefined) {
            curr.numLines--;
            curr = curr.parent;
        }

        const group = this.getGroupEditor();
        if (group) {
            group.editor._removeInstructionLine(removedLine[0]);
        }
    }
}

/** A block of multiple instructions */
export class CompositeInstructionBlock implements InstructionBlock {
    public parent?: CompositeInstructionBlock | undefined;
    public children: InstructionBlock[] = [];
    public numLines: number = 0;
    public numInstructions: number = 0;

    constructor(public instruction?: Instruction | undefined) { }

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

    public getGroupEditor(): InstructionGroupEditorBlock | undefined {
        if (!this.parent) { return; }
        return this.parent.getGroupEditor();
    }

    public parentInstruction(): Instruction | undefined {
        if (this.instruction) { return this.instruction; }
        return this.parent?.parentInstruction();
    }

    /** Performs an UndoableAction to insert a block */
    public insertBlock(index: number, block: InstructionBlock) {
        const editor = this.getGroupEditor();
        if (!editor) { throw new Error("No editor attached"); }
        editor.editor.parentEditor.undoLog.startGroup();
        editor.editor.parentEditor.undoLog.perform(
            new AddInstructionAction(block, index, this)
        );
        editor.editor.parentEditor.undoLog.endGroup();
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

        const editor = this.getGroupEditor();
        if (!editor) { throw new Error("No editor attached"); }
        editor.editor.parentEditor.undoLog.perform(
            new RemoveInstructionAction(index, this)
        );
    }

    /** Insert an instruction block. Only to be used by the owning class and actions. */
    public _insertBlock(index: number, block: InstructionBlock) {
        this.children.splice(index, 0, block);
        block.parent = this;

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

        let curr: InstructionBlock | undefined = this;
        while (curr != undefined) {
            curr.numLines -= instruction.numLines;
            curr = curr.parent;
        }
    }
}

export class InstructionGroupEditorBlock extends CompositeInstructionBlock {
    constructor(public editor: InstructionGroupEditor) { super(); }

    public getGroupEditor(): InstructionGroupEditorBlock {
        return this;
    }

    public hasGroupEditor(): boolean {
        return true;
    }
}
