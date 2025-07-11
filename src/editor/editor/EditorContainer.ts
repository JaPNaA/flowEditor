import { Component, EventBus, JaPNaAEngine2d, Vec2M } from "../../japnaaEngine2d/JaPNaAEngine2d";
import { EditorPlugin } from "../EditorPlugin";
import { pluginHooks } from "../index";
import { DetectedExternallyModifiedError, Project } from "../project/Project";
import { Editor } from "./Editor";

interface EditorTabState {
    fileName: string,
    ignoreExternallyModified: boolean,
}

export class EditorContainer extends Component {
    public preventSaveOnExit = false;

    public onTabActiveChange = new EventBus<Editor>();
    public onTabInsert = new EventBus<{
        editor: Editor,
        index: number,
        tabState: EditorTabState
    }>();
    public onTabClose = new EventBus<Editor>();

    private plugins: EditorPlugin[] = [];

    private engine = new JaPNaAEngine2d({
        canvas: { alpha: true },
        htmlOverlay: { relativeToWorld: true },
        ticks: { fixedTick: false, enableDirtySystem: true },
        collision: { autoCheck: false },
        parentElement: this.elm.getHTMLElement()
    });

    private tabs: Editor[] = [];
    private editorStates = new Map<Editor, EditorTabState>();
    private activeEditor?: Editor;

    constructor(private project: Project) {
        super("editorContainer");

        addEventListener("beforeunload", async () => {
            if (this.preventSaveOnExit) { return; }
            await this.saveAll();
        });

        addEventListener("wheel", ev => {
            ev.preventDefault();
            if (ev.ctrlKey) {
                this.engine.camera.zoomInto(ev.deltaY > 0 ? 1 / 1.2 : 1.2, this.engine.mouse.worldPos);
                this.engine.ticker.requestTick();
            } else {
                let moveBy;
                // shift swaps x and y axis
                if (ev.shiftKey) {
                    moveBy = new Vec2M(ev.deltaY, ev.deltaX);
                } else {
                    moveBy = new Vec2M(ev.deltaX, ev.deltaY);
                }

                moveBy.scale(1 / this.engine.camera.getScale());

                this.activeEditor?.smoothCamera.moveBy(moveBy);
            }
        }, { passive: false });

        addEventListener("focus", () => {
            const activeEditor = this.activeEditor;
            if (!activeEditor) { return; }
            const editorOpenFile = this.editorStates.get(activeEditor);

            if (editorOpenFile) {
                this.project.checkIsLatestFlowSave(editorOpenFile.fileName)
                    .then(isLatest => {
                        if (!isLatest && !editorOpenFile.ignoreExternallyModified) {
                            editorOpenFile.ignoreExternallyModified = true;
                            if (confirm("The file was modified externally (maybe by another FlowEditor tab) since you last opened it. Do you want to reload the editor?")) {
                                this.reloadTab(activeEditor);
                            }
                        }
                    });
            }
        });

        this.elm.attribute("tabindex", "0");

        window.setInterval(async () => {
            if (this.preventSaveOnExit) { return; }
            if (!this.activeEditor || !this.activeEditor.dirty) { return; }
            console.log("autosave");
            await this.saveAll();
            this.activeEditor.dirty = false;
        }, 600e3);

        pluginHooks.setEngine(this.engine);
        this.openDefaultTab();
    }

    public getActiveTab() {
        return this.activeEditor;
    }

    public async openDefaultTab() {
        if (!this.project.isReady()) { await this.project.onReady.promise(); }
        const startFile = this.project.getStartFlowSavePath();
        this.openTab(startFile);
    }

    public async setProject(project: Project) {
        await this.saveAll();

        this.activeEditor?.remove();
        this.activeEditor = undefined;

        const oldTabs = this.tabs;
        this.tabs = [];
        for (const tab of oldTabs) {
            this.onTabClose.send(tab);
        }

        this.project = project;
        return this.createEditor();
    }

    public async openTab(fileName: string) {
        const tabResult = await this.createEditorAndOpenFile(fileName);
        if (!tabResult) { return; }
        const [newEditor, editorState] = tabResult;

        this.editorStates.set(newEditor, editorState);
        const newLength = this.tabs.push(newEditor);
        this.onTabInsert.send({ editor: newEditor, index: newLength - 1, tabState: editorState });

        pluginHooks.onEditorLoad(newEditor);
        this.showTab(newEditor);
    }

