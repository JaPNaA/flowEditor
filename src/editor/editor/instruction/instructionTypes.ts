import { appHooks } from "../../index";
import { Component, Elm } from "../../../japnaaEngine2d/elements";
import { Editable } from "../editing/Editable";
import { InstructionGroup } from "../InstructionGroup";
import { CompositeInstructionBlock, InstructionBlock, SingleInstructionBlock } from "./InstructionBlock";
import { UndoableAction } from "../editing/actions/UndoableAction";
import { removeElmFromArray } from "../../../japnaaEngine2d/util/removeElmFromArray";
import { ActionBusDispatchable } from "../editing/actions/ActionBus";
import { RequestAccepter } from "../editing/requests/RequestAccepter";
import { EditRequest } from "../editing/requests/requests";

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

    public requestSelectInstructionGroup(): Promise<InstructionGroup | null> {
        const group = this.block.getGroup();
        if (group) {
            return group.group.parentEditor.requestSelectInstructionGroup();
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

    public getBranchTargets(): (InstructionGroup | null)[] | null {
        return null;
    }

    public setBranchTargets(_targets: (InstructionGroup | null)[] | null) { }

    public setBranchOffsets(_offsets: (number | null)[]) {
        return;
    }
}

export abstract class InstructionLine extends Component {
    public preferredStartingCharOffset = 0;
    public parentBlock!: InstructionBlock;

    public editRequestAccepter = new RequestAccepter<EditRequest>();

    /**
     * Instruction areas.
     * 
     * Each instruction MUST contain at least one editable. There must be
     * no two consecutive strings or two consecutive editables.
     * 
     * Strings cannot be empty.
     */
    private areas: (Editable | string)[] = [];
    private spanToEditable = new Map<HTMLSpanElement, Editable>();
    private editables: Editable[] = [];

    constructor() {
        super("instructionLine");
    }

    public _setParent(instruction: InstructionBlock) {
        this.parentBlock = instruction;
    }

    public reset() {
        this.elm.clear();
        let isLineEmpty = true;

        for (const element of this.areas) {
            this.elm.append(element);
            if (typeof element === "string" || element.getValue()) {
                isLineEmpty = false;
            }
        }

        // need a <br> for an empty line so the user can
        // move the cursor and delete the line in
        // for ContentEditableInputCapture
        if (isLineEmpty) {
            this.elm.append(new Elm("br"));
        }
    }

    public resetEditables() {
        for (const editable of this.editables) {
            editable.update();
        }
    }

    /**
     * Find the corresponding editable and offset in editable.
     * 
     * Used for identifying which editable a user is typing into.
     * 
     * @param charIndex Character index on this line
     */
    public getEditableAndOffsetFromCharIndex(charIndex: number): {
        editable: Editable,
        editableIndex: number,
        offset: number
    } | null {
        let editableIndex = 0;
        for (const area of this.areas) {
            if (typeof area === 'string') {
                charIndex -= area.length;
                // not <= to account for the possibility we have the
                // charIndex at the start (charIndex = 0) of the next Editable
                if (charIndex < 0) { return null; }
            } else {
                const value = area.getValue();
                if (charIndex <= value.length) {
                    return { editable: area, editableIndex, offset: charIndex };
                }
                charIndex -= value.length;
                editableIndex++;
            }
        }
        return null;
    }

    /**
     * Find the character index of the first character of an editable
     * relative to this line.
     * 
     * Used for getting cursor coordinates from an EditorCursorPositionAbsolute.
     */
    public getCharIndexOfEditable(editable: Editable) {
        let offset = 0;
        for (const area of this.areas) {
            if (typeof area === 'string') {
                offset += area.length;
            } else {
                if (area === editable) {
                    return offset;
                }
                offset += area.getValue().length;
            }
        }
        return -1;
    }

    /**
     * Find the editable "closest" to a character index.
     * 
     * If `backwardsFirst`, finds the closest editable to the left first, then
     * the closest to the right.
     * If not `backwardsFirst`, finds the closest editable to the right first,
     * then the closest to the left.
     * 
     * Used for repositioning the cursor after a user clicks to move the
     * cursor.
     * 
     * @param charIndex Character index on this line
     * @param backwardsFirst Check closest editable to the left first?
     */
    public getClosestEditableIndexToCharIndex(charIndex: number, backwardsFirst: boolean): number {
        let editableIndex = 0;
        for (const area of this.areas) {
            if (typeof area === 'string') {
                charIndex -= area.length;
                // not <= to account for the possibility we have the
                // charIndex at the start (charIndex = 0) of the next Editable
                if (charIndex < 0) {
                    if (backwardsFirst) {
                        return editableIndex - 1;
                    } else {
                        return editableIndex;
                    }
                }
            } else {
                const value = area.getValue();
                if (charIndex <= value.length) {
                    return editableIndex;
                }
                charIndex -= value.length;
                editableIndex++;
            }
        }

        return editableIndex - 1;
    }

    /**
     * Take a DOM Node that is a descendant of this line and find the
     * character index of the node from the start of the line.
     */
    public getNodeCharIndex(node: Node) {
        const parentList = [];
        let currNode: Node | null = node;
        while (true) {
            if (!currNode) { throw new Error("Node is not a descendant of this line"); }
            if (currNode === this.elm.getHTMLElement()) {
                break;
            }
            parentList.push(currNode);
            currNode = currNode.parentNode;
        }

        let charIndex = 0;
        currNode = this.elm.getHTMLElement().firstChild;
        let target = parentList.pop();
        while (target) {
            if (!currNode) { throw new Error("Traversal failed"); }
            if (currNode === target) {
                currNode = currNode.childNodes[0];
                target = parentList.pop();
            } else {
                charIndex += currNode.textContent ? currNode.textContent.length : 0;
                currNode = currNode.nextSibling;
            }
        }
        return charIndex;
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

    public getAreas() {
        return this.areas;
    }

    /**
     * Set areas for the instruction.
     * 
     * Each area is either a noneditable string, or an editable.
     * 
     * Each instruction MUST contain at least one editable. There must be
     * no two consecutive strings or two consecutive editables.
     */
    protected setAreas(...elements: (string | Editable)[]) {
        this.areas = elements;
        this.reset();
    }

    protected createEditable(text: string | number): Editable {
        const editable = new Editable(text.toString(), this);
        this.registerEditable(editable);
        return editable;
    }

    protected registerEditable<T extends Editable>(editable: T): T {
        this.spanToEditable.set(editable.getHTMLElement(), editable);
        this.editables.push(editable);
        editable.editRequestAccepter.setGetNextAccepter(() => this.parentBlock.getGroup()?.group.editor.editRequestAccepter);
        return editable;
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

    public getBranchTargets(): (InstructionGroup | null)[] | null {
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

    public setBranchTargets(targets: (InstructionGroup | null)[] | null): void {
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

class CompositeInstructionBlockWithOpeningLine<T extends InstructionLine> extends CompositeInstructionBlock {
    constructor(public openingLine: T, public instruction: Instruction) {
        super();
        const openingBlock = new SingleInstructionBlock();
        openingBlock._appendLine(openingLine);
        this._appendBlock(openingBlock);
    }
}

export abstract class InstructionComposite<T extends InstructionLine> extends Instruction {
    public block: CompositeInstructionBlockWithOpeningLine<T>;
    // public childInstructions: Instruction[] = [];

    constructor(protected openingLine: T) {
        super();
        this.block = new CompositeInstructionBlockWithOpeningLine(this.openingLine, this);
    }

    public insertLine(index: number): boolean {
        console.log("Composite insert", index);
        const newInstruction = this.createNewInstruction();
        this.block.insertBlock(index, newInstruction.block);
        return true;
    }

    public removeLine(line: InstructionLine): boolean {
        if (line == this.openingLine) {
            this.block.parent?.removeBlock(this.block);
            return true;
        }
        return false;
    }

    protected abstract createNewInstruction(): Instruction;
}

export abstract class BranchInstructionLine extends InstructionLine {
    public branchTarget: InstructionGroup | null = null;
    public branchOffset: number = 0;

    public actionBus = new ActionBusDispatchable();

    private branchConnectElm = new Elm()
        .class("branchConnect").attribute("contenteditable", "false")
        .on("click", () => {
            this.parentBlock.getGroup()?.group.editor.unsetEditMode();
            appHooks.focusEditor();
            this.requestUserToSetBranchTarget();
        });

    constructor() {
        super();
        this.updateElmState();

        this.actionBus.subscribe(BranchTargetChangeAction, action => {
            const groupBlock = action.branchLine.parentBlock.getGroup();
            if (!groupBlock) { throw new Error("No group editor"); }
            const group = groupBlock.group;

            // remove parent/child relation
            if (action.previousBranchTarget) {
                removeElmFromArray(
                    action.previousBranchTarget,
                    group.childGroups
                );
                removeElmFromArray(
                    group,
                    action.previousBranchTarget.parentGroups
                );
            }

            // update instruction
            action.branchLine.branchTarget = action.branchTarget;
            action.branchLine.updateElmState();

            // update parent/child relations
            if (action.branchTarget) {
                action.branchTarget.parentGroups.push(group);
                group.childGroups.push(action.branchTarget);
            }

            // update render hitboxes
            group.editor.updateAfterMove();
        });
    }

    public reset(): void {
        super.reset();
        this.elm.appendAsFirst(this.branchConnectElm);
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

    public setBranchOffset(branchOffset: number) {
        this.branchOffset = branchOffset;
    }

    public setBranchTarget(target: InstructionGroup | null) {
        const editor = this.parentBlock.getGroup()?.group.parentEditor;
        if (!editor) { throw new Error("No editor attached"); }
        editor.undoLog.startGroup();
        editor.undoLog.perform(
            new BranchTargetChangeAction(target, this.branchTarget, this)
        );
        editor.undoLog.endGroup();
    }

    private updateElmState() {
        if (this.branchTarget) {
            this.elm.removeClass("hanging");
        } else {
            this.elm.class("hanging");
        }
    }
}

export class BranchTargetChangeAction implements UndoableAction {
    public static key = Symbol();
    public key = BranchTargetChangeAction.key;

    constructor(
        public branchTarget: InstructionGroup | null,
        public previousBranchTarget: InstructionGroup | null,
        public branchLine: BranchInstructionLine
    ) { }

    public getTarget(): ActionBusDispatchable {
        return this.branchLine.actionBus;
    }

    public inverse(): UndoableAction {
        return new BranchTargetChangeAction(this.previousBranchTarget, this.branchTarget, this.branchLine);
    }
}
