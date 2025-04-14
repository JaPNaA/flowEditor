import { Instruction } from "../baseInstructions/Instruction";
import { InstructionBlueprintRegistery } from "../InstructionBlueprintRegistery";
import { InstructionLine } from "../components/InstructionLine";
import { CompositeInstructionBlock } from "./CompositeInstructionBlock";
import { SingleInstructionBlock } from "./SingleInstructionBlock";

export class CompositeInstructionBlockWithOpeningLine<T extends InstructionLine> extends CompositeInstructionBlock {
    constructor(public openingLine: T, blueprintRegistery: InstructionBlueprintRegistery, public instruction: Instruction) {
        super();
        this.blueprintRegistery = blueprintRegistery;

        const openingBlock = new SingleInstructionBlock();
        openingBlock._appendLine(openingLine);
        this._appendBlock(openingBlock);
    }
}
