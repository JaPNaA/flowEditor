import { EditorSaveData } from "../editor/Editor";
import { EventBus } from "../japnaaEngine2d/JaPNaAEngine2d";

export interface Project {
    /** Event fired when ready. */
    onReady: EventBus<void>;
    /** Returns true if the project is ready */
    isReady(): boolean;
    /** Get an asset file */
    getAsset(path: string): Promise<Blob>;
    /** List all asset files */
    listAssets(): Promise<string[]>;
    /** Get the 'start' flow's path */
    getStartFlowPath(): string;
    /** Get a flow save */
    getFlowSave(path: string): Promise<EditorSaveData>;
    /** List all flow saves */
    listFlowSaves(): Promise<string[]>;
    /** Write a flow save. If force is true, does not check for external modifications before writing. */
    writeFlowSave(path: string, data: string, force?: boolean): Promise<void>;
    /** Returns true if the flow save was not modified since it's last getFlowSave() call */
    checkIsLatestFlowSave(path: string): Promise<boolean>;
}

export class DetectedExternallyModifiedError extends Error {
    constructor() {
        super("Refused to write file since the file was detected to have been modified externally since it was opened.");
    }
}
