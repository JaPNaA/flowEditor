import { Component, EventBus, JaPNaAEngine2d, Vec2, Vec2M } from "../../japnaaEngine2d/JaPNaAEngine2d";
import { EditorPlugin } from "../EditorPlugin";
import { pluginHooks } from "../index";
import { externallyModifiedError, Project } from "../project/Project";
import { Editor } from "./Editor";
import { EditorSaveData } from "./EditorSaveData";

interface EditorTabState {
    fileName: string,
    ignoreExternallyModified: boolean,
    cameraState: { position: Vec2, scale: number },
    dirty: boolean,
    saveData: EditorSaveData,
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

        addEventListener("beforeunload", ev => {
            if (this.preventSaveOnExit) { return; }
            console.log("trying to save everything...");
            const { tabsToSave } = this.saveAll();
            if (tabsToSave > 0) {
                ev.preventDefault();
            }
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
            this.checkTabExternallyModified(activeTab.id);
        });

        this.elm.attribute("tabindex", "0");

        window.setInterval(async () => {
            if (this.preventSaveOnExit) { return; }
            const activeTab = this.activeTab;
            if (!activeTab || !activeTab.editor.dirty) { return; }
            console.log("autosave");
            await this.saveAll().promise;
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
        await this.saveAll().promise;

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

        const tabId = await this.openTab(filename);
        if (tabId !== undefined) {
            this.showTab(tabId);
        }
    }

    /**
     * Creates a tab for a file and inserts the tab into the tab list.
     * 
     * If index is not specified, the tab is appended to the end of
     * the tab list.
     */
    private async openTab(filename: string, index?: number) {
        const tabResult = await this.createTabForFile(filename);
        if (!tabResult) { return; }
        const [editorState, tabId] = tabResult;

        this.editorStates.set(tabId, editorState);
        let insertedIndex = 0;
        if (index === undefined) {
            insertedIndex = this.tabIds.push(tabId) - 1;
        } else {
            this.tabIds.splice(index, 0, tabId);
            insertedIndex = index;
        }

        this.onTabInsert.send({
            tabId,
            index: insertedIndex,
            tabState: editorState
        });

        return tabId;
    }

    /**
     * Shows an open tab.
     * 
     * Emits the onTabActiveChange event.
     */
    public showTab(tabId: number) {
        if (this.activeTab?.id === tabId) { return; }

        const state = this.editorStates.get(tabId);
        if (!state) { throw new Error("Unknown tab id"); }

        const editor = this.createEditor();
        editor.deserialize(state.saveData);

        this.setActiveEditor(editor, state.cameraState, tabId);

        this.checkTabExternallyModified(tabId);
    }

    /**
     * Closes a tab and switches focus to the left tab. If there are no tabs
     * to the left, switches focus to the right tab. If there are no tabs to
     * the right, there will be no tab open.
     */
    public async closeTab(tabId: number) {
        await this.saveTab(tabId);

        if (this.activeTab && this.activeTab.id === tabId) {
            const tabIndex = this.tabIds.indexOf(tabId);
            if (tabIndex < 0) { throw new Error("Unknown tab id"); }

            if (tabIndex == 0) {
                if (this.tabIds.length > 1) {
                    this.showTab(this.tabIds[1]);
                }
            } else {
                this.showTab(this.tabIds[tabIndex - 1]);
            }
        }

        this.closeTabNoReplacement(tabId);
    }

    public async reloadTab(tabId: number) {
        const tabState = this.editorStates.get(tabId);
        if (!tabState) { throw new Error("Unknown tab"); }

        const tabIndex = this.tabIds.indexOf(tabId);
        if (tabIndex < 0) { throw new Error("Tab not found in tabs list"); }

        const lastActiveTabId = this.activeTab?.id;

        this.closeTabNoReplacement(tabId);

        const newTabId = await this.openTab(tabState.fileName, tabIndex);

        if (newTabId === undefined) { return; }

        // keep camera state
        const newTabState = this.editorStates.get(newTabId)!;
        newTabState.cameraState = tabState.cameraState;

        if (lastActiveTabId === tabId) {
            this.showTab(newTabId);
        }
    }

    public registerPlugin(plugin: EditorPlugin) {
        if (this.activeTab?.editor) {
            this._addPluginToEditor(this.activeTab.editor, plugin);
        }
        this.plugins.push(plugin);
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
        return state.saveData;
    }

    public saveAll(): { promise: Promise<unknown>, tabsToSave: number } {
        const promises: Promise<unknown>[] = [];
        for (const tab of this.tabIds) {
            if (this.checkTabDirty(tab)) {
                promises.push(this.saveTab(tab));
            }
        }
        return {
            promise: Promise.all(promises),
            tabsToSave: promises.length
        };
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
            if (confirm(`The file '${state.fileName}' was modified externally (maybe by another FlowEditor tab) since you last opened it. Do you want to overwrite it?`)) {
                return await this.project.writeFlowSave(state.fileName, saveStr, true);
            }
        }

        state.ignoreExternallyModified = false;
    }

