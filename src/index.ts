import { ExecuterContainer } from "./executer/ExecuterContainer.js";
import { EditorContainer } from "./editor/EditorContainer.js";
import VisualNovelPlugin from "./plugins/visualNovel/visualNovel.js";
import { Instruction } from "./editor/instructionLines.js";
import { Elm } from "./japnaaEngine2d/elements.js";

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
    parseInstruction(instruction: any): undefined | Instruction {
        return plugin.parse(instruction);
    },

    getKeyInstructionMappingKeys(): string[] {
        return Object.keys(plugin.keyMappings);
    },

    getInstructionFromKeyMappingKey(key: string) {
        return plugin.keyMappings[key]?.();
    },

    startExecution(): Promise<void> {
        return plugin.executer.start(executerContainer);
    },

    runInstruction(instruction: any) {
        return plugin.executer.run(instruction);
    },

    stopExecution() {
        return plugin.executer.stop();
    }
};

const executerContainer = new ExecuterContainer();
const editorContainer = new EditorContainer();

new Elm().class("main").append(
    editorContainer,
    executerContainer
).appendTo(document.body);

// load visualNovel plugin
const plugin = new VisualNovelPlugin();
