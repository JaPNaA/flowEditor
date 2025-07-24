import { EditorSaveData } from "../editor/EditorSaveData";
import { FileStructureReadWrite } from "../../filesystem/FileStructure";

export interface Project extends FileStructureReadWrite {
    /** Get the 'start' flow's path */
    getStartFlowSavePath(): string;
    /** Get a flow save */
    getFlowSave(path: string): Promise<EditorSaveData>;
    /** List all flow saves */
    listFlowSaves(): Promise<string[]>;

    /** Write a flow, expecting that the flow didn't exist before. */
    newFlowSave(path: string, data: string, force?: boolean): Promise<ProjectMaybeError>;
    /** Write a flow save. If `force` is true, does not check for external modifications before writing. */
    writeFlowSave(path: string, data: string, force?: boolean): Promise<ProjectMaybeError>;
    /** Move a flow save */
    moveFlowSave(pathFrom: string, pathTo: string): Promise<void>;
    /** Remove a flow save */
    removeFlowSave(path: string): Promise<void>;

    /** Returns true if the flow save was not modified since it's last getFlowSave() call */
    checkIsLatestFlowSave(path: string): Promise<boolean>;
}

export const externallyModifiedError: SomeError = {
    isError: true,
    errorType: Symbol(),
    message: "Refused to write file since the file was detected to have been modified externally since it was opened."
};

export const noError: NoError = { isError: false };

interface NoError {
    isError: false;
}

interface SomeError {
    isError: true;
    errorType: symbol;
    message: string;
}

export type ProjectMaybeError = NoError | SomeError;
