import { ExecuterContainer } from "./executer/ExecuterContainer.js";
import { EditorContainer } from "./editor/EditorContainer.js";

export const appHooks = {
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

const executerContainer = new ExecuterContainer();
executerContainer.appendTo(document.body);

const editorContainer = new EditorContainer();
editorContainer.appendTo(document.body);
