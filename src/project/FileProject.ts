import { Project } from "./Project.js";
import { EditorSaveData } from "../editor/Editor.js";
import { EventBus } from "../japnaaEngine2d/JaPNaAEngine2d.js";

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

    public getStartFlowPath(): string {
        return this.index.startFlow;
    }

    public async getFlowSave(path: string): Promise<EditorSaveData> {
        return JSON.parse(await this.flowsDirectory.getFileHandle(path)
            .then(handle => handle.getFile())
            .then(file => file.text()));
    }

    public async writeFlowSave(path: string, content: string): Promise<void> {
        return this.flowsDirectory.getFileHandle(path, { create: true })
            .then(handle => handle.createWritable())
            .then(async writable => {
                await writable.write(content);
                await writable.close();
            });
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
