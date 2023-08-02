import { TextareaUserInputCapture } from "./TextareaUserInputCapture.js";
import { Elm, EventBus } from "../../../japnaaEngine2d/JaPNaAEngine2d.js";
import { InstructionGroupEditor } from "../InstructionGroupEditor.js";
import { getAncestorWhich, isAncestor } from "../../utils.js";
import { Editable } from "./Editable.js";
import { AutoComplete } from "./AutoComplete.js";

export class EditorCursor extends Elm<"span"> {
    public groupEditorsElmsMap = new WeakMap<HTMLDivElement, InstructionGroupEditor>();
    public autocomplete = new AutoComplete();
    public activeEditable?: Editable;

    public onFocusChangeGroup = new EventBus<InstructionGroupEditor>();
    public onClickGroup = new EventBus<InstructionGroupEditor>();
    public onKeyboardShortcutPress = new EventBus<KeyboardEvent>();
    public onKeydownIntercept = new EventBus<KeyboardEvent>();
    public onInput = new EventBus();

    private inputCapture = new TextareaUserInputCapture();
    private positionStart?: Readonly<EditorCursorPositionAbsolute>;
    private positionEnd?: Readonly<EditorCursorPositionAbsolute>;

    private allowAutocomplete = false;

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
                        this.setPosition(position);
                        this.onClickGroup.send(group);