    public async showTab(tab: Editor) {
        if (this.activeEditor) {
            this.activeEditor.remove();
        }
        this.activeEditor = tab;
        this.onTabActiveChange.send(tab);
        this.engine.world.addElm(tab);
    }

    public async reloadTab(tab: Editor) {
        const tabState = this.editorStates.get(tab);
        if (!tabState) { throw new Error("Unknown tab"); }

        const tabResult = await this.createEditorAndOpenFile(tabState.fileName);
        if (!tabResult) { return; }

        const [newEditor, editorState] = tabResult;

        const tabIndex = this.tabs.indexOf(tab);
        if (tabIndex < 0) { throw new Error("Tab not found in tabs list"); }

        this.editorStates.set(newEditor, editorState);
        this.editorStates.delete(tab);
        this.tabs[tabIndex] = newEditor;

        this.onTabClose.send(tab);
        this.onTabInsert.send({ editor: newEditor, index: tabIndex, tabState: editorState });


        if (this.activeEditor === tab) {
            tab.remove();
            this.activeEditor = newEditor;
            this.engine.world.addElm(newEditor);
        }
    }

    private async createEditorAndOpenFile(fileName: string): Promise<[Editor, EditorTabState] | undefined> {
        if (!this.project.isReady()) { await this.project.onReady.promise(); }
        let newEditor: Editor;
        try {
            const save = await this.project.getFlowSave(fileName);
            newEditor = this.createEditor();
            newEditor.deserialize(save);
            return [newEditor, { fileName, ignoreExternallyModified: false }];
        } catch (err) {
            alert(`Failed to open the flow '${fileName}'. The file may be corrupted. See console for error details.`);
            console.error(err);
        }
    }

    public registerPlugin(plugin: EditorPlugin) {
        for (const tab of this.tabs) {
            this._addPluginToEditor(tab, plugin);
        }
        this.plugins.push(plugin);
    }

    private createEditor() {
        const editor = new Editor();

        for (const plugin of this.plugins) {
            this._addPluginToEditor(editor, plugin);
        }

        return editor;
    }

    private _addPluginToEditor(editor: Editor, plugin: EditorPlugin) {
        editor.rootBlueprintRegistery.registerBlueprints(plugin.instructionBlueprints, plugin.name);
        editor.deserializer.registerDeserializer(plugin.parse);
        if (plugin.analyser) {
            editor.actionBus.subscribeAllActions(
                plugin.analyser.onActionPerformed.bind(plugin.analyser)
            );
        }
        if (plugin.autocomplete) {
            for (const [key, suggester] of plugin.autocomplete) {
                editor.cursor.autocomplete.registerSuggester(key, suggester);
            }
        }
    }

    public compile(tab: Editor) {
        return tab.compile();
    }

    public focus() {
        this.elm.getHTMLElement().focus();
    }

    // todo: rename, remove "for tab", since all operations will be on tabs now
    public getSaveDataForTab(editor: Editor) {
        return editor.serialize();
    }

    public async saveAll() {
        const promises = [];
        for (const tab of this.tabs) {
            promises.push(this.writeSaveDataForTab(tab, this.getSaveDataForTab(tab)));
        }
        await Promise.all(promises);
    }

    public openTextOp(tab: Editor) {
        return tab.openTextOp();
    }

    public async writeSaveDataForTab(tab: Editor, saveData: any) {
        const state = this.editorStates.get(tab);
        if (!state) { throw new Error("Unknown tab"); }
        if (!state.fileName) { console.warn("No open file to save to"); return; }
        const saveStr = saveData ? JSON.stringify(saveData) : "";

        try {
            return await this.project.writeFlowSave(state.fileName, saveStr);
        } catch (err) {
            if (err instanceof DetectedExternallyModifiedError) {
                if (confirm("The file was modified externally (maybe by another FlowEditor tab) since you last opened it. Do you want to overwrite it?")) {
                    return await this.project.writeFlowSave(state.fileName, saveStr, true);
                }
            }
        }

        state.ignoreExternallyModified = false;
    }
}