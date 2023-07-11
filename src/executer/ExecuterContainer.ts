import { FlowRunner, FlowRunnerOutput } from "../FlowRunner.js";
import { appHooks, pluginHooks } from "../index.js";
import { Component, Elm } from "../japnaaEngine2d/JaPNaAEngine2d.js";
import { download, requestFile, stringToBlob } from "../utils.js";

export class ExecuterContainer extends Component {
    public log = new OutputLog();
    private input = new ChooseInput();
    private runner?: FlowRunner;
    private paused = false;
    private lastChoice: any[] = [];
    private outputDisplays: Elm;

    constructor() {
        super("executerContainer");

        this.elm.append(
            new Elm().class("fileOperationsBar").append(
                new Elm("button").append("Run").onActivate(() => this.execute()),
                new Elm("button").append("Save").onActivate(() =>
                    download(
                        stringToBlob(JSON.stringify(appHooks.getEditorSaveData())),
                        "flowEditorSave.json"
                    )
                ),
                new Elm("button").append("Load").onActivate(() =>
                    requestFile()
                        .then(file => file.text())
                        .then(text => appHooks.setEditorSaveData(JSON.parse(text)))
                ),
                new Elm("button").append("Delete all").class("deleteAndReload").onActivate(() => {
                    if (confirm("Delete editor contents and reload?")) {
                        appHooks.setEditorSaveData(null);
                    }
                })
            ),
            this.outputDisplays = new Elm().class("outputDisplays"),
            this.log,
            this.input
        );

        this.input.selectCallback = choice => {
            if (!this.runner) { return; }
            this.runner.input(choice);
            this.log.logSecondary("<- " + this.lastChoice[choice]);
            this.continueExecute();
        };
    }

    public writeVariable(key: string, value: number) {
        this.runner?.setVariable(key, value);
    }

    public addOutputDisplay(elm: Elm) {
        this.outputDisplays.append(elm);
    }

    private execute() {
        const compiled = appHooks.getCompiledFlowFromEditor();
        console.log(compiled);
        this.log.clear();
        this.input.clear();
        pluginHooks.stopExecution();
        this.runner = new FlowRunner({ flow: compiled });
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