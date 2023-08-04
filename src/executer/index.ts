import { SingleHTMLFileFileStructure } from "../exporter/SingleHTMLFileExporter";
import { VisualNovelExecuter } from "../plugins/visualNovel/executer";
import { Executer } from "./Executer";

document.body.classList.add("executerContainer");
const fs = new SingleHTMLFileFileStructure();

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
}, fs).appendTo(document.body);

const visualNovelExecuter = new VisualNovelExecuter();

fs.getFlow(fs.getStartFlowPath()).then(json => executer.execute(json));

// document.body.removeChild(document.getElementById("noLoadError")!);