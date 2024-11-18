import { Elm } from "../../../japnaaEngine2d/elements";
import { Collidable, Hitbox, JaPNaAEngine2d, QuadtreeElmChild, Rectangle, RectangleM, WorldElm } from "../../../japnaaEngine2d/JaPNaAEngine2d";
import { pluginHooks } from "../../index";
import { EditorCursorPositionAbsolute } from "../editing/EditorCursor";
import { UserInputEvent, LineOperationEvent } from "../editing/UserInputEvents";
import { BranchInstructionLine, InstructionLine } from "../instruction/instructionTypes";
import { NewInstruction } from "../instruction/NewInstruction";
import { InstructionGroup } from "../InstructionGroup";

/**
 * An instruction group editor is a UI component that allows editing
 * {@link InstructionGroup}s
 */
export class InstructionGroupEditor extends WorldElm implements QuadtreeElmChild, Collidable  {
    public static defaultWidth = 720 + 24; // 24 is padding
    private static fontSize = 16;
    private static collisionType = Symbol();

    public elm: Elm;
    public collisionType = InstructionGroupEditor.collisionType;
    public graphicHitbox: Hitbox<QuadtreeElmChild>;

    /** DO NOT MUTATE OUTSIDE `UndoableAction` */
    public _htmlInstructionLineToJS = new WeakMap<HTMLDivElement, InstructionLine>();

    private hitbox: Hitbox<InstructionGroupEditor>;

    private elmVisible = false;
    private graphicRect = new RectangleM(0, 0, 0, 0);
    private graphicHitboxUpdateCallback!: () => void;

    private isSetUp = false;
    private selected = false;
    private isEditMode = false;

