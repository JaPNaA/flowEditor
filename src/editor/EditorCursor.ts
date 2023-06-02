import { TextareaUserInputCapture } from "./TextareaUserInputCapture.js";
import { Elm, EventBus } from "../japnaaEngine2d/JaPNaAEngine2d.js";
import { InstructionGroupEditor } from "./InstructionGroupEditor.js";
import { getAncestorWhich, isAncestor } from "../utils.js";
import { Editable } from "./Editable";

export class EditorCursor extends Elm<"span"> {
    public groupEditorsElmsMap = new WeakMap<HTMLDivElement, InstructionGroupEditor>();

    public focusChangeGroup = new EventBus<InstructionGroupEditor>();

    private inputCapture = new TextareaUserInputCapture(this);
    private position?: Readonly<EditorCursorPositionAbsolute>;

    private lastActiveEditable?: Editable;

    constructor() {
        super("span");
        this.class("cursor");

        document.addEventListener("selectionchange", e => {
            if (!e.isTrusted) { return; }

            const selection = getSelection();
            if (!selection) { return; }
            const anchorNode = selection.anchorNode;
            if (isAncestor(anchorNode, this.elm)) { return; }

            const parentInstructionElm =
                getAncestorWhich(
                    anchorNode,
                    node => node instanceof HTMLDivElement && node.classList.contains("instructionGroup")
                ) as HTMLDivElement;
            if (parentInstructionElm) {
                const group = this.groupEditorsElmsMap.get(parentInstructionElm);
                if (group) {
                    const position = group.selectionToPosition(selection);
                    if (position) {
                        this._setPosition(position);
                        this.setVirtualCursorPosition(position, position, false);
                        this.setTextareInputCursorPosition(position);
                        position.group.appendInputCapture(this.inputCapture);
                        this.inputCapture.focus();
                    }
                }
            }
        });

        this.inputCapture.setPositionChangeHandler((relPosStart, relPosEnd, backwards) => {
            if (!this.position) { return; }
            const newPosStart = this.position.group.calculateNewPosition(this.position, relPosStart);
            const newPosEnd = this.position.group.calculateNewPosition(this.position, relPosEnd);
            this.setVirtualCursorPosition(newPosStart, newPosEnd, backwards);
            if (this.position.group !== newPosStart.group || this.position.line !== newPosStart.line) {
                this.position.group.appendInputCapture(this.inputCapture);
                this.setTextareInputCursorPosition(newPosStart);
            }
            this._setPosition(newPosStart);
            this.inputCapture.focus();
        });

        this.inputCapture.setInputHandler(input => {
            if (!this.position) { return; }
            this.position.group.onCursorInput(this.position, input);
        });

        this.inputCapture.setLineDeleteHandler(lineOp => {
            if (!this.position) { return; }
            this.position.group.onLineDelete(this.position, lineOp);
        });
    }

    public setSelectedText(text: string) {
        this.replaceContents(text);
    }

    public getPosition(): Readonly<EditorCursorPositionAbsolute | undefined> {
        return this.position;
    }

    public setPosition(position: EditorCursorPositionAbsolute) {
        this._setPosition(position);
        this.clampPositionChar();
        position.group.appendInputCapture(this.inputCapture);
        this.setVirtualCursorPosition(this.position!, this.position!, false);
        this.setTextareInputCursorPosition(this.position!);

        this.inputCapture.focus();
    }

    public update() {
        if (this.position) {
            this.setPosition(this.position);
        }
    }

    private _setPosition(position: EditorCursorPositionAbsolute) {
        if (!this.position || position.group !== this.position.group) {
            this.focusChangeGroup.send(position.group);
        }
        this.position = position;
    }

    private setVirtualCursorPosition(positionStart: Readonly<EditorCursorPositionAbsolute>, positionEnd: Readonly<EditorCursorPositionAbsolute>, backwards: boolean) {
        if (this.lastActiveEditable) {
            this.lastActiveEditable.updateAndDeactivate();
        }
        const editable = positionStart.group.getLines()[positionStart.line]
            .getEditableFromIndex(positionStart.editable);
        editable.setActive(positionStart.char, positionEnd.char, this);
        this.lastActiveEditable = editable;
        this.inputCapture.setStyleTop(this.elm.offsetTop + this.elm.offsetHeight);
        if (backwards) { this.class("backwards"); } else { this.removeClass("backwards"); }
    }

    private setTextareInputCursorPosition(position: Readonly<EditorCursorPositionAbsolute>) {
        this.updateInputCaptureContext(position);
        this.inputCapture.setPositionOnCurrentLine(position.editable, position.char);
    }

    private clampPositionChar() {
        if (!this.position) { throw new Error("No position to clamp"); }

        const editable = this.position.group.getLines()[this.position.line]
            .getEditableFromIndex(this.position.editable);
        const maxCharOffset = editable.getValue().length;
        if (this.position.char > maxCharOffset) { // clamp offset
            this.position = {
                group: this.position.group,
                line: this.position.line,
                editable: this.position.editable,
                char: maxCharOffset
            };
        }
    }

    private updateInputCaptureContext(position: Readonly<EditorCursorPositionAbsolute>) {
        this.inputCapture.setContext(
            position.group.getContextForPosition(position)
        );
    }

    public registerInstructionGroup(group: InstructionGroupEditor) {
        this.groupEditorsElmsMap.set(group.elm.getHTMLElement(), group);
    }
}

export interface EditorCursorPositionAbsolute {
    group: InstructionGroupEditor;
    line: number;
    editable: number;
    char: number;
}
