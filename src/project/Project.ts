import { EditorSaveData } from "../editor/Editor";
import { EventBus } from "../japnaaEngine2d/JaPNaAEngine2d";

export interface Project {
    onReady: EventBus<void>;
    isReady(): boolean;
    getAsset(path: string): Promise<Blob>;
    getStartFlowPath(): string;
    getFlowSave(path: string): Promise<EditorSaveData>;
    writeFlowSave(path: string, data: string): Promise<void>;
}
