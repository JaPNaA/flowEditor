import { ControlItem } from "../../FlowRunner";

export interface EditorSaveData {
    elms: InstructionElmData[];
    startGroup?: number;
}

export interface InstructionElmData {
    id: number;
    instructions: any[],
    branches: ControlItem[],
    children: number[][];
    x: number;
    y: number;
}
