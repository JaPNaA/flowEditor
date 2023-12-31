import { Editor, InstructionElmData } from "./Editor";
import { EditorCursorPositionAbsolute } from "./editing/EditorCursor";
import { LineOperationEvent, TextareaUserInputCapture, TextareaUserInputCaptureContext, TextareaUserInputCursorPositionRelative, UserInputEvent } from "./editing/TextareaUserInputCapture";
import { UIDGenerator } from "./toolchain/UIDGenerator";
import { InstructionData } from "./toolchain/flowToInstructionData";
import { Collidable, Elm, Hitbox, JaPNaAEngine2d, QuadtreeElmChild, RectangleM, WorldElm } from "../../japnaaEngine2d/JaPNaAEngine2d";
import { getAncestorWhich } from "../utils";
import { AddInstructionAction, RemoveInstructionAction } from "./editing/actions";
import { NewInstruction } from "./instruction/NewInstruction";
import { Instruction, InstructionLine, BranchInstructionLine } from "./instruction/instructionTypes";
import { pluginHooks } from "../index";

export class InstructionGroupEditor extends WorldElm implements QuadtreeElmChild, Collidable {
    public static defaultWidth = 720 + 24; // 24 is padding

    public elm: Elm;
    public collisionType = InstructionGroupEditor.collisionType;
    public graphicHitbox: Hitbox<QuadtreeElmChild>;

    /** DO NOT MUTATE OUTSIDE `UndoableAction` */
    public _instructions: Instruction[] = [];
    /** DO NOT MUTATE OUTSIDE `UndoableAction` */
    public _lines: InstructionLine[] = [];
    /** DO NOT MUTATE OUTSIDE `UndoableAction` */
    public _childGroups: InstructionGroupEditor[] = [];
    /** DO NOT MUTATE OUTSIDE `UndoableAction` */
    public _parentGroups: InstructionGroupEditor[] = [];
    /** DO NOT MUTATE OUTSIDE `UndoableAction` */
    public _htmlInstructionLineToJS = new WeakMap<HTMLDivElement, InstructionLine>();
    /** DO NOT MUTATE OUTSIDE `UndoableAction` */
    public _isStartGroup = false;

    private static fontSize = 16;
    private static collisionType = Symbol();
    private hitbox = new Hitbox(this.rect, this);

    private isSetup = false;
    private selected = false;
    private initBranchTargets: ((InstructionGroupEditor | null)[] | null)[] = [];

    private elmVisible = false;
    private graphicRect = new RectangleM(0, 0, 0, 0);
    private graphicHitboxUpdateCallback!: () => void;

    constructor(public readonly parentEditor: Editor, private data: InstructionData) {
        super();
        this.rect.x = data.x;
        this.rect.y = data.y;
        this.rect.width = InstructionGroupEditor.defaultWidth;
        // initial height: #instructions * font size * line height + padding
        this.rect.height = (data.instructions.length + data.branches.length) * 16 * 1.55 + 16;

        this.graphicRect.copy(this.rect);
        this.graphicHitbox = new Hitbox(this.graphicRect, this);

        this.elm = new Elm().class("instructionGroup");
        this.elm.attribute("tabindex", "-1");
        this.elm.on("input", () => this.updateHeight());

        this.elm.on("keydown", ev => {
            if (ev.code === "Escape") {
                this.parentEditor.unsetEditMode();
            }
        });
    }

    public updateAfterMove() {
        this.updateAfterMoveNoParentPropagation();
        for (const parent of this._parentGroups) {
            parent.updateAfterMoveNoParentPropagation();
        }
    }

    public setGraphicHitboxUpdateCallback(callback: () => void): void {
        this.graphicHitboxUpdateCallback = callback;
    }

    public onExitView(): void {
        if (this.elmVisible) {
            this.elm.remove();
            this.elmVisible = false;
        }
    }

    public showElm() {
        if (this.elmVisible) { return; }
        this.engine.htmlOverlay.elm.append(this.elm);
        this.elmVisible = true;
        this.updateHeight();
        this.updateAfterMove();
    }

    public appendInputCapture(inputCapture: TextareaUserInputCapture) {
        inputCapture.appendTo(this.elm);
    }

