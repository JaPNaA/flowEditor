import { InstructionGroupEditor } from "../InstructionGroupEditor";
import { Instruction, InstructionLine } from "./instructionTypes";

/**
 * A block of instructions. May be nested (tree of instructions).
 */
export interface InstructionBlock {
    /** Parent block */
    parent?: CompositeInstructionBlock;
    /** Total number of lines in this block */
    numLines: number;
    /** The instruction associated with the block */
    instruction?: Instruction;

    getGroupEditor(): InstructionGroupEditor;
    hasGroupEditor(): boolean;
    getLine(index: number): InstructionLine;
    lineIter(): Generator<InstructionLine>;
}

/** A block of a single instruction */
export class SingleInstructionBlock implements InstructionBlock {
    public parent?: CompositeInstructionBlock | undefined;
    private lines: InstructionLine[] = [];
    public numLines: number = 0;

    constructor(public instruction: Instruction) { }

    public getLine(index: number): InstructionLine {
        return this.lines[index];
    }

    public *lineIter(): Generator<InstructionLine, any, unknown> {
        for (const line of this.lines) {
            yield line;
        }
    }

    public getInstructions(): Instruction[] {
        return [this.instruction];
    }

    public locateInstructionIndex() {
        if (!this.parent) { throw new Error("No parent"); }
        return this.parent.getInstructions().indexOf(this.instruction);
    }

    public locateLineIndex(line: InstructionLine) {
        if (!this.parent) { throw new Error("No parent"); }
        let curr: InstructionBlock | undefined = this;
        let index = this.lines.indexOf(line);
        while (curr.parent) {
            if (!curr.instruction) { throw new Error("Not an instruction"); }
            const parentInstructions = curr.parent.getInstructions();
            const parentIndex = parentInstructions.indexOf(curr.instruction);
            for (let i = 0; i < parentIndex; i++) {
                index += parentInstructions[i].block.numLines;
            }
            curr = curr.parent;
        }
        return index;
    }

    public getGroupEditor(): InstructionGroupEditor {
        if (!this.parent) { throw new Error("No editor attached"); }
        return this.parent.getGroupEditor();
    }

    public hasGroupEditor(): boolean {
        if (this.parent) { return this.parent.hasGroupEditor(); }
        return false;
    }

    /** Insert a line. Only to be used by the owning Instruction class. */
    public _insertLines(index: number, lines: InstructionLine[]) {
        this.lines.splice(index, 0, ...lines);
        for (const line of lines) {
            line._setParent(this.instruction);
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
    /** Child blocks */
    public children: Instruction[] = [];
    public numLines: number = 0;

    public getLine(index: number): InstructionLine {
        let curr = 0;
        for (const child of this.children) {
            if (index < curr + child.block.numLines) {
                return child.block.getLine(index - curr);
            }
            curr += child.block.numLines;
        }

        throw new Error("Line not found");
    }

    public *lineIter(): Generator<InstructionLine, any, unknown> {
        for (const child of this.children) {
            yield* child.block.lineIter();
        }
    }

    public getInstructions(): Instruction[] {
        return this.children;
    }

    public getGroupEditor(): InstructionGroupEditor {
        if (!this.parent) { throw new Error("No editor attached"); }
        return this.parent.getGroupEditor();
    }

    public hasGroupEditor(): boolean {
        if (this.parent) { return this.parent.hasGroupEditor(); }
        return false;
    }

    /** Insert an instruction block. Only to be used by the owning class. */
    public _insertInstruction(index: number, instruction: Instruction) {
        this.children.splice(index, 0, instruction);
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
    public _removeInstruction(index: number) {
        const instruction = this.children.splice(index, 1)[0];
        instruction.block.parent = undefined;

        let curr: InstructionBlock | undefined = this;
        while (curr != undefined) {
            curr.numLines -= instruction.block.numLines;
            curr = curr.parent;
        }
    }
}
