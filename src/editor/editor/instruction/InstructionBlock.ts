import { InstructionGroupEditor } from "../InstructionGroupEditor";
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
    /** Children blocks */
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

    /** Get an instruction by index inside this block. */
    getInstruction(index: number): Instruction;
    /** Returns the instruction of an instruction inside this block. */
    locateInstruction(instruction: Instruction): number;

    /** Iterator through all lines. */
    lineIter(): Generator<InstructionLine>;
    /** Iterator through all instructions. */
    instructionIter(): Generator<Instruction>;
}

/** A block of a single instruction */
export class SingleInstructionBlock implements InstructionBlock {
    public parent?: CompositeInstructionBlock | undefined;
    private lines: InstructionLine[] = [];
    public numLines: number = 0;
    public numInstructions: number = 1;

    constructor(public instruction?: Instruction) { }

    public getInstruction(index: number): Instruction {
        if (index != 0 || this.instruction === undefined) { throw new Error("Instruction not found"); }
        return this.instruction;
    }

    public locateInstruction(instruction: Instruction): number {
        if (this.instruction != instruction) { throw new Error("Instruction not found"); }
        return 0;
    }

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

    /** Insert a line. Only to be used by the owning Instruction class. */
    public _insertLines(index: number, lines: InstructionLine[]) {
        this.lines.splice(index, 0, ...lines);
        for (const line of lines) {
            line._setParent(this);
        }

        let curr: InstructionBlock | undefined = this;
        while (curr != undefined) {
            curr.numLines += lines.length;
            curr = curr.parent;
        }
    }

    public _appendLines(...lines: InstructionLine[]) {
        return this._insertLines(this.lines.length, lines);
    }

    /** Removes a line. Only to be used by the owning Instruction class. */
    public _removeLines(index: number, number: number) {
        const numRemoved = this.lines.splice(index, number).length;

        let curr: InstructionBlock | undefined = this;
        while (curr != undefined) {
            curr.numLines -= numRemoved;
            curr = curr.parent;
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
            if (!curr.instruction) { throw new Error("Not an instruction"); }
            const parentIndex = curr.parent.children.indexOf(curr);
            for (let i = 0; i < parentIndex; i++) {
                index += curr.parent.children[i].numLines;
            }
            curr = curr.parent;
        }
        if (curr !== this) { throw new Error("Line not in block"); }
        return index;
    }

    public getInstruction(index: number): Instruction {
        let curr = 0;
        for (const child of this.children) {
            if (index < curr + child.numInstructions) {
                return child.getInstruction(index - curr);
            }
            curr += child.numInstructions;
        }

        throw new Error("Instruction not found");
    }

    public locateInstruction(instruction: Instruction): number {
        let curr: InstructionBlock | undefined = instruction.block;
        let index = curr.locateInstruction(instruction);
        while (curr.parent && curr !== this) {
            if (!curr.instruction) { throw new Error("Not an instruction"); }
            const parentIndex = curr.parent.children.indexOf(curr);
            for (let i = 0; i < parentIndex; i++) {
                index += curr.parent.children[i].numInstructions;
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

    public *instructionIter(): Generator<Instruction, any, unknown> {
        for (const child of this.children) {
            yield* child.instructionIter();
        }
    }

    public getGroupEditor(): InstructionGroupEditorBlock | undefined {
        if (!this.parent) { return; }
        return this.parent.getGroupEditor();
    }

    /** Insert an instruction block. Only to be used by the owning class. */
    public _insertInstruction(index: number, instruction: Instruction) {
        this.children.splice(index, 0, instruction.block);
        instruction.block.parent = this;

        let curr: InstructionBlock | undefined = this;
        while (curr != undefined) {
            curr.numLines += instruction.block.numLines;
            curr = curr.parent;
        }
    }

    public _appendInstruction(instruction: Instruction) {
        return this._insertInstruction(this.children.length, instruction);
    }

    /** Remove an instruction block. Only to be used by the owning class. */
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
