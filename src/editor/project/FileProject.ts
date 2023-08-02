import { DetectedExternallyModifiedError, Project } from "./Project.js";
import { EditorSaveData } from "../editor/Editor.js";
import { EventBus } from "../../japnaaEngine2d/JaPNaAEngine2d.js";

export class FileProject implements Project {
    public onReady = new EventBus();

    private static indexFilePath = "flowProject.json";

    private name: string = "";
    private ready = false;
    private cannotOpen = false;

    private indexFile!: FileSystemFileHandle;
    private index!: ProjectIndex;
    private assetsDirectory!: FileSystemDirectoryHandle;
    private flowsDirectory!: FileSystemDirectoryHandle;

    private lastModifiedMap = new Map<string, number>();

    constructor(private directoryHandle: FileSystemDirectoryHandle) {
        this.setup();
    }

    public isReady() {
        return this.ready;
    }

    public async getAsset(path: string): Promise<Blob> {
        return new Blob([
            await this.assetsDirectory.getFileHandle(path)
                .then(handle => handle.getFile())
                .then(file => file.arrayBuffer())
        ]);
    }

    public async listAssets(): Promise<string[]> {
        const items: string[] = [];
        await this.recursiveAddFilesToArray(this.assetsDirectory, "", items);
        return items;
    }

    public async writeAsset(path: string, blob: Blob): Promise<void> {
        const handle = await this.assetsDirectory.getFileHandle(path, { create: true });
        const writable = await handle.createWritable();
        await writable.write(blob);
        writable.close();
    }

    public async moveAsset(pathFrom: string, pathTo: string): Promise<void> {
        const handle = await this.assetsDirectory.getFileHandle(pathFrom);
        // @ts-ignore -- not defined in Global.d.ts, but exists in chrome
        return handle.move(pathTo);
    }

    public async removeAsset(path: string): Promise<void> {
        const handle = await this.assetsDirectory.getFileHandle(path);
        // @ts-ignore -- not defined in Global.d.ts, but exists in chrome
        return handle.remove();
    }


    public getStartFlowPath(): string {
        return this.index.startFlow;
    }

    public async getFlowSave(path: string): Promise<EditorSaveData> {
        const file = await this.flowsDirectory.getFileHandle(path)
            .then(handle => handle.getFile());
        this.lastModifiedMap.set(path, file.lastModified);
        return JSON.parse(await file.text());
    }

    public async listFlowSaves(): Promise<string[]> {
        const items: string[] = [];
        await this.recursiveAddFilesToArray(this.flowsDirectory, "", items);
        return items;
    }

    public async writeFlowSave(path: string, content: string, force?: boolean): Promise<void> {
        const handle = await this.flowsDirectory.getFileHandle(path, { create: true });
        if (!force) {
            this.throwIfUnexpectedLastModifiedFlowSave(path, handle);
        }

        const writable = await handle.createWritable();
        await writable.write(content);
        await writable.close();
        this.lastModifiedMap.set(path, (await handle.getFile()).lastModified);
    }

    public async moveFlowSave(pathFrom: string, pathTo: string): Promise<void> {
        const handle = await this.flowsDirectory.getFileHandle(pathFrom);
        const expectedLastModified = await this.throwIfUnexpectedLastModifiedFlowSave(pathFrom, handle);
        // @ts-ignore -- not defined in Global.d.ts, but exists in chrome
        await handle.move(pathTo);
        if (expectedLastModified !== undefined) {
            this.lastModifiedMap.set(pathTo, expectedLastModified);
            this.lastModifiedMap.delete(pathFrom);
        }
    }

    public async removeFlowSave(path: string): Promise<void> {
        const handle = await this.flowsDirectory.getFileHandle(path);
        await this.throwIfUnexpectedLastModifiedFlowSave(path, handle);
        // @ts-ignore -- not defined in Global.d.ts, but exists in chrome
        await handle.remove();
        this.lastModifiedMap.delete(path);
    }

