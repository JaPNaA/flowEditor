import { Instruction } from "../editor/instructionLines";
import { ExecuterContainer } from "../executer/ExecuterContainer";

export interface EditorPlugin {
    keyMappings: { [x: string]: () => Instruction };
    parse(data: any): Instruction | undefined;
    executer: Executer;
}

export interface Executer {
    start(executerContainer: ExecuterContainer): Promise<void>;
    run(data: any): Promise<void> | null;
    stop(): Promise<void>;
}
