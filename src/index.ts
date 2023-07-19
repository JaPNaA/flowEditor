import { ExecuterContainer } from "./executer/ExecuterContainer.js";
import { EditorContainer } from "./editor/EditorContainer.js";
import VisualNovelPlugin from "./plugins/visualNovel/visualNovel.js";
import { Elm } from "./japnaaEngine2d/elements.js";
import { DefaultPlugin } from "./plugins/default/default.js";

export const appHooks = {
    focusEditor() {
        return editorContainer.focus();
    },

    runFlow() {
        return executerContainer.execute();
    },

    getCompiledFlowFromEditor() {
        return editorContainer.compile();
    },

    getEditorSaveData() {
        return editorContainer.getSaveData();
    },

    setEditorSaveData(data: any) {
        editorContainer.preventSaveOnExit = true;
        editorContainer.setSaveData(data);
        location.reload();
    }
};

export const pluginHooks = {
    startExecution(): Promise<void> {
        return visualNovelPlugin.executer.start(executerContainer);
    },

    runInstruction(instruction: any) {
        return visualNovelPlugin.executer.run(instruction);
    },

    stopExecution() {
        return visualNovelPlugin.executer.stop();
    }
};

const executerContainer = new ExecuterContainer();
const editorContainer = new EditorContainer();

new Elm().class("main").append(
    editorContainer,
    executerContainer
).appendTo(document.body);

// load plugins
const defaultPlugin = new DefaultPlugin();
const visualNovelPlugin = new VisualNovelPlugin();

editorContainer.registerPlugin(defaultPlugin);
editorContainer.registerPlugin(visualNovelPlugin);
