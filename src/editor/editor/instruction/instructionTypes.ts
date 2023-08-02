import { appHooks } from "../../index.js";
import { Component, Elm } from "../../../japnaaEngine2d/elements.js";
import { getAncestorWhich } from "../../utils.js";
import { Editable } from "../editing/Editable.js";
import { InstructionGroupEditor } from "../InstructionGroupEditor.js";
import { TextareaUserInputCaptureAreas } from "../editing/TextareaUserInputCapture.js";
import { BranchTargetChangeAction } from "../editing/actions.js";

export abstract class Instruction {
    public parentGroup!: InstructionGroupEditor;
    protected lines: InstructionLine[] = [];

    /** Return a list of flow control items that perform this instruction */
    public abstract export(): any[];

    /** Return a JSON object that can be used to reconstruct this instruction. */
    public abstract serialize(): any;

    /** Try to remove a line in instruction. Returns true if removed. */
    public abstract removeLine(line: InstructionLine): boolean;

    /**
     * Request inserting a line at (absolute) index.
     * Return true if handled (inserted instruction).
     * If returns false, lets the parent group handle the line insertion.
     */
    public abstract insertLine(index: number): boolean;

    public getIndex() {
        return this.parentGroup.getInstructions().indexOf(this);
    }

    public getLines(): ReadonlyArray<InstructionLine> {
        return this.lines;
    }

    public _setParent(group: InstructionGroupEditor) {
        this.parentGroup = group;
    }

    public requestSelectInstructionGroup(): Promise<InstructionGroupEditor | null> {
        return this.parentGroup.parentEditor.requestSelectInstructionGroup();
    }

    /** Is the instruction a branch? */
    public isBranch() {
        return false;
    }

    /**
     * Does this instruction always jump?
     * If returns true, `isBranch` must also return true.
     */
    public isAlwaysJump() {
        return false;
    }

    public getBranchTargets(): (InstructionGroupEditor | null)[] | null {
        return null;
    }

    public setBranchTargets(_targets: (InstructionGroupEditor | null)[] | null) { }

    public setBranchOffsets(_offsets: (number | null)[]) {
        return;
    }

    protected addLine(line: InstructionLine) {
        this.lines.push(line);
        line._setParent(this);
    }
}

export abstract class InstructionLine extends Component {
    public preferredStartingCharOffset = 0;
    public parentInstruction!: Instruction;

    private areas: TextareaUserInputCaptureAreas = [];
    private spanToEditable = new Map<HTMLSpanElement, Editable>();
    private editables: Editable[] = [];

    constructor() {
        super("instructionLine");
    }

    public _setParent(instruction: Instruction) {
        this.parentInstruction = instruction;
    }

    public getEditableIndexFromSelection(selection: Selection): number {
        const editable = this.getEditableFromSelection(selection);
        if (!editable) { return -1; }
        return this.editables.indexOf(editable);
    }

    public getEditableFromSelection(selection: Selection): Editable | null {
        const thisElm = this.elm.getHTMLElement();
        let directChild = getAncestorWhich(
            selection.anchorNode, node => node.parentElement === thisElm
        ) as Node | Element | null;

        // search backwards
        let curr = directChild;
        while (curr) {
            const editable = this.spanToEditable.get(curr as HTMLSpanElement);
            curr = curr.previousSibling;
            if (editable) {
                return editable;
            }
        }

        // search forwards
        curr = directChild;
        while (curr) {
            const editable = this.spanToEditable.get(curr as HTMLSpanElement);
            curr = curr.nextSibling;
            if (editable) {
                return editable;
            }
        }

        return null;
    }

    public getAreas(): TextareaUserInputCaptureAreas {
        return this.areas;
    }

    protected setAreas(...elements: (string | Editable)[]) {
        let lastStringLength = 0;
        this.areas = [];

        for (const element of elements) {
            if (typeof element === "string") {
                lastStringLength += element.length;
            } else {
                if (lastStringLength) {
                    this.areas.push(lastStringLength);
                    lastStringLength = 0;
                }
                this.areas.push(element);
            }
            this.elm.append(element);
        }
    }

    protected createEditable(text: string | number): Editable {
        const editable = new Editable(text.toString(), this);
        this.registerEditable(editable);
        return editable;
    }