    public onCursorInput(position: EditorCursorPositionAbsolute, ev: UserInputEvent) {
        if (ev.isRejected()) {
            if (ev.added.includes("\n")) {
                if (position.editable === 0 && position.char === 0) {
                    this.insertLineAndUpdateCursor(position.line);
                } else {
                    this.insertLineAndUpdateCursor(position.line + 1);
                }
            }
        }
    }

    public onLineDelete(position: EditorCursorPositionAbsolute, lineOp: LineOperationEvent) {
        let targetLine = position.line;
        if (lineOp.isNextLine) { targetLine++ }
        if (lineOp.isInsert) {
            this.insertLineAndUpdateCursor(targetLine);
        } else {
            if (targetLine > 0) {
                this.requestRemoveLine(targetLine);
                const previousLine = this._lines[targetLine - 1];
                this.parentEditor.cursor.setPosition({
                    group: this,
                    line: targetLine - 1,
                    editable: previousLine.getLastEditableIndex(),
                    char: previousLine.getLastEditableCharacterIndex()
                });
            } else {
                const removedLine = this._lines[targetLine];
                this.parentEditor.undoLog.startGroup();
                this.requestRemoveLine(targetLine);
                if (this._lines.length <= 0) {
                    if (removedLine.parentInstruction instanceof NewInstruction) {
                        this.parentEditor.removeGroup(this);
                        this.parentEditor.unsetEditMode();
                        this.parentEditor.undoLog.endGroup();
                        return;
                    } else {
                        this.requestNewLine(0);
                    }
                }
                this.parentEditor.cursor.setPosition({
                    group: this,
                    line: 0,
                    editable: 0,
                    char: 0
                });
                this.parentEditor.undoLog.endGroup();
            }
        }
    }

    public calculateNewPosition(pos: EditorCursorPositionAbsolute, change: TextareaUserInputCursorPositionRelative): EditorCursorPositionAbsolute {
        if (change[0] === "up") {
            if (pos.line - 1 < 0) {
                return { group: this, line: 0, editable: 0, char: 0 };
            } else {
                return { group: this, line: pos.line - 1, editable: change[1], char: change[2] };
            }
        }
        if (change[0] === "down") {
            if (pos.line + 1 >= this._lines.length) {
                return { group: this, line: this._lines.length - 1, editable: change[1], char: change[2] };
            } else {
                return { group: this, line: pos.line + 1, editable: change[1], char: change[2] };
            }
        }
        if (change[0] === "top") {
            return { group: this, line: 0, editable: 0, char: 0 };
        }
        if (change[0] === "bottom") {
            return { group: this, line: this._lines.length - 1, editable: change[1], char: change[2] };
        }

        // pos[0] === 'same'
        return { group: this, line: pos.line, editable: change[1], char: change[2] };
    }

    public selectionToPosition(selection: Selection): EditorCursorPositionAbsolute | undefined {
        const instructionLine = getAncestorWhich(selection.anchorNode || null, (node) => node instanceof HTMLDivElement && node.classList.contains("instructionLine"));
        if (instructionLine) {
            const instructionLineElm = this._htmlInstructionLineToJS.get(instructionLine as HTMLDivElement);
            if (instructionLineElm) {
                const index = this._lines.indexOf(instructionLineElm);
                const newEditable = instructionLineElm.getEditableIndexFromSelection(selection);
                if (newEditable >= 0) {
                    const characterOffset = instructionLineElm.getEditableFromIndex(newEditable).getCharacterOffset(selection);
                    return {
                        group: this,
                        line: index,
                        editable: newEditable,
                        char: characterOffset
                    };
                }
            }
        }
    }

    public getContextForPosition(position: EditorCursorPositionAbsolute): TextareaUserInputCaptureContext {
        return {
            above: position.line - 1 >= 0 ?
                this._lines[position.line - 1].getAreas() : [],
            current: position.line >= 0 ?
                this._lines[position.line].getAreas() : [],
            below: position.line + 1 < this._lines.length ?
                this._lines[position.line + 1].getAreas() : []
        };
    }

    public _setEngine(engine: JaPNaAEngine2d): void {
        super._setEngine(engine);
        this.engine.collisions.addHitbox(this.hitbox);
    }

    public remove(): void {
        this.engine.collisions.removeHitbox(this.hitbox);
        super.remove();
        this.elm.remove();
    }

