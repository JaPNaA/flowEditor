import { AutoCompleteSuggester } from "../editor/editing/AutoComplete";
import { InstructionBlueprintMin } from "../editor/instruction/InstructionBlueprintRegistery";
import { Instruction } from "../editor/instruction/instructionTypes";
import { ExecuterContainer } from "../executer/ExecuterContainer";

export interface EditorPlugin {
    name: string;
    instructionBlueprints: InstructionBlueprintMin[];
    parse(data: any): Instruction | undefined;
    executer?: Executer;
    autocomplete?: [symbol, AutoCompleteSuggester][];
}

export interface Executer {
    start(executerContainer: ExecuterContainer): Promise<void>;
    run(data: any): Promise<void> | null;
    stop(): Promise<void>;
    setState(state: any): void;
    getState(): any;
}
