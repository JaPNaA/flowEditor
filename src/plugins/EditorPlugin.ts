import { Instruction } from "../editor/instructionLines";

export interface EditorPlugin {
    keyMappings: { [x: string]: () => Instruction };
    parse(data: any): Instruction | undefined;
    executer: Executer;
}

export interface Executer {
    run(data: any): Promise<void> | null;
}