    public relinkParentsToFinalBranch() {
        let newTarget: InstructionGroupEditor | null = null;
        for (let i = this._childGroups.length - 1; i >= 0; i--) {
            if (this._childGroups[i] !== this) {
                newTarget = this._childGroups[i];
            }
        }

        // loop backwards since we're removing our parents
        for (let i = this._parentGroups.length - 1; i >= 0; i--) {
            const parent = this._parentGroups[i];
            for (const instruction of parent._instructions) {
                if (!instruction.isBranch()) { continue; }
                const targets = instruction.getBranchTargets();
                const newTargets = [];
                if (targets) {
                    for (const target of targets) {
                        if (target === this) {
                            newTargets.push(newTarget);
                        } else {
                            newTargets.push(target);
                        }
                    }
                    instruction.setBranchTargets(newTargets);
                }
            }
        }
    }

    public serialize(uidGen: UIDGenerator): InstructionElmData {
        const childrenUids: number[][] = [];
        const instructions = [];
        const branches = [];

        for (const instruction of this._instructions) {
            if (instruction.isBranch()) {
                branches.push(instruction.serialize());
                const branchTargets = instruction.getBranchTargets();
                if (branchTargets) {
                    const uids = [];
                    for (const branchTarget of branchTargets) {
                        uids.push(branchTarget && uidGen.getId(branchTarget));
                    }
                    childrenUids.push(uids);
                } else {
                    childrenUids.push([]);
                }
            } else {
                instructions.push(instruction.serialize());
            }
        }

        return {
            id: uidGen.getId(this),
            instructions: instructions,
            branches: branches,
            children: childrenUids,
            x: Math.round(this.rect.x),
            y: Math.round(this.rect.y)
        };
    }

    public getInstructions() {
        return this._instructions;
    }

    public getLines() {
        return this._lines;
    }

    public addBranchTargets(targets: (InstructionGroupEditor | null)[] | null) {
        this.initBranchTargets.push(targets);
    }

    /** This method is called only once after instructions and branch targets are added */
    public setupConstruct() {
        const elm = this.elm.getHTMLElement();
        const font = `${InstructionGroupEditor.fontSize}px monospace`;

        elm.style.font = font;
        elm.style.width = InstructionGroupEditor.defaultWidth + "px";


        this.parentEditor.undoLog.startGroup();

        for (const instruction of this.data.instructions) {
            this.addInstruction(instruction);
        }

        let index = 0;
        for (const branch of this.data.branches) {
            const instruction = this.addInstruction(branch.instruction);
            instruction.setBranchTargets(this.initBranchTargets[index++]);
        }

        this.parentEditor.undoLog.endGroup();

        this.rect.width = InstructionGroupEditor.defaultWidth;

        this.updateAfterMove();
        this.isSetup = true;
    }

