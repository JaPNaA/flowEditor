import { EditorSaveData } from "../editor/Editor.js";
import { EventBus } from "../japnaaEngine2d/JaPNaAEngine2d.js";
import { Project } from "./Project.js";

/**
 * The NullProject is open when the user has not opened any project.
 */
export class NullProject implements Project {
    public onReady = new EventBus();

    public isReady(): boolean {
        return true;
    }

    public async getAsset(path: string): Promise<Blob> {
        return (await fetch(path)).blob();
    }

    public getStartFlowPath(): string {
        return "localstorage";
    }

    public async getFlowSave(path: string): Promise<EditorSaveData> {
        if (path !== "localstorage") { throw new Error("Flow not found"); }
        if (localStorage['flowEditorSave']) {
            return JSON.parse(localStorage['flowEditorSave']);
        } else {
            return { elms: [] };
        }
    }

    public async writeFlowSave(path: string, data: string): Promise<void> {
        if (path !== "localstorage") { throw new Error("Cannot write another file into localstorage"); }
        localStorage['flowEditorSave'] = data;
    }
}
