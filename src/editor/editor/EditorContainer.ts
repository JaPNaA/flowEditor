import { Component, EventBus, JaPNaAEngine2d, Vec2M } from "../../japnaaEngine2d/JaPNaAEngine2d";
import { EditorPlugin } from "../EditorPlugin";
import { pluginHooks } from "../index";
import { externallyModifiedError, Project } from "../project/Project";
import { Editor } from "./Editor";
import { EditorSaveData } from "./EditorSaveData";

interface EditorTabState {
    fileName: string,
    ignoreExternallyModified: boolean,
    saveData?: EditorSaveData,
}

/**
 * The editor container is responsible for handle the saving of editors,
 * and can contain several tabs.
 */
export class EditorContainer extends Component {
    public preventSaveOnExit = false;
    public nextTabId = 0;

    public onTabActiveChange = new EventBus<number | null>();
    public onTabInsert = new EventBus<{
        editor: Editor,
        tabId: number,
        index: number,
        tabState: EditorTabState
    }>();
    public onTabClose = new EventBus<number>();

    private plugins: EditorPlugin[] = [];

    private engine = new JaPNaAEngine2d({
        canvas: { alpha: true },
        htmlOverlay: { relativeToWorld: true },
        ticks: { fixedTick: false, enableDirtySystem: true },
        collision: { autoCheck: false },
        parentElement: this.elm.getHTMLElement()
    });

    /** A list of the tabIds in the order they are shown */
    private tabIds: number[] = [];
    private editorStates = new Map<number, EditorTabState>();
    private activeTab?: { id: number, editor: Editor };

