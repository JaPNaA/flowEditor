import { Editor } from "../../editor/Editor.js";
import { InstructionGroupEditor } from "../../editor/InstructionGroupEditor.js";
import { PluginAnalyser } from "../EditorPlugin.js";
import { VNContentInstrOneLine } from "./visualNovel.js";

export class VisualNovelAnalyser implements PluginAnalyser {
    constructor() {
    }

    public onFlowLoad(editor: Editor): void {
        let context = undefined;
        const starts = new Map<InstructionGroupEditor, string>()

        for (const group of editor.getGroups()) {
            for (const instruction of group.getInstructions()) {
                if (instruction instanceof VNContentInstrOneLine) {
                    if (instruction.contextSet) {
                        context = instruction.contextSet;
                    }
                    if (context) {
                        instruction.backgroundColor = context;
                    }
                }
            }
            for (const child of group._childGroups) {
                const existing = starts.get(child);
                if (existing && existing !== context) {
                    // already set -- is conflict
                    starts.set(child, "#000");
                } else if (context) {
                    starts.set(child, context);
                }
            }
            context = undefined;
        }

        for (const [group, context] of starts) {
            let fallsOver = true;
            for (const instruction of group.getInstructions()) {
                if (instruction instanceof VNContentInstrOneLine) {
                    if (instruction.contextSet) {
                        fallsOver = false;
                        break;
                    }
                    if (context) {
                        instruction.backgroundColor = context;
                    }
                }
            }
            if (fallsOver) {
                for (const child of group._childGroups) {
                    const existing = starts.get(child);
                    if (existing && existing !== context) {
                        // already set -- is conflict
                        starts.set(child, "#000");
                    } else {
                        starts.set(child, context);
                    }
                }
            }
        }
    }

    public onEdit(): void {
        throw new Error("Method not implemented.");
    }

    public dispose(): void {
        throw new Error("Method not implemented.");
    }
}