    /**
     * Closes a tab. If the tab is the current active tab, the active editor
     * is removed.
     */
    private closeTabNoReplacement(tabId: number) {
        const tabIndex = this.tabIds.indexOf(tabId);
        if (tabIndex < 0) { throw new Error("Unknown tab id"); }

        if (this.activeTab && this.activeTab.id === tabId) {
            this.removeActiveEditor();
            this.onTabActiveChange.send(null);
        }

        this.editorStates.delete(tabId);
        this.tabIds.splice(tabIndex, 1);
        this.onTabClose.send(tabId);
    }

    private setActiveEditor(editor: Editor, cameraState: EditorTabState['cameraState'], tabId: number) {
        this.removeActiveEditor();
        pluginHooks.onEditorLoad(editor);
        this.activeTab = { editor, id: tabId };
        this.onTabActiveChange.send(tabId);
        this.engine.world.addElm(editor);
        this.engine.camera.goto(cameraState.position, cameraState.scale);
        this.engine.ticker.requestTick();
    }

    /**
     * Stores the active editor into editorStates and removes the editor from
     * the world.
     * 
     * This method should be the only way to to remove an editor.
     * 
     * Callers of this method are expected to emit a tabActiveChange event, which
     * may be a different tab or null if the editor is not replaced.
     */
    private removeActiveEditor() {
        if (!this.activeTab) { return; }

        const state = this.editorStates.get(this.activeTab.id)!;
        pluginHooks.onEditorUnload(this.activeTab.editor);
        state.saveData = this.activeTab.editor.serialize();
        state.cameraState = this.getCurrentCameraState();
        state.dirty ||= this.activeTab.editor.dirty;
        this.activeTab.editor.remove();
        this.activeTab = undefined;
        this.engine.ticker.requestTick();
    }

    private async createTabForFile(fileName: string): Promise<[EditorTabState, number] | undefined> {
        if (!this.project.isReady()) { await this.project.onReady.promise(); }
        try {
            const save = await this.project.getFlowSave(fileName);

            return [{
                fileName,
                ignoreExternallyModified: false,
                cameraState: { position: new Vec2M(0, 0), scale: this.engine.camera.getScale() },
                dirty: false,
                saveData: save
            }, this.nextTabId++];
        } catch (err) {
            alert(`Failed to open the flow '${fileName}'. The file may be corrupted. See console for error details.`);
            console.error(err);
        }
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

    private checkTabDirty(tabId: number) {
        const state = this.editorStates.get(tabId);
        if (!state) { throw new Error("Unknown tabId"); }

        if (this.activeTab?.id === tabId) {
            return this.activeTab.editor.dirty || state.dirty;
        }

        return state.dirty;
    }

    private async saveTab(tabId: number) {
        await this.writeSaveDataForTab(tabId, this.getSaveDataForTab(tabId));
        this.editorStates.get(tabId)!.dirty = false;
        if (tabId === this.activeTab?.id) {
            this.activeTab.editor.dirty = false;
        }
    }

    private async checkTabExternallyModified(tabId: number) {
        const editorOpenFile = this.editorStates.get(tabId);
        if (!editorOpenFile) { return; }

        const isLatest = await this.project.checkIsLatestFlowSave(editorOpenFile.fileName);

        if (!isLatest && !editorOpenFile.ignoreExternallyModified) {
            editorOpenFile.ignoreExternallyModified = true;
            if (confirm(`The file '${editorOpenFile.fileName}' was modified externally (maybe by another FlowEditor tab) since you last opened it. Do you want to reload the editor?`)) {
                this.reloadTab(tabId);
            }
        }
    }

    private getCurrentCameraState(): EditorTabState['cameraState'] {
        return {
            position: this.engine.camera.rect.topLeft(),
            scale: this.engine.camera.getScale()
        };
    }

}