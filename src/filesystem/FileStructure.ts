import { FlowData } from "../FlowRunner.js";
import { EventBus } from "../japnaaEngine2d/JaPNaAEngine2d.js";

/** Filesystem used while editing or exporting */
export interface FileStructureReadWrite extends FileStructureRead {
    /** Write an asset file */
    writeAsset(path: string, blob: Blob): Promise<void>;
    /** Move an asset file */
    moveAsset(pathFrom: string, pathTo: string): Promise<void>;
    /** Remove an asset file */
    removeAsset(path: string): Promise<void>;

    /** Write a flow save. If force is true, does not check for external modifications before writing. */
    writeFlow(path: string, data: string): Promise<void>;
    /** Move a flow save */
    moveFlow(pathFrom: string, pathTo: string): Promise<void>;
    /** Remove a flow save */
    removeFlow(path: string): Promise<void>;

    /** Flush any cached files to disk. */
    flush(): Promise<void>;
}

/** Filesystem used in exported version */
export interface FileStructureRead {
    /** Event fired when ready. */
    onReady: EventBus<void>;
    /** Returns true if the filesystem is ready */
    isReady(): boolean;

    /** Get an asset file */
    getAsset(path: string): Promise<Blob>;
    /** List all asset files */
    listAssets(): Promise<string[]>;

    /** Get the 'start' flow's path */
    getStartFlowPath(): string;
    /** Get flow */
    getFlow(path: string): Promise<FlowData>;
    /** List all flow saves */
    listFlows(): Promise<string[]>;
}

export class DetectedExternallyModifiedError extends Error {
    constructor() {
        super("Refused to write file since the file was detected to have been modified externally since it was opened.");
    }
}
