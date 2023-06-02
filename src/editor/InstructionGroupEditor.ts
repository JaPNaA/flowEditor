import { Editable } from "./Editable.js";
import { Editor, InstructionElmData } from "./Editor.js";
import { EditorCursor, EditorCursorPositionAbsolute } from "./EditorCursor.js";
import { LineOperationEvent, TextareaUserInputCapture, TextareaUserInputCaptureContext, TextareaUserInputCursorPositionRelative, UserInputEvent } from "./TextareaUserInputCapture.js";
import { UIDGenerator } from "./UIDGenerator.js";
import { InstructionData } from "./flowToInstructionData.js";
import { InstructionLine, NewInstructionLine } from "./instructionLines.js";
import { Elm, Hitbox, JaPNaAEngine2d, WorldElm } from "../japnaaEngine2d/JaPNaAEngine2d.js";
import { getAncestorWhich, isAncestor } from "../utils.js";

export class InstructionGroupEditor extends WorldElm {
    public elm: Elm;
    public collisionType = InstructionGroupEditor.collisionType;

    private static fontSize = 16;
    private static collisionType = Symbol();

    private rendered = false;
    private branchTargets: InstructionGroupEditor[] = [];
    private lines: InstructionLine[] = [];
    private htmlInstructionLineToJS = new WeakMap<HTMLDivElement, InstructionLine>();

    constructor(public readonly parentEditor: Editor, private data: InstructionData) {
        super();
        this.rect.x = data.x;
        this.rect.y = data.y;

        this.elm = new Elm().class("instructionGroup");
        this.elm.attribute("tabindex", "-1");
        this.elm.on("input", () => this.updateHeight());
    }

    public appendInputCapture(inputCapture: TextareaUserInputCapture) {
        inputCapture.appendTo(this.elm);
    }

