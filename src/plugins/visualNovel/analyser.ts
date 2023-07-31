import { Editor } from "../../editor/Editor.js";
import { InstructionGroupEditor } from "../../editor/InstructionGroupEditor.js";
import { UndoableAction } from "../../editor/editing/actions.js";
import { PluginAnalyser } from "../EditorPlugin.js";
import { VNContentInstrOneLine } from "./visualNovel.js";

type Context = {
    conflict?: boolean,
    backgroundColor?: string,
    backgroundSrc?: string
};

export class VisualNovelAnalyser implements PluginAnalyser {
    constructor() {
    }

    public onFlowLoad(editor: Editor): void {
        let context: Context | undefined = undefined;
        const starts = new Map<InstructionGroupEditor, Context>()

        for (const group of editor.getGroups()) {
            for (const instruction of group.getInstructions()) {
                if (instruction instanceof VNContentInstrOneLine) {
                    if (instruction.contextSet) {
                        context = instruction.contextSet;
                    }
                    if (context) {
                        instruction.backgroundColor = context.backgroundColor;
                        instruction.backgroundSrc = context.backgroundSrc;
                    }
                }
            }
            for (const child of group._childGroups) {
                const existing = starts.get(child);
                if (existing && context && !this.equalContext(existing, context)) {
                    // already set -- is conflict
                    starts.set(child, { conflict: true });
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
                        instruction.backgroundColor = context.backgroundColor;
                        instruction.backgroundSrc = context.backgroundSrc;
                    }
                }
            }
            if (fallsOver) {
                for (const child of group._childGroups) {
                    const existing = starts.get(child);
                    if (existing && !this.equalContext(existing, context)) {
                        // already set -- is conflict
                        starts.set(child, { conflict: true });
                    } else {
                        starts.set(child, context);
                    }
                }
            }
        }
    }

    private equalContext(a: Context, b: Context) {
        if (a.backgroundSrc && b.backgroundSrc) {
            return a.backgroundSrc === b.backgroundSrc;
        } else if (a.backgroundSrc || b.backgroundSrc) {
            return false;
        } else {
            return a.backgroundColor === b.backgroundColor;
        }
    }

    public onActionPerformed(action: UndoableAction): void {
        console.log(action);
    }

    public dispose(): void {
        throw new Error("Method not implemented.");
    }
}