                        this.allowAutocomplete = false;
                        this.autocomplete.clearSuggestions();
                    }
                }
            }
        });

        let justInputted = false;
        let prevPosStart: EditorCursorPositionAbsolute | undefined;
        let prevPosEnd: EditorCursorPositionAbsolute | undefined;
        this.inputCapture.positionChangeHandler = (relPosStart, relPosEnd, backwards) => {
            if (!this.positionStart) { return; }
            const newPosStart = this.positionStart.group.calculateNewPosition(this.positionStart, relPosStart);
            const newPosEnd = this.positionStart.group.calculateNewPosition(this.positionStart, relPosEnd);

            // select entire editable if is placeholder
            if (
                newPosStart.char === newPosEnd.char &&
                newPosStart.editable === newPosEnd.editable &&
                newPosStart.group === newPosEnd.group &&
                newPosStart.line === newPosEnd.line
            ) {
                const editable = this.getEditableFromPosition(newPosStart);
                if (editable?.placeholder) {
                    relPosStart[2] = newPosStart.char = 0;
                    relPosEnd[2] = newPosEnd.char = editable.getValue().length;
                }
            }

            if (this.positionStart.group !== newPosStart.group || this.positionStart.line !== newPosStart.line) {
                this.positionStart.group.appendInputCapture(this.inputCapture);
                this.setTextareInputCursorPosition(newPosStart, newPosEnd);
            }
            this.setVirtualCursorPosition(newPosStart, newPosEnd, backwards);
            this._setPosition(newPosStart);
            this.inputCapture.focus();

            // filter events duplicate events
            if (prevPosStart && prevPosEnd &&
                newPosStart.group === prevPosStart.group &&
                newPosStart.line === prevPosStart.line &&
                newPosStart.editable === prevPosStart.editable &&
                newPosStart.char === prevPosStart.char &&
                newPosEnd.group === prevPosEnd.group &&
                newPosEnd.line === prevPosEnd.line &&
                newPosEnd.editable === prevPosEnd.editable &&
                newPosEnd.char === prevPosEnd.char
            ) {
                return;
            }

            prevPosStart = newPosStart;
            prevPosEnd = newPosEnd;

            if (!justInputted) {
                this.allowAutocomplete = false;
                this.autocomplete.clearSuggestions();
            }
            justInputted = false;
        };

        this.inputCapture.inputHandler = input => {
            if (!this.positionStart) { return; }
            this.allowAutocomplete = true;
            justInputted = true;
            this.onInput.send();
            this.positionStart.group.onCursorInput(this.positionStart, input);

            const editable = this.getEditableFromPosition(this.positionStart);
            if (!editable) { return; }
            this.autocomplete.removedValue(editable);
        };

        this.inputCapture.afterInputHandler = () => {
            if (!this.positionStart) { return; }
            const editable = this.getEditableFromPosition(this.positionStart);
            if (!editable) { return; }
            this.autocomplete.enteredValue(editable);
        };

        this.inputCapture.lineDeleteHandler = lineOp => {
            if (!this.positionStart) { return; }
            this.positionStart.group.onLineDelete(this.positionStart, lineOp);
        };

        this.inputCapture.keydownIntercepter = e => {
            if (e.ctrlKey && !["ArrowLeft", "ArrowRight", "Delete", "Backspace", "C", "c", "V", "v", "X", "x"].includes(e.key)) {
                this.onKeyboardShortcutPress.send(e);
                return;
            }

            this.onKeydownIntercept.send(e);

            if (!this.positionStart) { return; }
            if (!this.autocomplete.isShowingSuggestions()) { return; }
            if (!this.activeEditable) { return; }

            let preventDefault = true;
            switch (e.key) {
                case "Escape":
                    e.stopPropagation();
                    this.allowAutocomplete = false;
                    this.autocomplete.clearSuggestions();
                    preventDefault = false;
                    break;
                case "ArrowUp":
                    this.autocomplete.navPrevSuggestion();
                    break;
                case "ArrowDown":
                    this.autocomplete.navNextSuggestion();
                    break;
                case "Enter":
                case "Tab":
                    // accept suggestion
                    const text = this.autocomplete.acceptSuggestion();
                    this.autocomplete.clearSuggestions();
                    if (!text) { break; }
                    this.autocomplete.removedValue(this.activeEditable);
                    this.activeEditable.setValue(text);
                    this.autocomplete.enteredValue(this.activeEditable);

                    this.activeEditable.placeholder = false;
                    this.allowAutocomplete = false;
                    const currLine = this.positionStart.group.getLines()[this.positionStart.line];
                    if (this.positionStart.editable >= currLine.getLastEditableIndex()) {
                        // end of current editable
                        this.setPosition({
                            group: this.positionStart.group,
                            char: text.length,
                            editable: this.positionStart.editable,
                            line: this.positionStart.line
                        });
                    } else {
                        // next editable
                        this.setPosition({
                            group: this.positionStart.group,
                            char: 0,
                            editable: Math.min(this.positionStart.editable + 1, currLine.getLastEditableIndex()),
                            line: this.positionStart.line
                        });
                    }
                    break;
                default:
                    preventDefault = false;
            }

            if (preventDefault) {
                e.preventDefault();
                return true;
            }
        };

        this.inputCapture.focusHandler = () => {
            this.removeClass("hidden");
        };

        this.inputCapture.unfocusHandler = () => {
            this.class("hidden");
            this.autocomplete.clearSuggestions();
        };
    }

    public unfocus() {
        this.inputCapture.unfocus();
    }

    public focus() {
        this.inputCapture.focus();
    }

    public setSelectedText(text: string) {
        this.replaceContents(text);
    }

    public getPosition(): Readonly<EditorCursorPositionAbsolute | undefined> {
        return this.positionStart;
    }

    public getPositions() {
        return { start: this.positionStart, end: this.positionEnd };
    }

    public setPosition(position: EditorCursorPositionAbsolute) {
        const editable = this.getEditableFromPosition(position);
        if (editable?.placeholder) { // placeholder handling
            this.allowAutocomplete = true;
            let posStart = {
                group: position.group,
                line: position.line,
                editable: position.editable,
                char: 0
            };
            let posEnd = {
                group: position.group,
                line: position.line,
                editable: position.editable,
                char: editable.getValue().length
            };
            this._setPosition(posStart);
            position.group.appendInputCapture(this.inputCapture);
            this.setVirtualCursorPosition(posStart, posEnd, false);
            this.setTextareInputCursorPosition(posStart, posEnd);
        } else {
            this._setPosition(position);
            this.clampPosition();
            position.group.appendInputCapture(this.inputCapture);
            this.setVirtualCursorPosition(this.positionStart!, this.positionStart!, false);
            this.setTextareInputCursorPosition(this.positionStart!, this.positionStart!);
        }

        this.inputCapture.focus();
    }

    public update() {
        if (this.positionStart) {
            this.setPosition(this.positionStart);
        }
    }

    private _setPosition(position: EditorCursorPositionAbsolute) {
        const lastPosition = this.positionStart;
        this.positionStart = this.positionEnd = position;
        if (!lastPosition || position.group !== lastPosition.group) {
            this.onFocusChangeGroup.send(position.group);
        }
    }

    private setVirtualCursorPosition(positionStart: Readonly<EditorCursorPositionAbsolute>, positionEnd: Readonly<EditorCursorPositionAbsolute>, backwards: boolean) {
        const lastActiveEditable = this.activeEditable;
        if (lastActiveEditable) {
            lastActiveEditable.placeholder = false;
        }
        this.positionStart = positionStart;
        this.positionEnd = positionEnd;
        const editable = this.getEditableFromPosition(positionStart);
        if (!editable) { return; }
        this.activeEditable = editable;
        lastActiveEditable?.update();
        editable.update();
        if (this.allowAutocomplete) {
            this.autocomplete.updatePosition(this);
            this.autocomplete.showSuggestions(editable);
        }
        this.inputCapture.setStyleTop(this.elm.offsetTop + this.elm.offsetHeight);
        if (backwards) { this.class("backwards"); } else { this.removeClass("backwards"); }
    }

    private getEditableFromPosition(position: Readonly<EditorCursorPositionAbsolute>) {
        const line = position.group.getLines()[position.line];
        if (!line) { return; }
        return line.getEditableFromIndex(position.editable);
    }

    private setTextareInputCursorPosition(
        positionStart: Readonly<EditorCursorPositionAbsolute>,
        positionEnd: Readonly<EditorCursorPositionAbsolute>
    ) {
        this.updateInputCaptureContext(positionStart);
        this.inputCapture.setPositionsOnCurrentLine(
            positionStart.editable, positionStart.char,
            positionEnd.editable, positionEnd.char
        );
    }

    private clampPosition() {
        if (!this.positionStart) { throw new Error("No position to clamp"); }

        const lines = this.positionStart.group.getLines();
        if (this.positionStart.line >= lines.length) {
            const lastLine = lines[lines.length - 1];
            this.positionStart = this.positionEnd = {
                group: this.positionStart.group,
                line: lines.length - 1,
                editable: lastLine.getLastEditableIndex(),
                char: lastLine.getLastEditableCharacterIndex()
            };
        } else if (this.positionStart.line < 0) {
            this.positionStart = this.positionEnd = {
                group: this.positionStart.group,
                line: 0,
                editable: 0,
                char: 0
            };
        } else {
            const editable = this.positionStart.group.getLines()[this.positionStart.line]
                .getEditableFromIndex(this.positionStart.editable);
            const maxCharOffset = editable.getValue().length;
            if (this.positionStart.char > maxCharOffset) { // clamp offset
                this.positionStart = this.positionEnd = {
                    group: this.positionStart.group,
                    line: this.positionStart.line,
                    editable: this.positionStart.editable,
                    char: maxCharOffset
                };
            }
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

    public unregisterInstructionGroup(group: InstructionGroupEditor) {
        this.groupEditorsElmsMap.delete(group.elm.getHTMLElement());
    }
}

export interface EditorCursorPositionAbsolute {
    group: InstructionGroupEditor;
    line: number;
    editable: number;
    char: number;
}
