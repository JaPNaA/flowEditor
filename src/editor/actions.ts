import { removeElmFromArray } from "../japnaaEngine2d/util/removeElmFromArray.js";
import { Editor } from "./Editor.js";
import { InstructionGroupEditor } from "./InstructionGroupEditor.js";

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

//