import { EditorSaveData } from "./EditorSaveData";

export const defaultNewEditorSaveData: EditorSaveData = {
    startGroup: 0,
    elms: [{ branches: [], children: [], instructions: [{ ctrl: 'nop' }, { ctrl: 'end' }], id: 0, x: 8, y: 24 }]
};