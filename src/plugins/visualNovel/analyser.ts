import { Editor } from "../../editor/editor/Editor";
import { InstructionGroupEditor } from "../../editor/editor/InstructionGroupEditor";
import { AddGroupAction, AddInstructionAction, BranchTargetChangeAction, EditableEditAction, RemoveGroupAction, RemoveInstructionAction, UndoableAction } from "../../editor/editor/editing/actions";
import { PluginAnalyser } from "../../editor/EditorPlugin";
import { VNContentInstrOneLine, VNInstructionContext } from "./visualNovel";

interface Context extends VNInstructionContext {
    conflict?: boolean;
}

export class VisualNovelAnalyser implements PluginAnalyser {
    private groupStartContexts = new Map<InstructionGroupEditor, Context>();
    private visitedGroupsSet = new Set<InstructionGroupEditor>();

    public onFlowLoad(editor: Editor): void {
        let context: Context | undefined = undefined;

        for (const group of editor.getGroups()) {
            for (const { instruction } of group.block.children) {
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
            for (const { instruction } of group.block.children) {
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
        this.visitedGroupsSet.clear();

        if (action instanceof EditableEditAction) {
            const block = action.editable.parentLine.parentBlock;
            const instruction = block.instruction;
            const group = block.getGroupEditor()?.editor;
            if (group && instruction instanceof VNContentInstrOneLine && instruction.contextSet) {
                instruction.context = instruction.contextSet;
                this.propagateContext(group, group.block.children.indexOf(block) + 1, instruction.contextSet);
            }
        } else if (action instanceof AddInstructionAction) {
            const addedInstruction = action.block;
            if (!(addedInstruction instanceof VNContentInstrOneLine)) { return; }

            if (addedInstruction.contextSet) {
                const newContext = addedInstruction.contextSet;
                addedInstruction.context = addedInstruction.contextSet;
                const group = action.parentBlock.getGroupEditor();
                if (group) {
                    this.propagateContext(group.editor, action.relativeIndex + 1, newContext);
                }
            } else {
                // update non-context-setting instruction context
                let lastContext;
                for (let i = action.relativeIndex - 1; i >= 0; i--) {
                    const instruction = action.parentBlock.children[i];
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
                    const group = action.parentBlock.getGroupEditor();
                    if (group) {
                        addedInstruction.context = this.groupStartContexts.get(group.editor);
                    }
                }
            }
        } else if (action instanceof RemoveInstructionAction) {
            if (action.removedInstruction instanceof VNContentInstrOneLine && action.removedInstruction.contextSet) {
                const group = action.block.getGroupEditor();
                if (group) {
                    this.propagateContext(
                        group.editor,
                        action.relativeIndex,
                        this.getContextAt(group.editor, action.relativeIndex - 1)
                    );
                }
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
        return this.getContextAt(group, group.block.numInstructions - 1);
    }

    private getContextAt(group: InstructionGroupEditor, index: number) {
        for (let i = index; i >= 0; i--) {
            const instruction = group.block.children[i];
            if (instruction instanceof VNContentInstrOneLine) {
                if (instruction.context) {
                    return instruction.context;
                }
            }
        }
        return this.groupStartContexts.get(group);
    }

    private propagateContext(group: InstructionGroupEditor, startIndex: number, context: Context | undefined) {
        for (let i = startIndex; i < group.block.numInstructions; i++) {
            const instruction = group.block.children[i];
            if (instruction instanceof VNContentInstrOneLine) {
                if (
                    instruction.contextSet || // is setter -- stop propagation
                    (context ?
                        instruction.context && this.equalContext(instruction.context, context) :
                        context === instruction.context
                    ) // is already set -- don't need to propagate
                ) {
                    return;
                } else {
                    instruction.context = context;
                }
            }
        }

        for (const child of group._childGroups) {
            if (this.visitedGroupsSet.has(group)) { continue; }
            this.visitedGroupsSet.add(group);
            this.updateGroupStart(child);
        }
    }

    public dispose(): void {
        throw new Error("Method not implemented.");
    }
}