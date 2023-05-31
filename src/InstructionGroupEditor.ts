import { Editable } from "./Editable.js";
import { Editor, InstructionElmData } from "./Editor.js";
import { EditorCursor } from "./EditorCursor.js";
import { TextareaUserInputCursorPosition } from "./TextareaUserInputCapture.js";
import { UIDGenerator } from "./UIDGenerator.js";
import { InstructionData } from "./flowToInstructionData.js";
import { InstructionLine, NewInstructionLine } from "./instructionLines.js";
import { Elm, Hitbox, JaPNaAEngine2d, WorldElm } from "./japnaaEngine2d/JaPNaAEngine2d.js";
import { getAncestorWhich, isAncestor } from "./utils.js";

export class InstructionGroupEditor extends WorldElm {
    private static fontSize = 16;
    private static collisionType = Symbol();

    private rendered = false;
    private branchTargets: InstructionGroupEditor[] = [];
    private lines: InstructionLine[] = [];
    private htmlInstructionLineToJS = new WeakMap<HTMLDivElement, InstructionLine>();
    private activeLine: number = -1;
    private elm: Elm;

    private cursorElm = new EditorCursor();

    public collisionType = InstructionGroupEditor.collisionType;

    constructor(public readonly parentEditor: Editor, private data: InstructionData) {
        super();
        this.rect.x = data.x;
        this.rect.y = data.y;

        this.elm = new Elm().class("instructionElm");
        this.elm.attribute("tabindex", "-1");
        this.elm.on("input", () => this.updateHeight());
        this.cursorElm.inputCapture.appendTo(this.elm);

        document.addEventListener("selectionchange", e => {
            if (!e.isTrusted) { return; } // prevent self-caused selection changes

            // must be in this.elm
            const selection = getSelection();
            if (!selection || !isAncestor(selection.anchorNode || null, this.elm.getHTMLElement())) { return; }
            if (isAncestor(selection.anchorNode || null, this.cursorElm.getHTMLElement())) { return; }

            this.parentEditor.childFocused.send(this);

            const instructionLine = getAncestorWhich(selection.anchorNode || null, (node) => node instanceof HTMLDivElement && node.classList.contains("instructionLine"))
            if (instructionLine) {
                const instructionLineElm = this.htmlInstructionLineToJS.get(instructionLine as HTMLDivElement);
                if (instructionLineElm) {
                    const index = this.lines.indexOf(instructionLineElm);
                    this.activeLine = index;
                    const newEditable = instructionLineElm.getEditableFromSelection(selection);
                    if (newEditable) {
                        const characterOffset = newEditable.getCharacterOffset(selection);
                        this.updateInputCapture();

                        newEditable.setActive(characterOffset, this.cursorElm);
                        this.cursorElm.inputCapture.setPositionOnCurrentLine(newEditable, characterOffset);
                        this.cursorElm.inputCapture.focus();
                    }
                }
            }
        });

        this.cursorElm.inputCapture.setChangeHandler(this.updateCursorPosition.bind(this));

        this.cursorElm.inputCapture.onInput.subscribe(ev => {
            if (ev.added.includes("\n")) {
                this.insertLineAndUpdateCursor(this.activeLine + 1);
            }
        });

        this.cursorElm.inputCapture.onLineDelete.subscribe(ev => {
            let targetLine = this.activeLine;
            if (ev.isNextLine) { targetLine++ }
            if (ev.isInsert) {
                this.insertLineAndUpdateCursor(targetLine);
            } else {
                this.removeInstructionLine(targetLine);
                this.updateInputCapture();
                const instructionLine = this.lines[this.activeLine];
                instructionLine.getEditableFromIndex(0).setActive(0, this.cursorElm);
                this.cursorElm.inputCapture.setPositionOnCurrentLine(0, 0);
            }
        });
    }

    private insertLineAndUpdateCursor(position: number) {
        this.activeLine = position;
        const instructionLine = this.insertNewInstructionLine(this.activeLine);
        this.updateInputCapture();
        instructionLine.getEditableFromIndex(0).setActive(0, this.cursorElm);
        this.cursorElm.inputCapture.setPositionOnCurrentLine(0, 0);
    }

    private updateCursorPosition(pos: TextareaUserInputCursorPosition) {
        if (this.activeLine < 0) { return; }
        if (pos[0] === "up") {
            this.activeLine--;
            if (this.activeLine < 0) { this.activeLine = 0; }
            this.updateInputCapture();
        }
        if (pos[0] === "down") {
            this.activeLine++;
            if (this.activeLine >= this.lines.length) {
                this.activeLine = this.lines.length - 1;
            }
            this.updateInputCapture();
        }
        if (pos[0] === "top") { this.activeLine = 0; this.updateInputCapture(); }
        if (pos[0] === "bottom") { this.activeLine = this.lines.length - 1; this.updateInputCapture(); }

        // pos[0] === 'same'
        this.activateEditableOnActiveLine(pos[1], pos[2], pos[3]);
    }

    public setCursorPositionStartOfCurrentLine() {
        this.cursorElm.inputCapture.setPositionOnCurrentLine(0, 0);
        const pos = this.cursorElm.inputCapture.getCurrentPosition();
        this.activateEditableOnActiveLine(0, 0, pos[3]);
    }

    private activateEditableOnActiveLine(editableIndex: number, characterOffset: number, editable_: Editable | undefined) {
        let editable = editable_;
        if (!editable_) {
            editable = this.lines[this.activeLine].getEditableFromIndex(editableIndex);
        }
        if (!editable) { throw new Error("Editable not found"); }

        editable.setActive(characterOffset, this.cursorElm);

        const cursorElm = this.cursorElm.getHTMLElement();
        this.cursorElm.inputCapture.setStyleTop(cursorElm.offsetTop + cursorElm.offsetHeight);
        this.cursorElm.inputCapture.focus();
    }

    public updateInputCapture() {
        if (this.activeLine - 1 >= 0) {
            this.cursorElm.inputCapture.setAboveLine(this.lines[this.activeLine - 1].getAreas());
        } else {
            this.cursorElm.inputCapture.setAboveLine([]);
        }
        if (this.activeLine >= 0) {
            this.cursorElm.inputCapture.setCurrentLine(this.lines[this.activeLine].getAreas());
        } else {
            this.cursorElm.inputCapture.setCurrentLine([]);
        }
        if (this.activeLine + 1 < this.lines.length) {
            this.cursorElm.inputCapture.setBelowLine(this.lines[this.activeLine + 1].getAreas());
        } else {
            this.cursorElm.inputCapture.setBelowLine([]);
        }

        this.cursorElm.inputCapture.update();
        this.cursorElm.inputCapture.focus();
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
