import { FlowData } from "../FlowRunner.js";
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
    public preventSaveOnExit = false;

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
            if (this.preventSaveOnExit) { return; }
            this.setSaveData(this.getSaveData());
        });

        addEventListener("wheel", ev => {
            this.engine.camera.zoomInto(ev.deltaY > 0 ? 1 / 1.2 : 1.2, this.engine.mouse.worldPos);
        });

        console.log(this.engine.world);
    }

    public compile() {
        return this.editor.compile();
    }

    public getSaveData() {
        return this.editor.serialize();
    }

    public setSaveData(saveData: any) {
        localStorage['flowEditorSave'] = saveData ? JSON.stringify(saveData) : "";
    }
}