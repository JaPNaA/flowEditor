import { JSONInstruction } from "../instruction/JSONInstruction";
import { Instruction } from "../instruction/instructionTypes";

export type Deserializer = (data: any) => Instruction | undefined;

export class InstructionDeserializer {
    private deserializers: Deserializer[] = [];

    public registerDeserializer(deserializer: Deserializer) {
        this.deserializers.push(deserializer);
    }

    public deserialize(data: any): Instruction {
        for (const deserializer of this.deserializers) {
            const result = deserializer(data);
            if (result) {
                return result;
            }
        }
        return new JSONInstruction(data);
    }
}
