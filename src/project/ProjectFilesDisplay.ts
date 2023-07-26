import { appHooks } from "../index.js";
import { Component, Elm } from "../japnaaEngine2d/elements.js";
import { FileProject } from "./FileProject.js";
import { NullProject } from "./NullProject.js";
import { Project } from "./Project.js";

export class ProjectFilesDisplay extends Component {
    private project!: Project;
    private nullProjectElm: Elm;
    private directoryTabs?: DirectoryTabs;

    constructor(project: Project) {
        super("projectFilesDisplay");
        this.nullProjectElm = new Elm().class("nullProjectNotice").append("No project open.");
        if ('showDirectoryPicker' in window) {
            this.nullProjectElm.append(new Elm().append("Click to open or create project."));
        } else {
            this.nullProjectElm.replaceContents(
                new Elm().append("Your browser does not support projects."),
                new Elm().append("(Your browser does not support the File Access API.)"),
                new Elm().append("At time of writing, only the latest Chromium-based browsers (Chrome, Edge, Opera, Brave, etc.) support the File Access API.")
            );
        }

        this.elm.onActivate(async () => {
            if (!(this.project instanceof NullProject)) { return; }
            if (!('showDirectoryPicker' in window)) {
                alert("Your browser does not support this feature.");
                return;
            }
            const handle = await showDirectoryPicker({ mode: "readwrite" });
            await handle.requestPermission({ mode: "readwrite" });
            const project = new FileProject(handle);
            appHooks.openProject(project);
        });

        this.setProject(project);
    }

    public setProject(project: Project) {
        this.project = project;

        if (project instanceof NullProject) {
            this.elm.replaceContents(this.nullProjectElm);
            this.elm.class("nullProject");
            return;
        }

        this.directoryTabs = new DirectoryTabs(project);

        this.elm.removeClass("nullProject");
        this.elm.replaceContents(this.directoryTabs);
    }
}

class DirectoryTabs extends Component {
    private tabs: DirectoryTab[] = [];
    private tabContent = new Elm().class("tabContent");
    private tabsElm = new Elm().class("tabs");

    constructor(project: Project) {
        super("directoryTabs");

        this.elm.append(
            this.tabsElm, this.tabContent
        );

        this.tabContent.on("wheel", ev => ev.stopPropagation());
        const assetsTab = new AssetsDirectoryTab(this, project);
        this.addTab(new FlowsDirectoryTab(this, project));
        this.addTab(assetsTab);
        assetsTab.show();
    }

    public _deactivateAllTabs() {
        for (const tab of this.tabs) {
            tab.button.removeClass("active");
        }
    }

    public _setContent(content: Elm) {
        this.tabContent.replaceContents(content);
    }

    private addTab(tab: DirectoryTab) {
        this.tabs.push(tab);
        this.tabsElm.append(tab.button);
    }
}

class FileItem extends Component {
    constructor(private filename: string) {
        super("item");
        this.elm.append(filename);
    }
}

abstract class DirectoryTab {
    public button = new Elm("button");
    public content = new Elm().class("items");

    constructor(
        private parentTabs: DirectoryTabs,
        protected project: Project,
        name: string
    ) {
        this.button.append(name);

        this.button.onActivate(() => {
            this.show();
        });

        this.content.on("drop", async ev => {
            ev.preventDefault();
            if (!ev.dataTransfer) { return; }
            for (const file of ev.dataTransfer.files) {
                this.writeItem(file.name, file);
            }
            this.refresh();
        });
        this.content.on("dragover", ev => {
            ev.preventDefault();
            if (ev.dataTransfer) {
                ev.dataTransfer.dropEffect = "copy";
            }
        });

        this.refresh();
    }

    public show() {
        this.parentTabs._deactivateAllTabs();
        this.button.class("active");
        this.parentTabs._setContent(this.content);
    }

    public async refresh(): Promise<void> {
        this.content.clear();
    }

    public abstract writeItem(path: string, content: File): Promise<void>;
    public abstract moveItem(pathFrom: string, pathTo: string): Promise<void>;
    public abstract removeItem(path: string): Promise<void>;
}

class AssetsDirectoryTab extends DirectoryTab {
    constructor(parentTabs: DirectoryTabs, project: Project) {
        super(parentTabs, project, "Assets");
    }

    public async refresh(): Promise<void> {
        await super.refresh();

        if (!this.project.isReady()) { await this.project.onReady.promise(); }
        this.project.listAssets()
            .then(assets => {
                assets.sort();
                for (const asset of assets) {
                    this.content.append(new FileItem(asset));
                }
            });
    }

    public async writeItem(path: string, content: Blob): Promise<void> {
        await this.project.writeAsset(path, content);
    }

    public async moveItem(pathFrom: string, pathTo: string): Promise<void> {
        throw new Error("Method not implemented.");
    }

    public async removeItem(path: string): Promise<void> {
        throw new Error("Method not implemented.");
    }
}

class FlowsDirectoryTab extends DirectoryTab {
    constructor(parentTabs: DirectoryTabs, project: Project) {
        super(parentTabs, project, "Flows");
    }

    public async refresh(): Promise<void> {
        await super.refresh();

        if (!this.project.isReady()) { await this.project.onReady.promise(); }
        this.project.listFlowSaves()
            .then(flows => {
                flows.sort();
                for (const flow of flows) {
                    this.content.append(new FileItem(flow));
                }
            });
    }

    public async writeItem(path: string, content: File): Promise<void> {
        await this.project.writeFlowSave(path, await content.text());
    }

    public async moveItem(pathFrom: string, pathTo: string): Promise<void> {
        throw new Error("Method not implemented.");
    }

    public async removeItem(path: string): Promise<void> {
        throw new Error("Method not implemented.");
    }
}