    constructor(private project: Project) {
        super("editorContainer");

        console.log(this.engine);

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

                this.activeTab?.editor.smoothCamera.moveBy(moveBy);
            }
        }, { passive: false });

        addEventListener("focus", () => {
            const activeTab = this.activeTab;
            if (!activeTab) { return; }
            const editorOpenFile = this.editorStates.get(activeTab.id);

            if (editorOpenFile) {
                this.project.checkIsLatestFlowSave(editorOpenFile.fileName)
                    .then(isLatest => {
                        if (!isLatest && !editorOpenFile.ignoreExternallyModified) {
                            editorOpenFile.ignoreExternallyModified = true;
                            if (confirm("The file was modified externally (maybe by another FlowEditor tab) since you last opened it. Do you want to reload the editor?")) {
                                this.reloadTab(activeTab.id);
                            }
                        }
                    });
            }
        });

        this.elm.attribute("tabindex", "0");

        window.setInterval(async () => {
            if (this.preventSaveOnExit) { return; }
            const activeTab = this.activeTab;
            if (!activeTab || !activeTab.editor.dirty) { return; }
            console.log("autosave");
            await this.saveAll();
            activeTab.editor.dirty = false; // todo handle each editor separately
        }, 600e3);

        pluginHooks.setEngine(this.engine);
        this.openDefaultTab();
    }

    public getActiveTab() {
        return this.activeTab?.editor;
    }

    public getActiveTabId() {
        return this.activeTab?.id;
    }

    public async openDefaultTab() {
        if (!this.project.isReady()) { await this.project.onReady.promise(); }
        const startFile = this.project.getStartFlowSavePath();
        this.openOrActivateTab(startFile);
    }

    public async setProject(project: Project) {
        await this.saveAll();

        this.activeTab?.editor.remove();
        this.activeTab = undefined;
        this.engine.ticker.requestTick();

        const oldTabs = this.tabIds;
        this.tabIds = [];
        this.editorStates.clear();
        for (const tab of oldTabs) {
            this.onTabClose.send(tab);
        }

        this.project = project;
        return this.openDefaultTab();
    }

    public async openOrActivateTab(filename: string) {
        for (const [editor, state] of this.editorStates) {
            if (state.fileName === filename) {
                this.showTab(editor);
                return;
            }
        }

        this.openTab(filename);
    }

    private async openTab(filename: string) {
        const tabResult = await this.createEditorAndOpenFile(filename);
        if (!tabResult) { return; }
        const [newEditor, editorState, tabId] = tabResult;

        this.editorStates.set(tabId, editorState);
        const newLength = this.tabIds.push(tabId);
        this.onTabInsert.send({ editor: newEditor, tabId, index: newLength - 1, tabState: editorState });

        pluginHooks.onEditorLoad(newEditor);
        this.setActiveEditor(newEditor, tabId);
    }

    public showTab(tabId: number) {
        if (this.activeTab?.id === tabId) { return; }

        const state = this.editorStates.get(tabId);
        if (!state) { throw new Error("Unknown tab id"); }
        if (!state.saveData) { throw new Error("Tab save data not saved"); }

        const editor = this.createEditor();
        editor.deserialize(state.saveData);

        this.setActiveEditor(editor, tabId);
    }

    public closeTab(tabId: number) {
        const tabIndex = this.tabIds.indexOf(tabId);
        if (tabIndex < 0) { throw new Error("Unknown tab id"); }

        // switch focus to a different tab
        if (this.activeTab && this.activeTab.id === tabId) {
            if (tabIndex == 0) {
                if (this.tabIds.length > 1) {
                    this.showTab(this.tabIds[1]);
                } else {
                    this.removeActiveEditor();
                    this.onTabActiveChange.send(null);
                }
            } else {
                this.showTab(this.tabIds[tabIndex - 1]);
            }
        }

        // todo: alert plugins about closed editor
        this.editorStates.delete(tabId);
        this.tabIds.splice(tabIndex, 1);
        this.onTabClose.send(tabId);
    }

    private async setActiveEditor(editor: Editor, tabId: number) {
        this.removeActiveEditor();
        this.activeTab = { editor, id: tabId };
        this.onTabActiveChange.send(tabId);
        this.engine.world.addElm(editor);
        this.engine.ticker.requestTick();
    }

    private removeActiveEditor() {
        if (!this.activeTab) { return; }

        const state = this.editorStates.get(this.activeTab.id)!;
        state.saveData = this.activeTab.editor.serialize();
        this.activeTab.editor.remove();
        this.activeTab = undefined;
    }

    public async reloadTab(tabId: number) {
        const tabState = this.editorStates.get(tabId);
        if (!tabState) { throw new Error("Unknown tab"); }

        const tabResult = await this.createEditorAndOpenFile(tabState.fileName);
        if (!tabResult) { return; }

        const [newEditor, editorState, newTabId] = tabResult;

        const tabIndex = this.tabIds.indexOf(tabId);
        if (tabIndex < 0) { throw new Error("Tab not found in tabs list"); }

        this.editorStates.set(newTabId, editorState);
        this.editorStates.delete(tabId);
        this.tabIds[tabIndex] = newTabId;

        this.onTabClose.send(tabId);
        this.onTabInsert.send({ editor: newEditor, tabId: newTabId, index: tabIndex, tabState: editorState });

        if (this.activeTab?.id === tabId) {
            this.setActiveEditor(newEditor, newTabId);
        }
    }

    private async createEditorAndOpenFile(fileName: string): Promise<[Editor, EditorTabState, number] | undefined> {
        if (!this.project.isReady()) { await this.project.onReady.promise(); }
        let newEditor: Editor;
        try {
            const save = await this.project.getFlowSave(fileName);
            newEditor = this.createEditor();
            newEditor.deserialize(save);
            return [newEditor, { fileName, ignoreExternallyModified: false }, this.nextTabId++];
        } catch (err) {
            alert(`Failed to open the flow '${fileName}'. The file may be corrupted. See console for error details.`);
            console.error(err);
        }
    }

    public registerPlugin(plugin: EditorPlugin) {
        if (this.activeTab?.editor) {
            this._addPluginToEditor(this.activeTab.editor, plugin);
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

    public getSaveDataForTab(tabId: number) {
        if (this.activeTab?.id === tabId) {
            return this.activeTab.editor.serialize();
        }

        const state = this.editorStates.get(tabId);
        if (!state) { throw new Error("Unknown tabId"); }
        if (!state.saveData) { throw new Error("Tab has no associated save data"); }
        return state.saveData;
    }

    public async saveAll() {
        const promises = [];
        for (const tab of this.tabIds) {
            promises.push(this.writeSaveDataForTab(tab, this.getSaveDataForTab(tab)));
        }
        await Promise.all(promises);
    }

    public openTextOp(tab: Editor) {
        return tab.openTextOp();
    }

    public async writeSaveDataForTab(tabId: number, saveData: any) {
        const state = this.editorStates.get(tabId);
        if (!state) { throw new Error("Unknown tab"); }
        if (!state.fileName) { console.warn("No open file to save to"); return; }
        const saveStr = saveData ? JSON.stringify(saveData) : "";

        const result = await this.project.writeFlowSave(state.fileName, saveStr);
        if (result.isError && result.errorType === externallyModifiedError.errorType) {
            if (confirm("The file was modified externally (maybe by another FlowEditor tab) since you last opened it. Do you want to overwrite it?")) {
                return await this.project.writeFlowSave(state.fileName, saveStr, true);
            }
        }

        state.ignoreExternallyModified = false;
    }
}