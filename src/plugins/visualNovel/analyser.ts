import { Editor } from "../../editor/Editor.js";
import { InstructionGroupEditor } from "../../editor/InstructionGroupEditor.js";
import { AddGroupAction, AddInstructionAction, BranchTargetChangeAction, EditableEditAction, RemoveGroupAction, RemoveInstructionAction, UndoableAction } from "../../editor/editing/actions.js";
import { PluginAnalyser } from "../EditorPlugin.js";
import { VNContentInstrOneLine, VNInstructionContext } from "./visualNovel.js";

interface Context extends VNInstructionContext {
    conflict?: boolean;
}

export class VisualNovelAnalyser implements PluginAnalyser {
    private groupStartContexts = new Map<InstructionGroupEditor, Context>();

    public onFlowLoad(editor: Editor): void {
        let context: Context | undefined = undefined;

        for (const group of editor.getGroups()) {
            for (const instruction of group.getInstructions()) {
                if (instruction instanceof VNContentInstrOneLine) {
                    if (instruction.contextSet) {
                        context = instruction.contextSet;
                    }
                    if (context) {
                        instruction.context = context;
                    }
                }
            }
            for (const child of group._childGroups) {
                const existing = this.groupStartContexts.get(child);
                if (existing && context && !this.equalContext(existing, context)) {
                    // already set -- is conflict
                    this.groupStartContexts.set(child, { conflict: true });
                } else if (context) {
                    this.groupStartContexts.set(child, context);
                }
            }
            context = undefined;
        }

        for (const [group, context] of this.groupStartContexts) {
            let fallsOver = true;
            for (const instruction of group.getInstructions()) {
                if (instruction instanceof VNContentInstrOneLine) {
                    if (instruction.contextSet) {
                        fallsOver = false;
                        break;
                    }
                    if (context) {
                        instruction.context = context;
                    }
                }
            }
            if (fallsOver) {
                for (const child of group._childGroups) {
                    const existing = this.groupStartContexts.get(child);
                    if (existing && !this.equalContext(existing, context)) {
                        // already set -- is conflict
                        this.groupStartContexts.set(child, { conflict: true });
                    } else {
                        this.groupStartContexts.set(child, context);
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
        if (action instanceof EditableEditAction) {
            const instruction = action.editable.parentLine.parentInstruction;
            if (instruction instanceof VNContentInstrOneLine && instruction.contextSet) {
                this.propagateContext(instruction.parentGroup, instruction.getIndex(), instruction.contextSet);
            }
        } else if (action instanceof AddInstructionAction) {
            const addedInstruction = action.instruction;
            if (!(addedInstruction instanceof VNContentInstrOneLine)) { return; }

            if (addedInstruction.contextSet) {
                const newContext = addedInstruction.contextSet;
                addedInstruction.context = newContext;
                this.propagateContext(action.group, action.index, newContext);
            } else {
                // update non-context-setting instruction context
                const instructions = action.group.getInstructions();
                let lastContext;
                for (let i = action.index - 1; i >= 0; i--) {
                    const instruction = instructions[i];
                    if (instruction instanceof VNContentInstrOneLine) {
                        if (instruction.context) {
                            lastContext = instruction.context;
                            break;
                        }
                    }
                }
                if (lastContext) {
                    addedInstruction.context = lastContext;
                } else {
                    addedInstruction.context = this.groupStartContexts.get(action.group);
                }
            }
        } else if (action instanceof RemoveInstructionAction) {
            if (action.removedInstruction instanceof VNContentInstrOneLine && action.removedInstruction.contextSet) {
                this.propagateContext(
                    action.group,
                    action.index,
                    this.getContextAt(action.group, action.index - 1)
                );
            }
        } else if (action instanceof BranchTargetChangeAction) {
            if (action.previousBranchTarget) {
                this.updateGroupStart(action.previousBranchTarget);
            }
            if (action.branchTarget) {
                this.updateGroupStart(action.branchTarget);
            }
        } else if (action instanceof RemoveGroupAction || action instanceof AddGroupAction) {
            for (const child of action.group._childGroups) {
                this.updateGroupStart(child);
            }
        }
    }

    private updateGroupStart(group: InstructionGroupEditor) {
        let startContext: Context | undefined;
        for (const parent of group._parentGroups) {
            if (startContext) {
                const context = this.getGroupEnd(parent);
                if (context && !this.equalContext(startContext, context)) {
                    startContext = { conflict: true };
                }
            } else {
                startContext = this.getGroupEnd(parent);
            }
        }
        if (startContext) {
            this.groupStartContexts.set(group, startContext);
        } else {
            this.groupStartContexts.delete(group);
        }
        this.propagateContext(group, 0, startContext);
    }

    private getGroupEnd(group: InstructionGroupEditor) {
        return this.getContextAt(group, group.getInstructions().length - 1);
    }

    private getContextAt(group: InstructionGroupEditor, index: number) {
        const instructions = group.getInstructions();
        for (let i = index; i >= 0; i--) {
            const instruction = instructions[i];
            if (instruction instanceof VNContentInstrOneLine) {
                if (instruction.context) {
                    return instruction.context;
                }
            }
        }
        return this.groupStartContexts.get(group);
    }

    private propagateContext(group: InstructionGroupEditor, startIndex: number, context: Context | undefined) {
        const instructions = group.getInstructions();
        for (let i = startIndex; i < instructions.length; i++) {
            const instruction = instructions[i];
            if (instruction instanceof VNContentInstrOneLine) {
                if (instruction.contextSet && i !== startIndex) {
                    return;
                } else {
                    instruction.context = context;
                }
            }
        }

        for (const child of group._childGroups) {
            this.updateGroupStart(child);
        }
    }

    public dispose(): void {
        throw new Error("Method not implemented.");
    }
}