import { ExecuterContainer } from "./executer/ExecuterContainer.js";
import { EditorContainer } from "./editor/EditorContainer.js";
import VisualNovelPlugin from "./plugins/visualNovel/visualNovel.js";
import { InstructionLineView } from "./editor/instructionLines.js";

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

export const pluginHooks = {
    parseInstruction(instruction: any): undefined | InstructionLineView {
        return plugin.parse(instruction);
    },

    getKeyInstructionMappingKeys(): string[] {
        return Object.keys(plugin.keyMappings);
    },

    getInstructionFromKeyMappingKey(key: string) {
        return plugin.keyMappings[key]();
    },

    runInstruction(instruction: any) {
        return plugin.executer.run(instruction);
    }
};

const executerContainer = new ExecuterContainer();
executerContainer.appendTo(document.body);

const editorContainer = new EditorContainer();
editorContainer.appendTo(document.body);

// load visualNovel plugin
const plugin = new VisualNovelPlugin();
