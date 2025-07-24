import { EditorSaveData } from "../editor/EditorSaveData";
import { EventBus } from "../../japnaaEngine2d/JaPNaAEngine2d";
import { externallyModifiedError, noError, Project, ProjectMaybeError } from "./Project";
import { FlowData } from "../../FlowRunner";
import { defaultNewEditorSaveData } from "../editor/defaultEditorSaveData";

const nullProjectCannotHaveNewFlows: ProjectMaybeError = {
    isError: true,
    errorType: Symbol(),
    message: "No project is open. Consider creating a project first."
};

/**
 * The NullProject is open when the user has not opened any project.
 */
export class NullProject implements Project {
    public onReady = new EventBus();
    private exportedFlow: string = "";

    private lastRead?: string;

    public isReady(): boolean {
        return true;
    }

    public async listAssets(): Promise<string[]> {
        return [];
    }

    public async getAsset(path: string): Promise<Blob> {
        return (await fetch(path)).blob();
    }

    public async writeAsset(path: string, blob: Blob): Promise<void> {
        throw new Error("Cannot write assets to NullProject");
    }

    public async moveAsset(pathFrom: string, pathTo: string): Promise<void> {
        throw new Error("Cannot move assets in NullProject");
    }

    public async removeAsset(path: string): Promise<void> {
        throw new Error("Cannot remove assets in NullProject");
    }

    public getStartFlowSavePath(): string {
        return "localstorage";
    }

    public async listFlowSaves(): Promise<string[]> {
        return ["localstorage"];
    }

    public async getFlowSave(path: string): Promise<EditorSaveData> {
        if (path !== "localstorage") { throw new Error("Flow not found"); }
        const stored = localStorage['flowEditorSave'];
        this.lastRead = stored;
        if (stored) {
            return JSON.parse(stored);
        } else {
            return defaultNewEditorSaveData;
        }
    }

    public async newFlowSave(_path: string, _data: string, _force?: boolean): Promise<ProjectMaybeError> {
        return nullProjectCannotHaveNewFlows;
    }

    public async writeFlowSave(path: string, data: string, force?: boolean): Promise<ProjectMaybeError> {
        if (path !== "localstorage") { throw new Error("Cannot write another file into localstorage"); }
        if (!force && this.lastRead !== localStorage['flowEditorSave']) {
            return externallyModifiedError;
        }
        localStorage['flowEditorSave'] = data;
        this.lastRead = data;
        return noError;
    }

    public async moveFlowSave(pathFrom: string, pathTo: string): Promise<void> {
        throw new Error("Cannot move flow saves in NullProject");
    }

    public async removeFlowSave(path: string): Promise<void> {
        throw new Error("Cannot remove flow saves in NullProject");
    }

    public writeFlow(path: string, data: string): Promise<void> {
        if (path !== "localstorageExported") {
            throw new Error("Cannot write to other flows in NullProject");
        }
        this.exportedFlow = data;
        return Promise.resolve();
    }

    public moveFlow(pathFrom: string, pathTo: string): Promise<void> {
        throw new Error("Cannot move flows in NullProject");
    }

    public removeFlow(path: string): Promise<void> {
        throw new Error("Cannot remove flows in NullProject");
    }

    public getStartFlowPath(): string {
        return "localstorageExported";
    }

    public getFlow(path: string): Promise<FlowData> {
        if (path !== "localstorageExported") {
            throw new Error("Cannot access other flows in NullProject");
        }
        return Promise.resolve(JSON.parse(this.exportedFlow));
    }

    public listFlows(): Promise<string[]> {
        return Promise.resolve(["localstorageExported"]);
    }

    public flush(): Promise<void> {
        return Promise.resolve();
    }

    public async checkIsLatestFlowSave(path: string): Promise<boolean> {
        if (path !== "localstorage") { throw new Error("Cannot check another file in localstorage"); }
        return this.lastRead === localStorage['flowEditorSave'];
    }
}