    public async checkIsLatestFlowSave(path: string): Promise<boolean> {
        const expectedLastModified = this.lastModifiedMap.get(path);
        if (expectedLastModified === undefined) { return true; }
        const handle = await this.flowsDirectory.getFileHandle(path);
        const file = await handle.getFile();
        const lastModified = file.lastModified;
        return lastModified === expectedLastModified;
    }

    private async setup() {
        // open index file
        try {
            this.indexFile = await this.directoryHandle.getFileHandle(FileProject.indexFilePath);
            this.name = this.directoryHandle.name;
        } catch (err) {
            console.warn(err);

            // no index file
            if (err instanceof DOMException) {
                if ( // create index file?
                    confirm("The selected directory is not a project directory. Would you like to create a project directory?")
                ) {
                    // check directory is empty
                    let empty = true;
                    for await (const _ of this.directoryHandle.values()) {
                        empty = false;
                        break;
                    }

                    if (!empty) {
                        const name = prompt("Please name the project", "Unnamed Flow Project");
                        if (name && name.trim()) {
                            this.name = name.trim();
                        } else {
                            this.name = "Unnamed Flow Project";
                        }

                        this.directoryHandle = await this.directoryHandle.getDirectoryHandle(this.name, { create: true });
                    }

                    try {
                        await this.setupNewProject();
                    } catch (err) { alert("Error while setting up new project."); console.error(err); }
                } else {
                    this.cannotOpen = true;
                }
            }
            return;
        }

        try {
            await this.setupOpenProject();
        } catch (err) { alert("Error while opening project."); console.error(err); }
    }

    private async setupNewProject() {
        if (this.ready) { throw new Error("Cannot setup new project after ready"); }

        this.index = JSON.parse(JSON.stringify(initialProjectIndex));
        this.indexFile = await this.directoryHandle.getFileHandle(FileProject.indexFilePath, { create: true });
        const writer = (await this.indexFile.createWritable()).getWriter();
        await writer.write(JSON.stringify(this.index));
        await writer.close();

        this.flowsDirectory = await this.directoryHandle.getDirectoryHandle(this.index.paths.flows, { create: true });
        this.assetsDirectory = await this.directoryHandle.getDirectoryHandle(this.index.paths.assets, { create: true });

        this.setReady();
    }

    private async setupOpenProject() {
        if (this.ready) { throw new Error("Cannot open project after ready"); }

        this.index = JSON.parse(await (await this.indexFile.getFile()).text());
        this.flowsDirectory = await this.directoryHandle.getDirectoryHandle(this.index.paths.flows);
        this.assetsDirectory = await this.directoryHandle.getDirectoryHandle(this.index.paths.assets);

        this.setReady();
    }

    private setReady() {
        if (this.ready) { return; }
        this.ready = true;
        this.onReady.send();
    }

    private async recursiveAddFilesToArray(directory: FileSystemDirectoryHandle, basePath: string, items: string[]) {
        const promises = [];
        for await (const item of directory.values()) {
            if (
                item.kind === "file" &&
                !item.name.endsWith(".crswap") // ignore swap files Chrome generates
            ) {
                items.push(basePath + item.name);
            } else if (item.kind === "directory") {
                promises.push(this.recursiveAddFilesToArray(item, basePath + item.name + "/", items));
            }
        }
        await Promise.all(promises);
    }

    private async throwIfUnexpectedLastModifiedFlowSave(path: string, handle: FileSystemFileHandle): Promise<number | undefined> {
        const expectedLastModified = this.lastModifiedMap.get(path);
        if (expectedLastModified !== undefined) {
            const lastModified = (await handle.getFile()).lastModified;
            if (lastModified !== expectedLastModified) {
                throw new DetectedExternallyModifiedError();
            }
            return lastModified;
        }
    }
}

interface ProjectIndex {
    paths: {
        flows: string;
        assets: string;
    };
    startFlow: string;
}

const initialProjectIndex: ProjectIndex = {
    paths: {
        flows: "flows",
        assets: "assets"
    },
    startFlow: "start.json"
};
