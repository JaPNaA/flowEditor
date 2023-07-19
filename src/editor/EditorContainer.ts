import { FlowData } from "../FlowRunner.js";
import { Component, JaPNaAEngine2d } from "../japnaaEngine2d/JaPNaAEngine2d.js";
import { Editor } from "./Editor.js";
import { InstructionData, constructInstructionData } from "./flowToInstructionData.js";

export class EditorContainer extends Component {
    public preventSaveOnExit = false;

    private engine = new JaPNaAEngine2d({
        canvas: { alpha: true },
        htmlOverlay: { relativeToWorld: true },
        parentElement: this.elm.getHTMLElement()
    });

    private editor = new Editor();
    private autoSaveInterval: number;

    constructor() {
        super("editorContainer");

        if (localStorage['flowEditorSave']) {
            this.editor.deserialize(JSON.parse(localStorage['flowEditorSave']));
        } else {
            fetch("/data/exampleFlow.json").then(e => e.json()).then((flowData: FlowData) => {
                const instructions: InstructionData[] = constructInstructionData(flowData);
                this.editor.setInstructions(instructions);
            });
        }

        this.engine.world.addElm(this.editor);

        addEventListener("beforeunload", () => {
            if (this.preventSaveOnExit) { return; }
            this.setSaveData(this.getSaveData());
        });

        addEventListener("wheel", ev => {
            this.engine.camera.zoomInto(ev.deltaY > 0 ? 1 / 1.2 : 1.2, this.engine.mouse.worldPos);
        });

        this.autoSaveInterval = setInterval(() => {
            if (this.preventSaveOnExit) { return; }
            if (!this.editor.dirty) { return; }
            console.log("autosave");
            this.setSaveData(this.getSaveData());
            this.editor.dirty = false;
        }, 600e3);

        console.log(this.engine.world);
        this.elm.attribute("tabindex", "0");
    }

    public compile() {
        return this.editor.compile();
    }

    public focus() {
        this.elm.getHTMLElement().focus();
    }

    public getSaveData() {
        return this.editor.serialize();
    }

    public setSaveData(saveData: any) {
        localStorage['flowEditorSave'] = saveData ? JSON.stringify(saveData) : "";
    }
}