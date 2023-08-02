import { EditorSaveData } from "../editor/Editor.js";
import { EventBus } from "../../japnaaEngine2d/JaPNaAEngine2d.js";
import { DetectedExternallyModifiedError, Project } from "./Project.js";

/**
 * The NullProject is open when the user has not opened any project.
 */
export class NullProject implements Project {
    public onReady = new EventBus();

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

    public getStartFlowPath(): string {
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
            return {
                startGroup: 0,
                elms: [{ branches: [], children: [], instructions: [{ ctrl: 'nop' }, { ctrl: 'end' }], id: 0, x: 8, y: 24 }]
            };
        }
    }

    public async writeFlowSave(path: string, data: string, force?: boolean): Promise<void> {
        if (path !== "localstorage") { throw new Error("Cannot write another file into localstorage"); }
        if (!force && this.lastRead !== localStorage['flowEditorSave']) {
            throw new DetectedExternallyModifiedError();
        }
        localStorage['flowEditorSave'] = data;
        this.lastRead = data;
    }

    public async moveFlowSave(pathFrom: string, pathTo: string): Promise<void> {
        throw new Error("Cannot move flow saves in NullProject");
    }

    public async removeFlowSave(path: string): Promise<void> {
        throw new Error("Cannot remove flow saves in NullProject");
    }

    public async checkIsLatestFlowSave(path: string): Promise<boolean> {
        if (path !== "localstorage") { throw new Error("Cannot check another file in localstorage"); }
        return this.lastRead === localStorage['flowEditorSave'];
    }
}
