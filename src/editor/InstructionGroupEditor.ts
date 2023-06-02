import { Editor, InstructionElmData } from "./Editor.js";
import { EditorCursorPositionAbsolute } from "./EditorCursor.js";
import { LineOperationEvent, TextareaUserInputCapture, TextareaUserInputCaptureContext, TextareaUserInputCursorPositionRelative, UserInputEvent } from "./TextareaUserInputCapture.js";
import { UIDGenerator } from "./UIDGenerator.js";
import { InstructionData } from "./flowToInstructionData.js";
import { InstructionLine, NewInstructionLine } from "./instructionLines.js";
import { Elm, Hitbox, JaPNaAEngine2d, WorldElm } from "../japnaaEngine2d/JaPNaAEngine2d.js";
import { getAncestorWhich } from "../utils.js";

export class InstructionGroupEditor extends WorldElm {
    public elm: Elm;
    public collisionType = InstructionGroupEditor.collisionType;

    private static fontSize = 16;
    private static collisionType = Symbol();

    private rendered = false;
    private initBranchTargets: (InstructionGroupEditor | null)[] = [];
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
        const instructions = [];
        const branches = [];

        for (const line of this.lines) {
            if (line.isBranch()) {
                console.log(line.serialize(), line.getBranchTarget());
                branches.push(line.serialize());
                const branchTarget = line.getBranchTarget();
                if (branchTarget) {
                    childrenUids.push(uidGen.getId(branchTarget));
                } else {
                    childrenUids.push(null);
                }
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

    public addBranchTarget(instructionRectangle: InstructionGroupEditor | null) {
        this.initBranchTargets.push(instructionRectangle);
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
        X.fillStyle = "#000";

        X.globalCompositeOperation = "destination-over";

        const activeGroup = this.parentEditor.cursor.getPosition()?.group;
        let alpha = 0.5;
        let lineWidth = 1;
        let triangleSize = 1;
        if (this === activeGroup) {
            alpha = 1;
            lineWidth = 2.5;
            triangleSize = 1.3;
            X.strokeStyle = X.fillStyle = "#a00";
        }

        let index = -1;
        for (const instruction of this.lines) {
            if (instruction.isBranch()) {
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
                if (target === activeGroup) {
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
        }

        X.globalCompositeOperation = "source-over";
        X.globalAlpha = 1;
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
            const line = this.addInstructionLine(branch.instruction);
            line.setBranchTarget(this.initBranchTargets[index++]);
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
