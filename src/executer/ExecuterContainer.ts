import { FlowRunner, FlowRunnerOutput, FlowRunnerState } from "../FlowRunner.js";
import { appHooks, pluginHooks } from "../index.js";
import { Component, Elm } from "../japnaaEngine2d/JaPNaAEngine2d.js";
import { removeElmFromArray } from "../japnaaEngine2d/util/removeElmFromArray.js";
import { FileProject } from "../project/FileProject.js";
import { Project } from "../project/Project.js";
import { requestFile } from "../utils.js";

export class ExecuterContainer extends Component {
    public log = new OutputLog();
    private input = new ChooseInput();
    private runner?: FlowRunner;
    private paused = false;
    private lastChoice: any[] = [];
    private outputDisplays: Elm;
    private resizeHandle = new ResizeHandle(this);
    private saves = new StateSaver(this);

    constructor(private project: Project) {
        super("executerContainer");

        this.elm.append(
            this.resizeHandle,
            new Elm().class("fileOperationsBar", "operationsBar").append(
                new Elm("button").append("Run").onActivate(() => this.execute()),
                new Elm("button").append("Save").onActivate(() =>
                    appHooks.saveEditor()
                    // download(
                    //     stringToBlob(JSON.stringify(appHooks.getEditorSaveData())),
                    //     "flowEditorSave.json"
                    // )
                ),
                new Elm("button").append("Load").onActivate(() =>
                    requestFile()
                        .then(file => file.text())
                        .then(text => appHooks.setEditorSaveData(JSON.parse(text)))
                ),
                new Elm("button").append("Open Project").onActivate(async () => {
                    if (!('showDirectoryPicker' in window)) {
                        alert(
                            "Your browser does not support this feature (yet).\n" +
                            "At time of writing, only the latest Chromium-based browsers (Chrome, Edge, Opera, Brave, etc.) support this feature."
                        );
                        return;
                    }
                    const handle = await showDirectoryPicker({ mode: "readwrite" });
                    await handle.requestPermission({ mode: "readwrite" });
                    const project = new FileProject(handle);
                    appHooks.openProject(project);
                }),
                new Elm("button").append("Delete all").class("deleteAndReload").onActivate(() => {
                    if (confirm("Delete editor contents and reload?")) {
                        appHooks.setEditorSaveData(null);
                    }
                })
            ),
            this.outputDisplays = new Elm().class("outputDisplays"),
            this.saves,
            this.log,
            this.input
        );

        this.resizeHandle.collapse();
        this.input.selectCallback = choice => {
            if (!this.runner) { return; }
            this.runner.input(choice);
            this.log.logSecondary("<- " + this.lastChoice[choice]);
            this.continueExecute();
        };
    }

    public getProject() {
        return this.project;
    }

    public setProject(project: Project) {
        this.project = project;
    }

    public writeVariable(key: string, value: number) {
        this.runner?.setVariable(key, value);
    }

    public getVariable(key: string): number | undefined {
        return this.runner?.getVariable(key);
    }

    public addOutputDisplay(elm: Elm) {
        this.outputDisplays.append(elm);
    }

    public execute() {
        const compiled = appHooks.getCompiledFlowFromEditor();
        this.resizeHandle.uncollapse();
        this.log.clear();
        this.input.clear();
        pluginHooks.stopExecution();
        this.runner = new FlowRunner({ flow: compiled });
        this.saves.setFlowRunner(this.runner);
        pluginHooks.startExecution();
        this.continueExecute();
    }

    private continueExecute() {
        if (!this.runner) { return; }
        this.paused = false;
        while (this.runner.isActive() && !this.paused) {
            this.runner.runOne();
            this.processOutput(this.runner.getOutput());
        }
        if (!this.runner.isActive()) {
            this.log.logSecondary("-- End --");
        }
    }

    private processOutput(output: FlowRunnerOutput | null) {
        if (!output) { return; }
        if (output.type === "default") {
            const promise = pluginHooks.runInstruction(output.data);
            if (promise) {
                this.paused = true;
                promise.then(() => {
                    this.paused = false;
                    this.continueExecute();
                });
            } else {
                this.log.log(JSON.stringify(output.data));
            }
        } else if (output.type === "input") {
            this.input.requestChoice(output.choices);
            this.lastChoice = output.choices;
            this.paused = true;
        }
    }
}

class OutputLog extends Component {
    constructor() {
        super("outputLog");

        this.elm.on("wheel", ev => ev.stopPropagation());
    }

    public log(text: string) {
        this.elm.append(new Elm().class("log").append(text));
        this.scrollToBottom();
    }

    public logSecondary(text: string) {
        this.elm.append(new Elm().class("log").class("secondary").append(text));
        this.scrollToBottom();
    }