    public onCursorInput(position: EditorCursorPositionAbsolute, ev: UserInputEvent) {
        if (ev.isRejected()) {
            if (ev.added.includes("\n")) {
                this.insertLineAndUpdateCursor(position.line + 1);
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
                this.removeInstructionLine(targetLine);
                const previousLine = this.lines[targetLine - 1];
                this.parentEditor.cursor.setPosition({
                    group: this,
                    line: targetLine - 1,
                    editable: previousLine.getLastEditableIndex(),
                    char: previousLine.getLastEditableCharacterIndex()
                });
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
            if (pos.line + 1 >= this.lines.length) {
                return { group: this, line: this.lines.length - 1, editable: change[1], char: change[2] };
            } else {
                return { group: this, line: pos.line + 1, editable: change[1], char: change[2] };
            }
        }
        if (change[0] === "top") {
            return { group: this, line: 0, editable: 0, char: 0 };
        }
        if (change[0] === "bottom") {
            return { group: this, line: this.lines.length - 1, editable: change[1], char: change[2] };
        }

        // pos[0] === 'same'
        return { group: this, line: pos.line, editable: change[1], char: change[2] };
    }

    public selectionToPosition(selection: Selection): EditorCursorPositionAbsolute | undefined {
        const instructionLine = getAncestorWhich(selection.anchorNode || null, (node) => node instanceof HTMLDivElement && node.classList.contains("instructionLine"));
        if (instructionLine) {
            const instructionLineElm = this.htmlInstructionLineToJS.get(instructionLine as HTMLDivElement);
            if (instructionLineElm) {
                const index = this.lines.indexOf(instructionLineElm);
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

    private insertLineAndUpdateCursor(lineNumber: number) {
        this.insertNewInstructionLine(lineNumber);
        this.parentEditor.cursor.setPosition({
            group: this,
            line: lineNumber,
            editable: 0,
            char: 0,
        });
    }

    public getContextForPosition(position: EditorCursorPositionAbsolute): TextareaUserInputCaptureContext {
        return {
            above: position.line - 1 >= 0 ?
                this.lines[position.line - 1].getAreas() : [],
            current: position.line >= 0 ?
                this.lines[position.line].getAreas() : [],
            below: position.line + 1 < this.lines.length ?
                this.lines[position.line + 1].getAreas() : []
        };
    }

    public _setEngine(engine: JaPNaAEngine2d): void {
        super._setEngine(engine);
        this.engine.collisions.addHitbox(new Hitbox(this.rect, this));
        this.engine.htmlOverlay.elm.append(this.elm);
    }

    public remove(): void {
        super.remove();
        this.elm.remove();
    }

    public serialize(uidGen: UIDGenerator): InstructionElmData {
        const childrenUids = [];
        for (const child of this.branchTargets) {
            childrenUids.push(uidGen.getId(child));
        }

        const instructions = [];
        const branches = [];

        for (const line of this.lines) {
            if (line.isBranch()) {
                branches.push(line.serialize());
            } else {
                instructions.push(line.serialize());
            }
        }

        return {
            id: uidGen.getId(this),
            instructions: instructions,
            branches: branches,
            children: childrenUids,
            x: this.rect.x,
            y: this.rect.y
        };
    }

    public getLines() {
        return this.lines;
    }

    public addBranchTarget(instructionRectangle: InstructionGroupEditor) {
        this.branchTargets.push(instructionRectangle);
    }

    public setBranchTarget(instruction: InstructionLine, instructionEditor: InstructionGroupEditor) {
        let index = -1;
        for (const line of this.lines) {
            if (line.isBranch()) {
                index++;
                if (line === instruction) {
                    this.branchTargets[index] = instructionEditor;
                    return;
                }
            }
        }
        throw new Error("Given instruction not in this.lines");
    }

    public draw(): void {
        const X = this.engine.canvas.X;
        const elm = this.elm.getHTMLElement();

        if (!this.rendered) {
            this.render();
        }

        X.fillStyle = "#ddd";
        X.fillRect(this.rect.x, this.rect.y, this.rect.width, this.rect.height);
        elm.style.top = this.rect.y + "px";
        elm.style.left = this.rect.x + "px";

        X.strokeStyle = "#000";
        for (const child of this.branchTargets) {
            X.beginPath();
            X.moveTo(this.rect.centerX(), this.rect.bottomY());
            X.lineTo(child.rect.centerX(), child.rect.y);
            X.stroke();
        }
    }

    private render() {
        const elm = this.elm.getHTMLElement();
        const font = `${InstructionGroupEditor.fontSize}px monospace`;
        elm.style.font = font;

        const width = 460;

        for (const instruction of this.data.instructions) {
            this.addInstructionLine(instruction);
        }

        let index = 0;
        for (const branch of this.data.branches) {
            const line = this.addInstructionLine(branch);
            line.setBranchTargetDown(this.branchTargets[index++]);
        }

        this.rect.width = width;
        this.updateHeight();

        this.rendered = true;
    }

    private addInstructionLine(instruction: any) {
        const instructionLine = InstructionLine.fromInstruction(instruction).appendTo(this.elm);
        instructionLine._setParent(this);
        this.lines.push(instructionLine);
        this.htmlInstructionLineToJS.set(instructionLine.elm.getHTMLElement(), instructionLine);
        return instructionLine;
    }

    public insertNewInstructionLine(position: number) {
        const instructionLine = new InstructionLine(new NewInstructionLine());
        return this.insertInstructionLine(instructionLine, position);
    }

    public insertInstructionLine(instructionLine: InstructionLine, position: number) {
        if (position < this.lines.length) {
            this.elm.getHTMLElement().insertBefore(instructionLine.elm.getHTMLElement(), this.lines[position].elm.getHTMLElement());
        } else {
            this.elm.append(instructionLine);
        }
        instructionLine._setParent(this);
        this.lines.splice(position, 0, instructionLine);
        this.htmlInstructionLineToJS.set(instructionLine.elm.getHTMLElement(), instructionLine);

        return instructionLine;
    }

    public removeInstructionLine(positon: number) {
        const lines = this.lines.splice(positon, 1);
        if (lines.length < 0) { throw new Error("Invalid position"); }
        for (const line of lines) {
            this.htmlInstructionLineToJS.delete(line.elm.getHTMLElement());
            line.elm.remove();
        }
    }

    private updateHeight() {
        this.rect.height = this.elm.getHTMLElement().clientHeight;
    }
}
