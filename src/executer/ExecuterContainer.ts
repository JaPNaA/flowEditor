import { FlowRunner } from "../FlowRunner.js";
import { appHooks } from "../index.js";
import { FlowRunnerOutput } from "../japnaaEngine2d/FlowRunner";
import { Component, Elm } from "../japnaaEngine2d/JaPNaAEngine2d.js";

export class ExecuterContainer extends Component {
    private log = new OutputLog();
    private input = new ChooseInput();
    private runner?: FlowRunner;
    private paused = false;

    constructor() {
        super("executerContainer");

        this.elm.append(
            new Elm("button").append("Run").onActivate(() => this.execute()),
            this.log,
            this.input,
            new Elm("button").append("Delete and reload").class("deleteAndReload").onActivate(() => {
                if (confirm("Delete editor contents and reload?")) {
                    appHooks.deleteAndReloadRequested = true;
                    location.reload();
                }
            })
        );

        this.input.selectCallback = choice => {
            if (!this.runner) { return; }
            this.runner.input(choice);
            this.continueExecute();
        };
    }

    private execute() {
        const compiled = appHooks.getCompiledFlowFromEditor();
        console.log(compiled);
        this.log.clear();
        this.input.clear();
        this.runner = new FlowRunner({ flow: compiled });
        this.continueExecute();
    }

    private continueExecute() {
        if (!this.runner) { return; }
        this.paused = false;
        while (this.runner.isActive() && !this.paused) {
            this.runner.runOne();
            this.processOutput(this.runner.getOutput());
        }
    }

    private processOutput(output: FlowRunnerOutput | null) {
        if (!output) { return; }
        if (output.type === "default") {
            this.log.log(JSON.stringify(output.data));
        } else if (output.type === "input") {
            this.input.requestChoice(output.choices);
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