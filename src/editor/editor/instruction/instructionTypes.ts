import { appHooks } from "../../index";
import { Component, Elm } from "../../../japnaaEngine2d/elements";
import { getAncestorWhich } from "../../utils";
import { Editable } from "../editing/Editable";
import { InstructionGroupEditor } from "../InstructionGroupEditor";
import { TextareaUserInputCaptureAreas } from "../editing/TextareaUserInputCapture";
import { BranchTargetChangeAction } from "../editing/actions";
import { CompositeInstructionBlock, InstructionBlock, SingleInstructionBlock } from "./InstructionBlock";

export abstract class Instruction {
    /** Block containing the instruction's lines. Only to be used by InstructionBlock and this class. */
    public abstract block: InstructionBlock;

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

    public requestSelectInstructionGroup(): Promise<InstructionGroupEditor | null> {
        const group = this.block.getGroupEditor();
        if (group) {
            return group.editor.parentEditor.requestSelectInstructionGroup();
        }
        return Promise.resolve(null);
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
}

export abstract class InstructionLine extends Component {
    public preferredStartingCharOffset = 0;
    public parentBlock!: InstructionBlock;

    private areas: TextareaUserInputCaptureAreas = [];
    private spanToEditable = new Map<HTMLSpanElement, Editable>();
    private editables: Editable[] = [];

    constructor() {
        super("instructionLine");
    }

    public _setParent(instruction: InstructionBlock) {
        this.parentBlock = instruction;
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
    public block: SingleInstructionBlock = new SingleInstructionBlock(this);

    protected line: T;

    constructor(line: T) {
        super();
        this.line = line;
        this.block._insertLine(0, line);
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
        if (!this.block.parent) { throw new Error("Cannot remove instruction from no parent"); }
        this.block.parent.removeBlock(this.block);
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

class CompositeInstructionBlockWithOpeningLine extends CompositeInstructionBlock {
    constructor(public openingLine: InstructionLine, public instruction: Instruction) {
        super();
        const openingBlock = new SingleInstructionBlock();
        openingBlock._appendLine(openingLine);
        this._appendBlock(openingBlock);
    }
}

export abstract class InstructionComposite extends Instruction {
    public block: CompositeInstructionBlockWithOpeningLine;
    public childInstructions: Instruction[] = [];

    constructor(protected openingLine: InstructionLine) {
        super();
        this.block = new CompositeInstructionBlockWithOpeningLine(this.openingLine, this);
    }

    public insertLine(index: number): boolean {
        console.log("Composite insert", index);
        const newInstruction = this.createNewInstruction();
        this.block.insertBlock(index, newInstruction.block);
        return true;
    }

    // private insertInstruction(instruction: Instruction, index: number) {
    //     const previousInstruction = this.childInstructions[index - 1];
    //     this.childInstructions.splice(index, 0, instruction);
    //     if (previousInstruction) {
    //         const previousLines = previousInstruction.getLines();
    //         this.lines.splice(previousLines[0].getCurrentLine(), 0, ...instruction.getLines());
    //     } else {
    //         for (const line of instruction.getLines()) {
    //             this.lines.push(line);
    //         }
    //     }
    // }

    protected abstract createNewInstruction(): Instruction;
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
                    this.parentBlock.getGroupEditor()?.editor.unsetEditMode();
                    appHooks.focusEditor();
                    this.requestUserToSetBranchTarget();
                }));
    }

    public requestUserToSetBranchTarget() {
        this.branchConnectElm.class("active");
        this.parentBlock.instruction!.requestSelectInstructionGroup()
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
        const editor = this.parentBlock.getGroupEditor()?.editor.parentEditor;
        if (!editor) { throw new Error("No editor attached"); }
        editor.undoLog.startGroup();
        editor.undoLog.perform(
            new BranchTargetChangeAction(target, this)
        );
        editor.undoLog.endGroup();
    }
}