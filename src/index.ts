import { Editor } from "./Editor.js";
import { FlowData, FlowRunner } from "./FlowRunner.js";
import { InstructionData, constructInstructionData } from "./flowToInstructionData.js";
import { JaPNaAEngine2d } from "./japnaaEngine2d/JaPNaAEngine2d.js";

fetch("/data/exampleFlow.json").then(e => e.json()).then((flowData: FlowData) => {
    const engine = new JaPNaAEngine2d({
        canvas: { alpha: true },
        htmlOverlay: { relativeToWorld: true }
    });
    const editor = new Editor();

    engine.world.addElm(editor);

    if (localStorage['flowEditorSave']) {
        editor.deserialize(JSON.parse(localStorage['flowEditorSave']));
    } else {
        const instructions: InstructionData[] = constructInstructionData(flowData);
        editor.setInstructions(instructions);
    }

    addEventListener("beforeunload", () => {
        localStorage['flowEditorSave'] = JSON.stringify(editor.serialize());
    });

    console.log(engine.world);

    addEventListener("keydown", e => {
        if (e.ctrlKey && e.key === "Enter") {
            const compiled = editor.compile();
            console.log(compiled);
            const runner = new FlowRunner({ flow: compiled });
            while (runner.isActive()) {
                runner.runOne();
                console.log(runner.getOutput());
            }
        }
    })
});