    public scrollToBottom() {
        const htmlElm = this.elm.getHTMLElement();
        htmlElm.scrollTop = htmlElm.scrollHeight;
    }

    public clear() {
        this.elm.clear();
    }
}

class ChooseInput extends Component {
    public selectCallback?: (choice: number) => void;

    constructor() {
        super("chooseInput");
    }

    public requestChoice(choices: any[]) {
        for (let i = 0; i < choices.length; i++) {
            this.elm.append(
                new Elm("button").class("choice").append(JSON.stringify(choices[i]))
                    .onActivate(() => this.onSelect(i))
            );
        }
    }

    public clear() {
        this.elm.clear();
    }

    private onSelect(choice: number) {
        this.clear();
        if (this.selectCallback) {
            this.selectCallback(choice);
        }
    }
}

class ResizeHandle extends Component {
    private dragging = false;
    private lastWidth = 33;
    private currWidth = 33;
    private collapsed = false;

    constructor(private parent: ExecuterContainer) {
        super("resizeHandle");

        this.mouseupHandler = this.mouseupHandler.bind(this);
        this.mousemoveHandler = this.mousemoveHandler.bind(this);

        this.elm.on("mousedown", ev => {
            ev.preventDefault();
            if (this.dragging) { return; }
            this.dragging = true;
            addEventListener("mouseup", this.mouseupHandler);
            addEventListener("mousemove", this.mousemoveHandler);
        });

        this.elm.on("dblclick", () => {
            if (this.collapsed) {
                this.uncollapse();
            } else {
                this.collapse();
            }
        });
    }

    public collapse() {
        this.collapsed = true;
        this.parent.elm.getHTMLElement().style.width = "8px";
        this.parent.elm.class("collapsed");
    }

    public uncollapse(width?: number) {
        this.collapsed = false;
        this.parent.elm.removeClass("collapsed");
        this.parent.elm.getHTMLElement().style.width = (width || this.lastWidth) + "%";
    }

    private mouseupHandler() {
        removeEventListener("mouseup", this.mouseupHandler);
        removeEventListener("mousemove", this.mousemoveHandler);
        this.dragging = false;
        if (!this.collapsed) {
            this.lastWidth = this.currWidth;
        }
    }

    private mousemoveHandler(ev: MouseEvent) {
        ev.preventDefault();
        // "1 -" because executer is on the right
        const newWidth = Math.min((1 - ev.clientX / innerWidth) * 100, 95);

        if (newWidth < 5) {
            if (!this.collapsed) {
                this.collapse();
            }
        } else {
            this.uncollapse(newWidth);
            this.currWidth = newWidth;
        }
    }
}

class StateSaver extends Component {
    private saves: [Elm<"button">, StateSave][] = [];
    private flowRunner?: FlowRunner;

    private savedList: Elm<"span">;
    private saveButton: Elm<"button">;
    private saveCount = 0;

    constructor(private container: ExecuterContainer) {
        super("saves");
        this.elm.class("operationsBar").append(
            this.savedList = new Elm("span").class("saved"),
            this.saveButton = new Elm("button")
                .attribute("disabled", "true")
                .append("Save state")
                .onActivate(() => {
                    this.save();
                })
        )
    }

    public setFlowRunner(flowRunner: FlowRunner) {
        this.flowRunner = flowRunner;
        this.saveButton.getHTMLElement().disabled = false;
    }

    public save() {
        if (!this.flowRunner) { return; }

        const flowState = this.flowRunner.getState();
        const plugins = pluginHooks.getExecutionStates();

        const saveName = "Save " + (++this.saveCount);
        const restoreButton = new Elm("button").append(saveName);
        const stateSave = {
            flow: flowState,
            plugins: plugins
        };
        const save: [Elm<'button'>, StateSave] = [restoreButton, stateSave];

        this.savedList.append(restoreButton);
        this.saves.push(save);
        this.container.log.logSecondary("Saved to " + saveName + ": " + JSON.stringify(stateSave));

        restoreButton.onActivate(() => {
            this.restore(stateSave);
            this.container.log.logSecondary("Restored from " + saveName + ": " + JSON.stringify(stateSave));
        });
        restoreButton.on("contextmenu", ev => {
            ev.preventDefault();
            removeElmFromArray(save, this.saves);
            restoreButton.remove();
        });
    }

    public restore(state: StateSave) {
        if (!this.flowRunner) { return; }
        this.flowRunner.setState(state.flow);
        pluginHooks.setExecutionStates(state.plugins);
    }
}

interface StateSave {
    flow: FlowRunnerState;
    plugins: { [x: string]: any };
}
