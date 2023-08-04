import { FlowData } from "../../FlowRunner.js";
import { FSReadWrite } from "../../filesystem/FS.js";
import { EventBus } from "../../japnaaEngine2d/JaPNaAEngine2d.js";
import { EditorSaveData } from "../editor/Editor.js";
import { DetectedExternallyModifiedError, Project } from "./Project.js";

export class FileProject implements Project {
    public onReady = new EventBus();

    private static indexFilePath = "flowProject.json";

    private name: string = "";
    private ready = false;
    private cannotOpen = false;

    private indexFile!: string;
    private index!: ProjectIndex;
    private assetsDirectory!: FSReadWrite;
    private flowsDirectory!: FSReadWrite;
    private compiledFlowsDirectory!: FSReadWrite;

    private lastModifiedMap = new Map<string, number>();


    constructor(private fileSystem: FSReadWrite) {
        this.setup();
    }

    public isReady() {
        return this.ready;
    }

    public async getAsset(path: string): Promise<Blob> {
        return this.assetsDirectory.read(path);
    }

    public async listAssets(): Promise<string[]> {
        const items: string[] = [];
        await this.recursiveAddFilesToArray(this.assetsDirectory, "", items);
        return items;
    }

    public async writeAsset(path: string, blob: Blob): Promise<void> {
        return this.assetsDirectory.write(path, blob);
    }

    public async moveAsset(pathFrom: string, pathTo: string): Promise<void> {
        return this.assetsDirectory.mv(pathFrom, pathTo);
    }

    public async removeAsset(path: string): Promise<void> {
        return this.assetsDirectory.rm(path);
    }


    public getStartFlowSavePath(): string {
        return this.index.startFlow;
    }

    public async getFlowSave(path: string): Promise<EditorSaveData> {
        const [data, date] = await Promise.all([
            this.flowsDirectory.read(path)
                .then(blob => blob.text())
                .then(str => JSON.parse(str)),
            this.flowsDirectory.lastModified(path)
        ]);
        if (date) {
            this.lastModifiedMap.set(path, date);
        }
        return data;
    }

    public async listFlowSaves(): Promise<string[]> {
        const items: string[] = [];
        await this.recursiveAddFilesToArray(this.flowsDirectory, "", items);
        return items;
    }

    public async writeFlowSave(path: string, content: string, force?: boolean): Promise<void> {
        const lastModified = await this.flowsDirectory.lastModified(path);
        if (!force) {
            await this.throwIfUnexpectedLastModifiedFlowSave(path, lastModified);
        }

        await this.flowsDirectory.write(path, new Blob([content]));
        const newLastModified = await this.flowsDirectory.lastModified(path);
        if (newLastModified) {
            this.lastModifiedMap.set(path, newLastModified);
        }
    }

    public async moveFlowSave(pathFrom: string, pathTo: string): Promise<void> {
        const lastModified = await this.flowsDirectory.lastModified(pathFrom);
        this.throwIfUnexpectedLastModifiedFlowSave(pathFrom, lastModified);

        await this.flowsDirectory.mv(pathFrom, pathTo);

        if (lastModified !== null) {
            this.lastModifiedMap.set(pathTo, lastModified);
            this.lastModifiedMap.delete(pathFrom);
        }
    }

    public async removeFlowSave(path: string): Promise<void> {
        const lastModified = await this.flowsDirectory.lastModified(path);
        this.throwIfUnexpectedLastModifiedFlowSave(path, lastModified);

        await this.flowsDirectory.rm(path);
    }

    public async checkIsLatestFlowSave(path: string): Promise<boolean> {
        const expectedLastModified = this.lastModifiedMap.get(path);
        if (expectedLastModified === undefined) { return true; }
        const lastModified = await this.flowsDirectory.lastModified(path);
        return lastModified === expectedLastModified;
    }

    public getStartFlowPath_(): string {
        return this.getStartFlowSavePath();
    }

    public async getFlow(path: string): Promise<FlowData> {
        const file = await this.compiledFlowsDirectory.read(path);
        const text = await file.text();
        return JSON.parse(text);
    }

    public async listFlows(): Promise<string[]> {
        const flows: string[] = [];
        await this.recursiveAddFilesToArray(this.compiledFlowsDirectory, "", flows);
        return flows;
    }

