import { InstructionGroup } from "../../InstructionGroup";
import { InstructionBlock } from "../block/InstructionBlock";
import { InstructionLine } from "../InstructionLine";

export abstract class Instruction {
    /** Block containing the instruction's lines. Only to be used by InstructionBlock and this class. */
    public abstract block: InstructionBlock;

    /** Return a list of flow control items that perform this instruction */
    public abstract export(): any[];

    /** Return a JSON object that can be used to reconstruct this instruction. */
    public abstract serialize(): any;

    /** Try to remove a line in instruction. Returns true if removed. */
    public abstract removeLine(line: InstructionLine): boolean;

    /**
     * Request inserting a line at (absolute) index.
     * Return true if handled (inserted instruction).
     * If returns false, lets the parent group handle the line insertion.
     */
    public abstract insertLine(index: number): boolean;

    public requestSelectInstructionGroup(): Promise<InstructionGroup | null> {
        const group = this.block.getGroup();
        if (group) {
            return group.group.parentEditor.requestSelectInstructionGroup();
        }
        return Promise.resolve(null);
    }

    /** Is the instruction a branch? */
    public isBranch() {
        return false;
    }

    /**
     * Does this instruction always jump?
     * If returns true, `isBranch` must also return true.
     */
    public isAlwaysJump() {
        return false;
    }

    public getBranchTargets(): (InstructionGroup | null)[] | null {
        return null;
    }

    public setBranchTargets(_targets: (InstructionGroup | null)[] | null) { }

    public setBranchOffsets(_offsets: (number | null)[]) {
        return;
    }
}