import { appHooks } from "../index.js";
import { Component, Elm } from "../japnaaEngine2d/elements.js";
import { FileProject } from "./FileProject.js";
import { NullProject } from "./NullProject.js";
import { Project } from "./Project.js";

export class ProjectFilesDisplay extends Component {
    private project!: Project;
    private nullProjectElm: Elm;
    private contentElm: Elm;
    private itemsElm: Elm;
    private lastActiveTab?: Elm<"button">;

    private tabsFlowsButton: Elm<"button">;
    private tabsAssetsButton: Elm<"button">;

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

        this.contentElm = new Elm().class("content").append(
            new Elm().class("tabs").append(
                this.tabsFlowsButton = new Elm("button").append("Flows")
                    .onActivate(() => {
                        if (this.lastActiveTab) { this.lastActiveTab.removeClass("active"); }
                        this.lastActiveTab = this.tabsFlowsButton;
                        this.lastActiveTab.class("active");
                        this.showFlows();
                    }),
                this.tabsAssetsButton = new Elm("button").append("Assets").class("active")
                    .onActivate(() => {
                        if (this.lastActiveTab) { this.lastActiveTab.removeClass("active"); }
                        this.lastActiveTab = this.tabsAssetsButton;
                        this.lastActiveTab.class("active");
                        this.showAssets();
                    })
            ),
            this.itemsElm = new Elm().class("items")
        );
        this.itemsElm.on("wheel", ev => ev.stopPropagation());
        this.setProject(project);
    }

    public setProject(project: Project) {
        this.project = project;

        if (project instanceof NullProject) {
            this.elm.replaceContents(this.nullProjectElm);
            this.elm.class("nullProject");
            return;
        }

        this.elm.removeClass("nullProject");
        this.elm.replaceContents(this.contentElm);

        (project.isReady() ? Promise.resolve() : project.onReady.promise())
            .then(() => this.showAssets());
    }

    public async showAssets() {
        if (!this.project.isReady()) { return; }
        const assets = await this.project.listAssets();
        this.writeItems(assets);
    }

    public async showFlows() {
        if (!this.project.isReady()) { return; }
        const flows = await this.project.listFlowSaves();
        this.writeItems(flows);
    }

    private writeItems(items: string[]) {
        this.itemsElm.clear();

        items.sort();
        for (const item of items) {
            this.itemsElm.append(
                new Elm().class("item").append(item)
            );
        }
    }
}