    public draw(): void {
        if (!this.isSetup) { return; }

        const X = this.engine.canvas.X;
        const elm = this.elm.getHTMLElement();

        // debug: draw graphic hitbox
        // X.strokeStyle = "#f0f";
        // X.lineWidth = 1;
        // X.strokeRect(this.graphicRect.x, this.graphicRect.y, this.graphicRect.width, this.graphicRect.height);

        if (this._isStartGroup) {
            X.fillStyle = "#35f035";
            X.beginPath();
            X.moveTo(this.rect.x, this.rect.y);
            X.lineTo(this.rect.x, this.rect.y - 18);
            X.lineTo(this.rect.x + 64, this.rect.y - 18);
            X.lineTo(this.rect.x + 82, this.rect.y - 2);
            X.lineTo(this.rect.rightX(), this.rect.y - 2);
            X.lineTo(this.rect.rightX(), this.rect.y);
            X.fill();

            X.fillStyle = "#000";
            X.textAlign = "left";
            X.textBaseline = "bottom";
            X.font = "14px monospace";
            X.fillText("Start", this.rect.x + 8, this.rect.y - 2);
        }

        X.fillStyle = "#2a2a2a";
        X.beginPath();
        X.rect(this.rect.x, this.rect.y, this.rect.width, this.rect.height);
        if (this.selected) {
            X.strokeStyle = "#5a7bd6";
            X.lineWidth = 4;
            X.stroke();
        }
        X.fill();

        if (!this.elmVisible) {
            this.showElm();
        }

        elm.style.top = this.rect.y + "px";
        elm.style.left = this.rect.x + "px";

        X.strokeStyle = "#aaa";
        X.fillStyle = "#aaa";

        X.globalCompositeOperation = "destination-over";

        let alpha = 0.5;
        let lineWidth = 1.5;
        let triangleSize = 1;
        if (this.selected) {
            alpha = 1;
            lineWidth = 2.5;
            triangleSize = 1.3;
            X.strokeStyle = X.fillStyle = "#a22";
        }

        let index = -1;
        for (const instruction of this._lines) {
            if (!(instruction instanceof BranchInstructionLine)) { continue; }
            const target = instruction.getBranchTarget();
            if (!target) { continue; }
            index++;

            const instructionElm = instruction.elm.getHTMLElement();
            const startY = this.rect.y + instructionElm.offsetTop + instructionElm.offsetHeight / 2;
            const startX = this.rect.rightX() + 16 + 16 * index;
            const endY = target.rect.y - 16;
            const targetRectCenterX = target.rect.x + target.rect.width / 2;
            let currTriangleSize = triangleSize;

            // highlight current connections
            if (target.selected) {
                X.globalAlpha = 1;
                X.lineWidth = 2.5;
                currTriangleSize = 1.5;
            } else {
                X.globalAlpha = alpha;
                X.lineWidth = lineWidth;
            }

            X.beginPath();
            X.moveTo(this.rect.rightX(), startY);
            X.lineTo(startX, startY);
            X.lineTo(startX, endY);
            X.lineTo(targetRectCenterX, endY);
            X.lineTo(targetRectCenterX, target.rect.y - 6 * currTriangleSize);
            X.stroke();

            X.beginPath();
            X.moveTo(targetRectCenterX, target.rect.y);
            X.lineTo(targetRectCenterX - 4 * currTriangleSize, target.rect.y - 6 * currTriangleSize);
            X.lineTo(targetRectCenterX + 4 * currTriangleSize, target.rect.y - 6 * currTriangleSize);
            X.fill();
        }

        X.globalCompositeOperation = "source-over";
        X.globalAlpha = 1;

        pluginHooks.renderGroup(this);
    }

    public updateHeight() {
        const newHeight = this.elm.getHTMLElement().clientHeight;
        if (this.rect.height !== newHeight) {
            this.rect.height = newHeight;
            this.engine?.ticker.requestTick();
        }
    }

    public setSelected() {
        if (!this.selected) { this.engine?.ticker.requestTick(); }
        this.selected = true;
    }

    public unsetSelected() {
        if (this.selected) { this.engine?.ticker.requestTick(); }
        this.selected = false;
    }

    public setEditMode() {
        this.elm.class("editMode");
    }

    public unsetEditMode() {
        this.elm.removeClass("editMode");
    }

    /**
     * Remove instructions after `instructionIndex`, then move the removed
     * instructions to a new `InstructionGroupEditor`
     */
    public splitAtInstruction(instructionIndex: number) {
        const movingInstructions = [];
        const numMoving = this._instructions.length - instructionIndex;

        this.parentEditor.undoLog.startGroup();

        for (let i = 0; i < numMoving; i++) {
            const instruction = this._instructions[this._instructions.length - 1];
            this.removeInstruction(this._instructions.length - 1);
            movingInstructions.push(instruction);
        }
        movingInstructions.reverse();

        this.updateHeight();

        const newGroup = new InstructionGroupEditor(this.parentEditor, {
            x: this.rect.x,
            y: this.rect.bottomY() + 64,
            branches: [],
            instructions: []
        });
        this.parentEditor.addGroup(newGroup);
        let i = 0;
        for (const instruction of movingInstructions) {
            newGroup.insertInstruction(instruction, i++);
        }

        // add link from this to new group
        const lastInstruction = this._instructions[this._instructions.length - 1];
        if (lastInstruction && lastInstruction.isAlwaysJump()) {
            const targets = lastInstruction.getBranchTargets();
            const newTargets = [];
            if (targets) {
                let linked = false;
                for (const target of targets) {
                    if (!linked && target === null) {
                        newTargets.push(newGroup);
                        linked = true;
                    } else {
                        newTargets.push(target);
                    }
                }
                if (linked) {
                    lastInstruction.setBranchTargets(newTargets);
                }
            }
        } else {
            const jump = this.instructionFromData({ ctrl: 'jump', offset: 0 });
            this.insertInstruction(jump, this._instructions.length);
            jump.setBranchTargets([newGroup]);
        }

        newGroup.setupConstruct();

        this.parentEditor.undoLog.endGroup();

        return newGroup;
    }

