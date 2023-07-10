import { InstructionLineView } from "../editor/instructionLines.js";

export interface EditorPlugin {
    views: InstructionLineView[];
    keyMappings: { [x: string]: () => InstructionLineView };
    parse(data: any): InstructionLineView | undefined;
    executer: Executer;
}

export interface Executer {
    run(data: any): Promise<void> | null;
}
