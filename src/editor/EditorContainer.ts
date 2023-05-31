import { FlowData, FlowRunner } from "../FlowRunner.js";
import { Component, JaPNaAEngine2d } from "../japnaaEngine2d/JaPNaAEngine2d.js";
import { Editor } from "./Editor.js";
import { InstructionData, constructInstructionData } from "./flowToInstructionData.js";

export class EditorContainer extends Component {
    private engine = new JaPNaAEngine2d({
        canvas: { alpha: true },
        htmlOverlay: { relativeToWorld: true },
        parentElement: this.elm.getHTMLElement()
    });

    private editor = new Editor();

    constructor() {
        super("editorContainer");

        fetch("/data/exampleFlow.json").then(e => e.json()).then((flowData: FlowData) => {
            if (localStorage['flowEditorSave']) {
                this.editor.deserialize(JSON.parse(localStorage['flowEditorSave']));
            } else {
                const instructions: InstructionData[] = constructInstructionData(flowData);
                this.editor.setInstructions(instructions);
            }

            this.engine.world.addElm(this.editor);
        });

        addEventListener("beforeunload", () => {
            localStorage['flowEditorSave'] = JSON.stringify(this.editor.serialize());
        });

        console.log(this.engine.world);

        this.elm.on("keydown", e => {
            if (e.ctrlKey && e.key === "Enter") {
                const compiled = this.editor.compile();
                console.log(compiled);
                const runner = new FlowRunner({ flow: compiled });
                while (runner.isActive()) {
                    runner.runOne();
                    console.log(runner.getOutput());
                }
            }
        });
    }
}