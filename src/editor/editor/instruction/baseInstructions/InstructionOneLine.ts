import { InstructionGroup } from "../../InstructionGroup";
import { SingleInstructionBlock } from "../block/SingleInstructionBlock";
import { InstructionLine } from "../components/InstructionLine";
import { BranchInstructionLine } from "../components/BranchInstructionLine";
import { Instruction } from "./Instruction";

export interface OneLineInstruction extends InstructionLine {
    /** Serialize to be loaded into the editor later. Should never throw, even if user input is invalid. */
    serialize(): any;
    /** Export into an executable instructions. May throw if user input is invalid. */
    export?(): any[];
    /** Instruction is a branch? */
    isBranch: boolean;
    /** Does this instruction always jump? */
    isAlwaysJump?: boolean;
}

/**
 * One-line instruction. Allows conviently declaring Instruction and it's line
 * in one class.
 */
export class InstructionOneLine<T extends OneLineInstruction> extends Instruction {
    public block: SingleInstructionBlock = new SingleInstructionBlock(this);

    protected line: T;

    constructor(line: T) {
        super();
        this.line = line;
        this.block._insertLine(0, line);
    }

    public getBranchTargets(): (InstructionGroup | null)[] | null {
        if (this.line instanceof BranchInstructionLine) {
            const branchTarget = this.line.getBranchTarget();
            if (branchTarget) {
                return [branchTarget];
            } else {
                return [null];
            }
        }
        return null;
    }

    public setBranchTargets(targets: (InstructionGroup | null)[] | null): void {
        if (this.line instanceof BranchInstructionLine) {
            this.line.setBranchTarget(targets && targets[0]);
        } else {
            throw new Error("Not a branch");
        }
    }

    public setBranchOffsets(offsets: (number | null)[]): any {
        if (this.line instanceof BranchInstructionLine) {
            return this.line.setBranchOffset(offsets[0] || 1);
        } else {
            throw new Error("Not a branch");
        }
    }

    public isBranch(): boolean {
        return this.line.isBranch;
    }

    public isAlwaysJump(): boolean {
        return this.line.isAlwaysJump || false;
    }

    public removeLine(line: InstructionLine): boolean {
        if (this.line !== line) { throw new Error("Not a line in this instruction"); }
        if (!this.block.parent) { throw new Error("Cannot remove instruction from no parent"); }
        this.block.parent.removeBlock(this.block);
        return true;
    }

    public insertLine(_lineIndex: number): boolean {
        return false;
    }

    public serialize(): any {
        return this.line.serialize();
    }

    public export(): any[] {
        if (this.line.export) {
            return this.line.export();
        } else {
            return [this.line.serialize()];
        }
    }
}