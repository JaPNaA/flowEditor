import { EditorSaveData } from "../editor/Editor.js";
import { FileStructureReadWrite } from "../../filesystem/FileStructure.js";

export interface Project extends FileStructureReadWrite {
    /** Get the 'start' flow's path */
    getStartFlowSavePath(): string;
    /** Get a flow save */
    getFlowSave(path: string): Promise<EditorSaveData>;
    /** List all flow saves */
    listFlowSaves(): Promise<string[]>;

    /** Write a flow save. If force is true, does not check for external modifications before writing. */
    writeFlowSave(path: string, data: string, force?: boolean): Promise<void>;
    /** Move a flow save */
    moveFlowSave(pathFrom: string, pathTo: string): Promise<void>;
    /** Remove a flow save */
    removeFlowSave(path: string): Promise<void>;

    /** Returns true if the flow save was not modified since it's last getFlowSave() call */
    checkIsLatestFlowSave(path: string): Promise<boolean>;
}

export class DetectedExternallyModifiedError extends Error {
    constructor() {
        super("Refused to write file since the file was detected to have been modified externally since it was opened.");
    }
}
