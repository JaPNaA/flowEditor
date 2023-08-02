import { NetworkFileSystem } from "../filesystem/FS.js";
import { ExportReader } from "../filesystem/export.js";
import { VisualNovelExecuter } from "../plugins/visualNovel/executer.js";
import { Executer } from "./Executer.js";

document.body.classList.add("executerContainer");

const executer = new Executer({
    startExecution(): Promise<void> {
        return visualNovelExecuter.start(executer);
    },

    runInstruction(instruction: any) {
        return visualNovelExecuter.run(instruction);
    },

    stopExecution() {
        return visualNovelExecuter.stop();
    },

    getExecutionStates() {
        return { ["visualNovelPlugin.name"]: visualNovelExecuter.getState() };
    },

    setExecutionStates(states: { [x: string]: any }) {
        visualNovelExecuter.setState(states["visualNovelPlugin.name"]);
    }
}, new ExportReader(new NetworkFileSystem("/testingFiles/exportTest/data"))).appendTo(document.body);

const visualNovelExecuter = new VisualNovelExecuter();

fetch("/testingFiles/exportTest/data/flows/0.json").then(data => data.json()).then(json => executer.execute(json));

document.body.removeChild(document.getElementById("noLoadError")!);