    public writeFlow(path: string, data: string): Promise<void> {
        return this.compiledFlowsDirectory.write(path, new Blob([data]));
    }

    public moveFlow(pathFrom: string, pathTo: string): Promise<void> {
        return this.compiledFlowsDirectory.mv(pathFrom, pathTo);
    }

    public removeFlow(path: string): Promise<void> {
        return this.compiledFlowsDirectory.rm(path);
    }

    public flush(): Promise<void> {
        return Promise.resolve();
    }

    private async setup() {
        // open index file
        try {
            await this.fileSystem.read(FileProject.indexFilePath);
            this.indexFile = FileProject.indexFilePath;
            this.name = this.fileSystem.name;
        } catch (err) {
            console.warn(err);

            // no index file
            if (err instanceof DOMException) {
                if ( // create index file?
                    confirm("The selected directory is not a project directory. Would you like to create a project directory?")
                ) {
                    // check directory is empty
                    let empty = (await this.fileSystem.ls("")).length <= 0;

                    if (!empty) {
                        const name = prompt("Please name the project", "Unnamed Flow Project");
                        if (name && name.trim()) {
                            this.name = name.trim();
                        } else {
                            this.name = "Unnamed Flow Project";
                        }

                        await this.fileSystem.mkdir(this.name);
                        this.fileSystem = await this.fileSystem.cd(this.name);
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

        this.index = JSON.parse(JSON.stringify(defaultProjectIndex));
        await this.fileSystem.write(FileProject.indexFilePath, new Blob([JSON.stringify(this.index)]));
        this.indexFile = FileProject.indexFilePath;
        this.flowsDirectory = await this.getOrMakeDirectory(this.index.paths.flows);
        this.assetsDirectory = await this.getOrMakeDirectory(this.index.paths.assets);
        this.compiledFlowsDirectory = await this.getOrMakeDirectory(this.index.paths.compiledFlows!);

        this.setReady();
    }

    private async setupOpenProject() {
        if (this.ready) { throw new Error("Cannot open project after ready"); }

        this.indexFile = FileProject.indexFilePath;
        this.index = {
            ...defaultProjectIndex,
            ...JSON.parse(await ((await this.fileSystem.read(this.indexFile)).text()))
        };
        const paths = {
            ...defaultProjectIndexPaths,
            ...this.index.paths
        };
        this.flowsDirectory = await this.getOrMakeDirectory(paths.flows);
        this.assetsDirectory = await this.getOrMakeDirectory(paths.assets);
        this.compiledFlowsDirectory = await this.getOrMakeDirectory(paths.compiledFlows);

        this.setReady();
    }

    private async getOrMakeDirectory(path: string) {
        try {
            return await this.fileSystem.cd(path);
        } catch (err) {
            await this.fileSystem.mkdir(path);
            return this.fileSystem.cd(path);
        }
    }

    private setReady() {
        if (this.ready) { return; }
        this.ready = true;
        this.onReady.send();
    }

    private async recursiveAddFilesToArray(directory: FSReadWrite, basePath: string, items: string[]) {
        const promises = [];
        for (const item of await directory.ls(basePath)) {
            if (
                item.type === "file" &&
                !item.name.endsWith(".crswap") // ignore swap files Chrome generates
            ) {
                items.push(item.path);
            } else if (item.type === "directory") {
                promises.push(this.recursiveAddFilesToArray(directory, item.path, items));
            }
        }
        await Promise.all(promises);
    }

    private async throwIfUnexpectedLastModifiedFlowSave(path: string, lastModified: number | null): Promise<void> {
        if (lastModified === null) { return; }
        const expectedLastModified = this.lastModifiedMap.get(path);
        if (expectedLastModified !== undefined) {
            if (lastModified !== expectedLastModified) {
                throw new DetectedExternallyModifiedError();
            }
        }
    }
}

interface ProjectIndex {
    paths: ProjectIndexPaths;
    startFlow: string;
}

interface ProjectIndexPaths {
    flows: string;
    assets: string;
    compiledFlows?: string;
}

const defaultProjectIndexPaths: Required<ProjectIndexPaths> = {
    flows: "flows",
    assets: "assets",
    compiledFlows: "flow"
};

const defaultProjectIndex: ProjectIndex = {
    paths: defaultProjectIndexPaths,
    startFlow: "start.json"
};
