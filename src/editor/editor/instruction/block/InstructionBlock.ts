import { ActionBusDispatchable } from "../../editing/actions/ActionBus";
import { Instruction } from "../baseInstructions/Instruction";
import { InstructionLine } from "../components/InstructionLine";
import { CompositeInstructionBlock, InstructionGroupBlock } from "./CompositeInstructionBlock";

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
    children?: ReadonlyArray<InstructionBlock>;
    /** Total number of lines in this block */
    numLines: number;

    /** The instruction associated with the block */
    instruction?: Instruction;
    /** Action bus for this instruction block */
    actionBus: ActionBusDispatchable;

    /** Traverse up to the root group editor, if one exists. */
    getGroup(): InstructionGroupBlock | undefined;

    /** Get a line by index inside this block. */
    getLine(index: number): InstructionLine;
    /** Returns the index of a line inside this block. */
    locateLine(line: InstructionLine): number;

    /** Traverse parents to find a parent with an associated instruction */
    parentInstruction(): Instruction | undefined;

    /** Iterator through all lines. */
    lineIter(): Generator<InstructionLine>;
}
