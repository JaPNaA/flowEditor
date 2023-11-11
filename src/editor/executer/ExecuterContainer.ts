import { Executer } from "../../executer/Executer";
import { Exporter } from "../../exporter/Exporter";
import { FileStructureReadWrite } from "../../filesystem/FileStructure";
import { Component, Elm } from "../../japnaaEngine2d/elements";
import { constructInstructionData } from "../editor/toolchain/flowToInstructionData";
import { appHooks, pluginHooks } from "../index";
import { Project } from "../project/Project";
import { download, requestFile } from "../utils";

export class ExecuterContainer extends Component {
    public executer: Executer;

    constructor(files: FileStructureReadWrite) {
        super("executerContainer");

        this.executer = new Executer(pluginHooks, files);

        this.elm.append(
            new Elm().class("fileOperationsBar", "operationsBar").append(
                new Elm("button").append("Run")
                    .attribute("title", "Run the flow in the editor")
                    .onActivate(() => this.execute()),
                new Elm("button").append("Save")
                    .attribute("title", "Save the current flow in the editor")
                    .onActivate(() =>
                        appHooks.saveEditor()
                        // download(
                        //     stringToBlob(JSON.stringify(appHooks.getEditorSaveData())),
                        //     "flowEditorSave.json"
                        // )
                    ),
                new Elm("button").append("Load")
                    .attribute("title", "Load from a Flow Editor save file")
                    .onActivate(() =>
                        requestFile()
                            .then(file => file.text())
                            .then(text => appHooks.setEditorSaveData(JSON.parse(text)))
                    ),
                new Elm("button").append("TextOp")
                    .attribute("title", "Perform an operation on all text")
                    .onActivate(() => {
                        appHooks.requestEditorTextOp();
                    }),
                new Elm("button").append("Export")
                    .attribute("title", "Export to executable HTML")
                    .onActivate(async () => {
                        const project = this.getProject() as FileStructureReadWrite;
                        const startFlowFile = JSON.stringify({ flow: appHooks.getCompiledFlowFromEditor() });

                        await project.writeFlow(project.getStartFlowPath(), startFlowFile);

                        download(await new Exporter(project).exportToSingleHTML(), "export.html");
                    }),
                new Elm("button").append("Import")
                    .attribute("title", "Import an exported flow JSON file")
                    .onActivate(async () => {
                        requestFile()
                            .then(file => file.text())
                            .then(text => appHooks.setEditorSaveData({
                                startGroup: 0,
                                elms: constructInstructionData(JSON.parse(text))
                            }));
                    }),
                new Elm("button").append("Delete all")
                    .attribute("title", "Delete everything in the editor")
                    .class("deleteAndReload").onActivate(() => {
                        if (confirm("Delete editor contents and reload?")) {
                            appHooks.setEditorSaveData(null);
                        }
                    })
            ),
            this.executer
        );

    }

    public getProject() {
        return this.executer.files;
    }

    public setProject(project: Project) {
        this.executer.files = project;
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
