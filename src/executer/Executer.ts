import { FlowData, FlowRunner, FlowRunnerOutput, FlowRunnerState } from "../FlowRunner.js";
import { FileAccessRead } from "../filesystem/FileAccess.js";
import { Component, Elm } from "../japnaaEngine2d/elements.js";
import { removeElmFromArray } from "../japnaaEngine2d/util/removeElmFromArray.js";
import { PluginHooks } from "./ExecuterPlugin.js";

export class Executer extends Component {
    private outputDisplays: Elm;
    private saves: StateSaver;
    public log = new OutputLog();
    private chooseInput = new ChooseInput();

    private runner?: FlowRunner;
    private paused = true;
    private lastChoice: any[] = [];

    constructor(private pluginHooks: PluginHooks, public files: FileAccessRead) {
        super("executer");

        this.saves = new StateSaver(this, pluginHooks);

        this.elm.append(
            this.outputDisplays = new Elm().class("outputDisplays"),
            this.saves,
            this.log,
            this.chooseInput
        );

        this.chooseInput.selectCallback = choice => this.input(choice);
    }

    public writeVariable(key: string, value: number) {
        this.runner?.setVariable(key, value);
    }

    public getVariable(key: string): number | undefined {
        return this.runner?.getVariable(key);
    }

    public input(value: number) {
        if (!this.runner) { return; }
        this.chooseInput.clear();
        this.runner.input(value);
        this.log.logSecondary("<- " + this.lastChoice[value]);
        this.resume();
    }

    public pause() {
        this.paused = true;
    }

    public addOutputDisplay(elm: Elm) {
        this.outputDisplays.append(elm);
    }

    public execute(compiled: FlowData) {
        this.log.clear();
        this.chooseInput.clear();
        this.pluginHooks.stopExecution();
        this.paused = true;
        this.runner = new FlowRunner(compiled);
        this.saves.setFlowRunner(this.runner);
        this.pluginHooks.startExecution();
        this.resume();
    }

    public resume() {
        if (!this.paused) { return; }
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
            const successful = this.pluginHooks.runInstruction(output.data);
            if (!successful) {
                this.log.log(JSON.stringify(output.data));
            }
        } else if (output.type === "input") {
            this.chooseInput.requestChoice(output.choices);
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


class StateSaver extends Component {
    private saves: [Elm<"button">, StateSave][] = [];
    private flowRunner?: FlowRunner;

    private savedList: Elm<"span">;
    private saveButton: Elm<"button">;
    private saveCount = 0;

    constructor(private executer: Executer, private pluginHooks: PluginHooks) {
        super("saves");
        this.elm.class("operationsBar").append(
            this.savedList = new Elm("span").class("saved"),
            this.saveButton = new Elm("button")
                .class("saveButton")
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
        const plugins = this.pluginHooks.getExecutionStates();

        const saveName = "Save " + (++this.saveCount);
        const restoreButton = new Elm("button").append(saveName);
        const stateSave = {
            flow: flowState,
            plugins: plugins
        };
        const save: [Elm<'button'>, StateSave] = [restoreButton, stateSave];

        this.savedList.append(restoreButton);
        this.saves.push(save);
        this.executer.log.logSecondary("Saved to " + saveName + ": " + JSON.stringify(stateSave));

        restoreButton.onActivate(() => {
            this.restore(stateSave);
            this.executer.log.logSecondary("Restored from " + saveName + ": " + JSON.stringify(stateSave));
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
        this.pluginHooks.setExecutionStates(state.plugins);
    }
}

interface StateSave {
    flow: FlowRunnerState;
    plugins: { [x: string]: any };
}