    protected registerEditable<T extends Editable>(editable: T): T {
        this.spanToEditable.set(editable.getHTMLElement(), editable);
        this.editables.push(editable);
        return editable;
    }

    public getEditables(): ReadonlyArray<Editable> {
        return this.editables;
    }

    public getEditableFromIndex(index: number) {
        return this.editables[index];
    }

    public getLastEditableIndex() {
        return this.editables.length - 1;
    }

    public getLastEditableCharacterIndex() {
        return this.editables[this.editables.length - 1].getValue().length;
    }

    public getCurrentLine() {
        return this.parentInstruction.parentGroup.getLines().indexOf(this);
    }
}

export interface OneLineInstruction extends InstructionLine {
    /** Serialize to be loaded into the editor later */
    serialize(): any;
    /** Export into an executable instructions */
    export?(): any[];
    /** Instruction is a branch? */
    isBranch: boolean;
    /** Does this instruction always jump? */
    isAlwaysJump?: boolean;
}

/**
 * One-line instruction. Allows conviently declaring Instruction and it's line
 * in one class.
 */
export class InstructionOneLine<T extends OneLineInstruction> extends Instruction {
    protected line: T;

    constructor(line: T) {
        super();
        this.line = line;
        this.addLine(line);
    }

    public getBranchTargets(): (InstructionGroupEditor | null)[] | null {
        if (this.line instanceof BranchInstructionLine) {
            const branchTarget = this.line.getBranchTarget();
            if (branchTarget) {
                return [branchTarget];
            } else {
                return [null];
            }
        }
        return null;
    }

    public setBranchTargets(targets: (InstructionGroupEditor | null)[] | null): void {
        if (this.line instanceof BranchInstructionLine) {
            this.line.setBranchTarget(targets && targets[0]);
        } else {
            throw new Error("Not a branch");
        }
    }

    public setBranchOffsets(offsets: (number | null)[]): any {
        if (this.line instanceof BranchInstructionLine) {
            return this.line.setBranchOffset(offsets[0] || 1);
        } else {
            throw new Error("Not a branch");
        }
    }

    public isBranch(): boolean {
        return this.line.isBranch;
    }

    public isAlwaysJump(): boolean {
        return this.line.isAlwaysJump || false;
    }

    public removeLine(line: InstructionLine): boolean {
        if (this.line !== line) { throw new Error("Not a line in this instruction"); }
        this.parentGroup.removeInstruction(this.getIndex());
        return true;
    }

    public insertLine(_lineIndex: number): boolean {
        return false;
    }

    public serialize(): any {
        return this.line.serialize();
    }

    public export(): any[] {
        if (this.line.export) {
            return this.line.export();
        } else {
            return [this.line.serialize()];
        }
    }
}

export abstract class BranchInstructionLine extends InstructionLine {
    public branchTarget: InstructionGroupEditor | null = null;
    public branchOffset: number = 0;

    private branchConnectElm: Elm;

    constructor() {
        super();
        this.elm
            .class("hanging")
            .append(this.branchConnectElm =
                new Elm().class("branchConnect").on("click", () => {
                    this.parentInstruction.parentGroup.parentEditor.unsetEditMode();
                    appHooks.focusEditor();
                    this.requestUserToSetBranchTarget();
                }));
    }

    public requestUserToSetBranchTarget() {
        this.branchConnectElm.class("active");
        this.parentInstruction.requestSelectInstructionGroup()
            .then(editor => {
                this.branchConnectElm.removeClass("active");
                if (editor) {
                    this.setBranchTarget(editor);
                }
            });
    }

    public getBranchTarget() {
        return this.branchTarget;
    }

    /** DO NOT CALL OUTSIDE OF `UndoableAction` */
    public _updateElmState() {
        if (this.branchTarget) {
            this.elm.removeClass("hanging");
        } else {
            this.elm.class("hanging");
        }
    }

    public setBranchOffset(branchOffset: number) {
        this.branchOffset = branchOffset;
    }

    public setBranchTarget(target: InstructionGroupEditor | null) {
        this.parentInstruction.parentGroup.parentEditor.undoLog.startGroup();
        this.parentInstruction.parentGroup.parentEditor.undoLog.perform(
            new BranchTargetChangeAction(target, this)
        );
        this.parentInstruction.parentGroup.parentEditor.undoLog.endGroup();
    }
}