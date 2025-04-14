import { CompositeInstructionBlockWithOpeningLine } from "../block/CompositeInstructionBlockWithOpeningLine";
import { InstructionBlueprintRegistery } from "../InstructionBlueprintRegistery";
import { InstructionLine } from "../InstructionLine";
import { NewInstruction } from "../NewInstruction";
import { Instruction } from "./Instruction";

export abstract class InstructionComposite<T extends InstructionLine> extends Instruction {
    public block: CompositeInstructionBlockWithOpeningLine<T>;
    // public childInstructions: Instruction[] = [];

    constructor(protected openingLine: T, instructionRegistery: InstructionBlueprintRegistery) {
        super();
        this.block = new CompositeInstructionBlockWithOpeningLine(
            this.openingLine,
            instructionRegistery,
            this
        );
    }

    public insertLine(index: number): boolean {
        console.log("Composite insert", index);
        const newInstruction = new NewInstruction(this.block);
        this.block.insertBlock(index, newInstruction.block);
        return true;
    }

    public removeLine(line: InstructionLine): boolean {
        if (line == this.openingLine) {
            this.block.parent?.removeBlock(this.block);
            return true;
        }
        return false;
    }
}
