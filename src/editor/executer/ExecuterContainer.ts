import { Executer } from "../../executer/Executer.js";
import { Component, Elm } from "../../japnaaEngine2d/elements.js";
import { appHooks, pluginHooks } from "../index.js";
import { Project } from "../project/Project.js";
import { requestFile } from "../utils.js";

export class ExecuterContainer extends Component {
    private executer = new Executer(pluginHooks);

    constructor(private project: Project) {
        super("executerContainer");

        this.elm.append(
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
                new Elm("button").append("TextOp").onActivate(() => {
                    appHooks.requestEditorTextOp();
                }),
                new Elm("button").append("Delete all").class("deleteAndReload").onActivate(() => {
                    if (confirm("Delete editor contents and reload?")) {
                        appHooks.setEditorSaveData(null);
                    }
                })
            ),
            this.executer
        );

    }

    public getProject() {
        return this.project;
    }

    public setProject(project: Project) {
        this.project = project;
    }

    public writeVariable(key: string, value: number) {
        this.executer.writeVariable(key, value);
    }

    public getVariable(key: string): number | undefined {
        return this.executer.getVariable(key);
    }

    public input(value: number) {
        this.executer.input(value);
    }

    public pause() {
        this.executer.pause();
    }

    public addOutputDisplay(elm: Elm) {
        this.executer.addOutputDisplay(elm);
    }

    public execute() {
        this.executer.execute({ flow: appHooks.getCompiledFlowFromEditor() });
    }

    public resume() {
        this.executer.resume();
    }

    public log(message: string) {
        this.executer.log.log(message);
    }

    public logSecondary(message: string) {
        this.executer.log.logSecondary(message);
    }
}