    constructor(public instructionGroup: InstructionGroup, rect: Rectangle) {
        super();
        this.rect = rect;
        this.hitbox = new Hitbox(this.rect, this);
        this.graphicRect.copy(rect);
        this.graphicHitbox = new Hitbox(this.graphicRect, this);

        this.elm = new Elm().class("instructionGroup");

        this.elm.on("keydown", ev => {
            if (ev.code === "Escape") {
                this.instructionGroup.parentEditor.unsetEditMode();
            }
        });
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

    /**
     * Updates the graphic rectangles for this instruction group.
     * 
     * (Graphic rectangles are used by japnaaEngine2d to cull WorldElms.)
     */
    public updateAfterMove() {
        this.updateAfterMoveNoParentPropagation();
        for (const parent of this.instructionGroup._parentGroups) {
            parent.editor.updateAfterMoveNoParentPropagation();
        }
    }

    public showElm() {
        if (this.elmVisible) { return; }
        this.engine.htmlOverlay.elm.append(this.elm);
        this.elmVisible = true;
        this.updateHeight();
        this.updateAfterMove();
    }

    public onCursorInput(position: EditorCursorPositionAbsolute, ev: UserInputEvent) {
        if (ev.isRejected()) {
            if (ev.newContent.includes("\n")) {
                if (position.editable === 0 && position.char === 0) {
                    this.insertLineAndUpdateCursor(position.line);
                } else {
                    this.insertLineAndUpdateCursor(position.line + 1);
                }
            }
        }
    }

    public onLineDelete(lineOp: LineOperationEvent) {
        const editor = this.instructionGroup.parentEditor;
        let targetLine = this.instructionGroup.block.locateLine(lineOp.line);

        if (lineOp.isNextLine) { targetLine++ }
        if (lineOp.isInsert) {
            this.insertLineAndUpdateCursor(targetLine);
        } else {
            if (targetLine > 0) {
                this.instructionGroup.requestRemoveLine(targetLine);
                const previousLine = this.instructionGroup.block.getLine(targetLine - 1);
                editor.cursor.setPosition({
                    group: this.instructionGroup,
                    line: targetLine - 1,
                    editable: previousLine.getLastEditableIndex(),
                    char: previousLine.getLastEditableCharacterIndex()
                });
            } else {
                const removedLine = this.instructionGroup.block.getLine(targetLine);
                editor.undoLog.startGroup();
                this.instructionGroup.requestRemoveLine(targetLine);
                if (this.instructionGroup.block.numLines <= 0) {
                    if (removedLine.parentBlock instanceof NewInstruction) {
                        editor.removeGroup(this.instructionGroup);
                        editor.unsetEditMode();
                        editor.undoLog.endGroup();
                        return;
                    } else {
                        this.instructionGroup.requestNewLine(0);
                    }
                }
                editor.cursor.setPosition({
                    group: this.instructionGroup,
                    line: 0,
                    editable: 0,
                    char: 0
                });
                editor.undoLog.endGroup();
            }
        }
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

    /** This method is called only once after instructions and branch targets are added */
    public setupConstruct() {
        const elm = this.elm.getHTMLElement();
        const font = `${InstructionGroupEditor.fontSize}px monospace`;

        elm.style.font = font;
        elm.style.width = InstructionGroupEditor.defaultWidth + "px";

        this.rect.width = InstructionGroupEditor.defaultWidth;

        this.updateAfterMove();
        this.isSetUp = true;
    }

    public draw(): void {
        if (!this.isSetUp) { return; }

        const X = this.engine.canvas.X;
        const elm = this.elm.getHTMLElement();

        // debug: draw graphic hitbox
        // X.strokeStyle = "#f0f";
        // X.lineWidth = 1;
        // X.strokeRect(this.graphicRect.x, this.graphicRect.y, this.graphicRect.width, this.graphicRect.height);

        if (this.instructionGroup._isStartGroup) {
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
        for (const instruction of this.instructionGroup.block.lineIter()) {
            if (!(instruction instanceof BranchInstructionLine)) { continue; }
            const target = instruction.getBranchTarget()?.editor;
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

        pluginHooks.renderGroup(this.instructionGroup);
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
        if (this.isEditMode) { return; }
        this.isEditMode = true;
        this.elm.class("editMode");
        this.instructionGroup.parentEditor.cursor.registerGroupEditor(this.instructionGroup);
    }

    public unsetEditMode() {
        if (!this.isEditMode) { return; }
        this.isEditMode = false;
        this.elm.removeClass("editMode");
        this.instructionGroup.parentEditor.cursor.unregisterGroupEditor(this.instructionGroup);
    }

    /**
     * For use in InstructionGroup setup only.
     * todo: refactor this
     */
    public _addInstruction(line: InstructionLine) {
        this.elm.append(line);
        this._htmlInstructionLineToJS.set(line.elm.getHTMLElement(), line);
    }

    /**
     * Inserts an instruction line in the DOM.
     * DO NOT USE OUTSIDE `InstructionBlock`, `Action` and subclasses.
     */
    public _insertInstructionLine(lineIndex: number, line: InstructionLine) {
        if (lineIndex >= this.instructionGroup.block.numLines) {
            this.elm.append(line);
        } else {
            this.elm.getHTMLElement().insertBefore(
                line.elm.getHTMLElement(),
                this.instructionGroup.block.getLine(lineIndex).elm.getHTMLElement()
            );
        }
        this._htmlInstructionLineToJS.set(line.elm.getHTMLElement(), line);
    }

    /**
     * Removes an instruction line in the DOM.
     * DO NOT USE OUTSIDE `InstructionBlock`, `Action` and subclasses.
     */
    public _removeInstructionLine(line: InstructionLine) {
        this._htmlInstructionLineToJS.delete(line.elm.getHTMLElement());
        line.elm.remove();
    }

    private updateAfterMoveNoParentPropagation() {
        let xStart = this.rect.x;
        let yStart = this.rect.y;
        let xEnd = this.rect.rightX();
        let yEnd = this.rect.bottomY();

        for (const child of this.instructionGroup._childGroups) {
            const childEditor = child.editor;
            if (childEditor.rect.x < xStart) {
                xStart = childEditor.rect.x;
            } else if (childEditor.rect.rightX() > xEnd) {
                xEnd = childEditor.rect.rightX();
            }
            if (childEditor.rect.y < yStart) {
                yStart = childEditor.rect.y;
            } else if (childEditor.rect.y > yEnd) {
                yEnd = childEditor.rect.y;
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
        this.instructionGroup.requestNewLine(lineIndex);
        this.instructionGroup.parentEditor.cursor.setPosition({
            group: this.instructionGroup,
            line: lineIndex,
            editable: 0,
            char: 0,
        });
    }
}