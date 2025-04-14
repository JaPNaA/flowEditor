import { Instruction } from "../instruction/baseInstructions/Instruction";
import { CompositeInstructionBlock } from "../instruction/block/CompositeInstructionBlock";
import { JSONInstruction } from "../instruction/JSONInstruction";

export type Deserializer = (data: any, parentBlock: CompositeInstructionBlock) => Instruction | undefined;

export class InstructionDeserializer {
    private deserializers: Deserializer[] = [];

    public registerDeserializer(deserializer: Deserializer) {
        this.deserializers.push(deserializer);
    }

    public deserialize(data: any, parentBlock: CompositeInstructionBlock): Instruction {
        for (const deserializer of this.deserializers) {
            const result = deserializer(data, parentBlock);
            if (result) {
                return result;
            }
        }
        return new JSONInstruction(data);
    }
}
