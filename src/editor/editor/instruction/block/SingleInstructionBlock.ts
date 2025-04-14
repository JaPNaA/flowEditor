import { ActionBusDispatchable } from "../../editing/actions/ActionBus";
import { Instruction } from "../baseInstructions/Instruction";
import { InstructionLine } from "../components/InstructionLine";
import { CompositeInstructionBlock, InstructionGroupBlock } from "./CompositeInstructionBlock";
import { InstructionBlock } from "./InstructionBlock";

/** A block of a single instruction */
export class SingleInstructionBlock implements InstructionBlock {
    public parent?: CompositeInstructionBlock | undefined;
    private lines: InstructionLine[] = [];
    public numLines: number = 0;

    public actionBus = new ActionBusDispatchable();

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

    public getGroup(): InstructionGroupBlock | undefined {
        if (!this.parent) { return; }
        return this.parent.getGroup();
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

        const group = this.getGroup();
        if (group) {
            group.group.editor._insertInstructionLine(group.locateLine(line) + 1, line);
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

        const group = this.getGroup();
        if (group) {
            group.group.editor._removeInstructionLine(removedLine[0]);
        }
    }
}
