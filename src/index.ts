import { ExecuterContainer } from "./executer/ExecuterContainer.js";
import { EditorContainer } from "./editor/EditorContainer.js";

export const appHooks = {
    getCompiledFlowFromEditor() {
        return editorContainer.compile();
    },

    deleteAndReloadRequested: false
};

const executerContainer = new ExecuterContainer();
executerContainer.appendTo(document.body);

const editorContainer = new EditorContainer();
editorContainer.appendTo(document.body);