    public requestNewLine(lineIndex: number) {
        const previousLine = this._lines[lineIndex - 1];
        if (previousLine) {
            if (previousLine.parentInstruction.insertLine(lineIndex)) {
                return;
            }
            const instructionLine = this.instructionFromData({ ctrl: 'nop' });
            return this.insertInstruction(instructionLine,
                previousLine.parentInstruction.getIndex() + 1
            );
        } else {
            const instructionLine = this.instructionFromData({ ctrl: 'nop' });
            return this.insertInstruction(instructionLine, 0);
        }
    }

    public insertInstruction(instruction: Instruction, instructionIndex: number) {
        this.parentEditor.undoLog.startGroup();
        this.parentEditor.undoLog.perform(
            new AddInstructionAction(instruction, instructionIndex, this)
        );
        this.parentEditor.undoLog.endGroup();
    }

    /** Asks the instruction corresponding to the specified line to remove the line */
    public requestRemoveLine(lineIndex: number) {
        const line = this._lines[lineIndex];
        if (!line) { return; }
        return line.parentInstruction.removeLine(line);
    }

    /** Remove an instruction and corresponding lines */
    public removeInstruction(instructionIndex: number) {
        this.parentEditor.undoLog.startGroup();
        this.parentEditor.undoLog.perform(
            new RemoveInstructionAction(instructionIndex, this)
        )
        this.parentEditor.undoLog.endGroup();
    }

    /**
     * Inserts an instruction line without consulting surrounding lines.
     * DO NOT USE OUTSIDE `Instruction` and subclasses.
     */
    public _insertInstructionLine(lineIndex: number, line: InstructionLine) {
        if (lineIndex >= this._lines.length) {
            this.elm.append(line);
        } else {
            this.elm.getHTMLElement().insertBefore(line.elm.getHTMLElement(), this._lines[lineIndex].elm.getHTMLElement());
        }

        this._lines.splice(lineIndex, 0, line);
    }

    /**
     * Removes an instruction line without consulting the original instruction.
     * DO NOT USE OUTSIDE `Instruction` and subclasses.
     */
    public _removeInstructionLine(lineIndex: number) {
        const lines = this._lines.splice(lineIndex, 1);
        if (lines.length < 0) { throw new Error("Invalid position"); }
        for (const line of lines) {
            this._htmlInstructionLineToJS.delete(line.elm.getHTMLElement());
            line.elm.remove();
        }
    }

    private updateAfterMoveNoParentPropagation() {
        let xStart = this.rect.x;
        let yStart = this.rect.y;
        let xEnd = this.rect.rightX();
        let yEnd = this.rect.bottomY();

        for (const child of this._childGroups) {
            if (child.rect.x < xStart) {
                xStart = child.rect.x;
            } else if (child.rect.rightX() > xEnd) {
                xEnd = child.rect.rightX();
            }
            if (child.rect.y < yStart) {
                yStart = child.rect.y;
            } else if (child.rect.y > yEnd) {
                yEnd = child.rect.y;
            }
        }

        this.graphicRect.x = xStart;
        this.graphicRect.y = yStart;
        this.graphicRect.width = xEnd - xStart;
        this.graphicRect.height = yEnd - yStart;

        if (!this.toBeRemoved) {
            this.graphicHitboxUpdateCallback();
        }
    }

    private insertLineAndUpdateCursor(lineIndex: number) {
        this.requestNewLine(lineIndex);
        this.parentEditor.cursor.setPosition({
            group: this,
            line: lineIndex,
            editable: 0,
            char: 0,
        });
    }

    private addInstruction(data: any) {
        const instruction = this.instructionFromData(data);
        const lines = instruction.getLines();
        instruction._setParent(this);

        for (const line of lines) {
            line.appendTo(this.elm);
            this._lines.push(line);
            this._htmlInstructionLineToJS.set(line.elm.getHTMLElement(), line);
        }

        this._instructions.push(instruction);
        return instruction;
    }

    private instructionFromData(data: any): Instruction {
        return this.parentEditor.deserializer.deserialize(data);
    }
}
