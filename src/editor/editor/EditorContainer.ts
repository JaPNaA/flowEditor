import { pluginHooks } from "../index.js";
import { Component, JaPNaAEngine2d } from "../../japnaaEngine2d/JaPNaAEngine2d.js";
import { EditorPlugin } from "../EditorPlugin.js";
import { DetectedExternallyModifiedError, Project } from "../../project/Project.js";
import { Editor } from "./Editor.js";

export class EditorContainer extends Component {
    public preventSaveOnExit = false;

    private plugins: EditorPlugin[] = [];

    private engine = new JaPNaAEngine2d({
        canvas: { alpha: true },
        htmlOverlay: { relativeToWorld: true },
        ticks: { fixedTick: false, enableDirtySystem: true },
        collision: { autoCheck: false },
        parentElement: this.elm.getHTMLElement()
    });

    private editor = new Editor();
    private editorOpenFile?: string;
    private autoSaveInterval: number;

    /** Did the flow successfully load? If not, don't try to save to avoid corruption */
    private successfulLoad = false;

    private ignoreExternallyModified: boolean = false;

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

        addEventListener("focus", () => {
            if (this.editorOpenFile) {
                this.project.checkIsLatestFlowSave(this.editorOpenFile)
                    .then(isLatest => {
                        if (!isLatest && !this.ignoreExternallyModified) {
                            this.ignoreExternallyModified = true;
                            if (confirm("The file was modified externally (maybe by another FlowEditor tab) since you last opened it. Do you want to reload the editor?")) {
                                this.reloadProject();
                            }
                        }
                    });
            }
        });

        this.elm.attribute("tabindex", "0");

        this.autoSaveInterval = setInterval(async () => {
            if (this.preventSaveOnExit) { return; }
            if (!this.editor.dirty) { return; }
            console.log("autosave");
            await this.save();
            this.editor.dirty = false;
        }, 600e3);

        pluginHooks.setEngine(this.engine);
        this.setup();
    }

    public async setup() {
        if (!this.project.isReady()) { await this.project.onReady.promise(); }
        const startFile = this.project.getStartFlowPath();
        try {
            const save = await this.project.getFlowSave(startFile);
            this.editor.deserialize(save);
            this.successfulLoad = true;
        } catch (err) {
            console.error(err);
        }
        this.editorOpenFile = startFile;
        this.ignoreExternallyModified = false;
        pluginHooks.onEditorLoad(this.editor);
    }

    public async setProject(project: Project) {
        await this.setSaveData(this.getSaveData());
        this.project = project;
        return this.reloadProject();
    }

    public async reloadProject() {
        this.editor.remove();
        this.editor = new Editor();
        this.engine.world.addElm(this.editor);

        for (const plugin of this.plugins) {
            this._addPluginToEditor(plugin);
        }

        return this.setup();
    }

    public registerPlugin(plugin: EditorPlugin) {
        this._addPluginToEditor(plugin);
        this.plugins.push(plugin);
    }

    private _addPluginToEditor(plugin: EditorPlugin) {
        this.editor.blueprintRegistery.registerBlueprints(plugin.instructionBlueprints, plugin.name);
        this.editor.deserializer.registerDeserializer(plugin.parse);
        if (plugin.autocomplete) {
            for (const [key, suggester] of plugin.autocomplete) {
                this.editor.cursor.autocomplete.registerSuggester(key, suggester);
            }
        }
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

    public async save() {
        return this.setSaveData(this.getSaveData());
    }

    public openTextOp() {
        return this.editor.openTextOp();
    }

    public async setSaveData(saveData: any) {
        if (!this.successfulLoad) { console.warn("Refuse to save due to failure to load"); return; }
        if (!this.editorOpenFile) { console.warn("No open file to save to"); return; }
        const saveStr = saveData ? JSON.stringify(saveData) : "";

        try {
            return await this.project.writeFlowSave(this.editorOpenFile, saveStr);
        } catch (err) {
            if (err instanceof DetectedExternallyModifiedError) {
                if (confirm("The file was modified externally (maybe by another FlowEditor tab) since you last opened it. Do you want to overwrite it?")) {
                    return await this.project.writeFlowSave(this.editorOpenFile, saveStr, true);
                }
            }
        }

        this.ignoreExternallyModified = false;
    }
}