import { Component, JaPNaAEngine2d } from "../japnaaEngine2d/JaPNaAEngine2d.js";
import { EditorPlugin } from "../plugins/EditorPlugin.js";
import { Project } from "../project/Project.js";
import { Editor } from "./Editor.js";

export class EditorContainer extends Component {
    public preventSaveOnExit = false;

    private plugins: EditorPlugin[] = [];

    private engine = new JaPNaAEngine2d({
        canvas: { alpha: true },
        htmlOverlay: { relativeToWorld: true },
        ticks: { fixedTick: false, enableDirtySystem: true },
        parentElement: this.elm.getHTMLElement()
    });

    private editor = new Editor();
    private editorOpenFile?: string;
    private autoSaveInterval: number;

    constructor(private project: Project) {
        super("editorContainer");

        console.log(this.engine.world);
        this.engine.world.addElm(this.editor);

        addEventListener("beforeunload", async () => {
            if (this.preventSaveOnExit) { return; }
            await this.save();
        });

        addEventListener("wheel", ev => {
            this.engine.camera.zoomInto(ev.deltaY > 0 ? 1 / 1.2 : 1.2, this.engine.mouse.worldPos);
            this.engine.ticker.requestTick();
        });

        this.elm.attribute("tabindex", "0");

        this.autoSaveInterval = setInterval(() => {
            if (this.preventSaveOnExit) { return; }
            if (!this.editor.dirty) { return; }
            console.log("autosave");
            this.save();
            this.editor.dirty = false;
        }, 600e3);

        this.setup();
    }

    public async setup() {
        if (!this.project.isReady()) { await this.project.onReady.promise(); }
        const startFile = this.project.getStartFlowPath();
        try {
            const save = await this.project.getFlowSave(startFile);
            this.editor.deserialize(save);
        } catch (err) {
            console.error(err);
        }
        this.editorOpenFile = startFile;
    }

    public async setProject(project: Project) {
        this.setSaveData(this.getSaveData());
        this.project = project;
        this.editor.remove();
        this.editor = new Editor();
        this.engine.world.addElm(this.editor);

        for (const plugin of this.plugins) {
            this.editor.blueprintRegistery.registerBlueprints(plugin.instructionBlueprints, plugin.name);
            this.editor.deserializer.registerDeserializer(plugin.parse);
        }

        return this.setup();
    }

    public registerPlugin(plugin: EditorPlugin) {
        this.editor.blueprintRegistery.registerBlueprints(plugin.instructionBlueprints, plugin.name);
        this.editor.deserializer.registerDeserializer(plugin.parse);
        this.plugins.push(plugin);
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

    public save() {
        return this.setSaveData(this.getSaveData());
    }

    public openTextOp() {
        return this.editor.openTextOp();
    }

    public setSaveData(saveData: any) {
        if (!this.editorOpenFile) { return; }
        if (saveData) {
            const str = JSON.stringify(saveData);
            return this.project.writeFlowSave(this.editorOpenFile, str);
        } else {
            return this.project.writeFlowSave(this.editorOpenFile, "");
        }
    }
}