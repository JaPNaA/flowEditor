import { InstructionBlueprintMin } from "../editor/InstructionBlueprintRegistery";
import { Instruction } from "../editor/instructionLines";
import { ExecuterContainer } from "../executer/ExecuterContainer";

export interface EditorPlugin {
    instructionBlueprints: InstructionBlueprintMin[];
    parse(data: any): Instruction | undefined;
    executer: Executer;
}

export interface Executer {
    start(executerContainer: ExecuterContainer): Promise<void>;
    run(data: any): Promise<void> | null;
    stop(): Promise<void>;
}
