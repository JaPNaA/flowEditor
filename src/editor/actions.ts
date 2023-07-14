import { removeElmFromArray } from "../japnaaEngine2d/util/removeElmFromArray.js";
import { Editor } from "./Editor.js";
import { InstructionGroupEditor } from "./InstructionGroupEditor.js";
import { Instruction } from "./instructionLines.js";

export class UndoLog {
    private currLogGroup: UndoableAction[] = [];
    private log: UndoableAction[][] = [];

    private groupDepth = 0;
    private frozen = false;

    public undo() {
        this.flushLogGroup();
        const logs = this.log.pop();
        if (!logs) { return; }
        let log;
        while (log = logs.pop()) {
            log.inverse().perform();
        }
    }

    public freeze() {
        this.frozen = true;
    }

    public thaw() {
        this.frozen = false;
    }

    public startGroup() {
        this.groupDepth++;
    }

    public endGroup() {
        this.groupDepth--;
        if (this.groupDepth == 0) {
            this.flushLogGroup();
        } else if (this.groupDepth < 0) {
            throw new Error("Undo group depths not matching");
        }
    }

    public perform(action: UndoableAction) {
        if (!this.frozen) { this.currLogGroup.push(action); }
        action.perform();
    }

    private flushLogGroup() {
        if (this.currLogGroup.length) {
            this.log.push(this.currLogGroup);
            this.currLogGroup = [];
        }
    }
}

export interface UndoableAction {
    perform(): void;
    inverse(): UndoableAction;
}

export class AddGroupAction implements UndoableAction {
    constructor(private group: InstructionGroupEditor, private editor: Editor) { }

    public perform(): void {
        this.editor._groupEditors.push(this.group);
        this.editor._children.addChild(this.group);
        this.editor.cursor.registerInstructionGroup(this.group);
    }

    public inverse(): RemoveGroupAction {
        return new RemoveGroupAction(this.group, this.editor);
    }
}

export class RemoveGroupAction implements UndoableAction {
    constructor(private group: InstructionGroupEditor, private editor: Editor) { }

    public perform(): void {
        removeElmFromArray(this.group, this.editor._groupEditors);
        this.editor._children.removeChild(this.group);
        this.editor.cursor.unregisterInstructionGroup(this.group);
    }

    public inverse(): AddGroupAction {
        return new AddGroupAction(this.group, this.editor);
    }
}

export class AddInstructionAction implements UndoableAction {
    constructor(private instruction: Instruction, private index: number, private group: InstructionGroupEditor) { }

    public perform(): void {
        const newLines = this.instruction.getLines();
        const nextInstruction = this.group.getInstructions()[this.index];

        this.instruction._setParent(this.group);

        if (nextInstruction) {
            const nextLine = nextInstruction.getLines()[0];
            const nextLineElm = nextLine.elm.getHTMLElement();
            const lineIndex = this.group.getLines().indexOf(nextLine);

            for (const line of newLines) {
                this.group.elm.getHTMLElement().insertBefore(line.elm.getHTMLElement(), nextLineElm);
            }

            this.group._lines.splice(lineIndex, 0, ...newLines);
            this.group._instructions.splice(this.index, 0, this.instruction);
        } else {
            for (const line of newLines) {
                this.group.elm.append(line);
            }

            this.group._lines.push(...newLines);
            this.group._instructions.push(this.instruction);
        }

        for (const line of newLines) {
            this.group._htmlInstructionLineToJS.set(line.elm.getHTMLElement(), line);
        }

        this.group.updateHeight();
    }

    public inverse(): RemoveInstructionAction {
        return new RemoveInstructionAction(this.index, this.group);
    }
}

export class RemoveInstructionAction implements UndoableAction {
    private removedInstruction?: Instruction;

    constructor(private index: number, private group: InstructionGroupEditor) { }

    public perform(): void {
        const instruction = this.group._instructions[this.index];
        this.removedInstruction = instruction;
        this.group._removeInstruction(this.index);
        let lineIndex = instruction.getLines()[0].getCurrentLine();
        for (const _ of instruction.getLines()) {
            this.group._removeInstructionLine(lineIndex);
        }

        this.group.updateHeight();
    }

    public inverse(): AddInstructionAction {
        if (!this.removedInstruction) { throw new Error("Cannot inverse before perform"); }
        return new AddInstructionAction(this.removedInstruction, this.index, this.group);
    }
}
