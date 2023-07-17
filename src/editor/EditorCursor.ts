import { TextareaUserInputCapture } from "./TextareaUserInputCapture.js";
import { Elm, EventBus } from "../japnaaEngine2d/JaPNaAEngine2d.js";
import { InstructionGroupEditor } from "./InstructionGroupEditor.js";
import { getAncestorWhich, isAncestor } from "../utils.js";
import { Editable } from "./Editable";
import { AutoComplete } from "./AutoComplete.js";

export class EditorCursor extends Elm<"span"> {
    public groupEditorsElmsMap = new WeakMap<HTMLDivElement, InstructionGroupEditor>();
    public autocomplete = new AutoComplete();

    public focusChangeGroup = new EventBus<InstructionGroupEditor>();
    public clickGroup = new EventBus<InstructionGroupEditor>();
    public keyboardShortcutPress = new EventBus<KeyboardEvent>();

    private inputCapture = new TextareaUserInputCapture();
    private position?: Readonly<EditorCursorPositionAbsolute>;

    private lastActiveEditable?: Editable;
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
                        this._setPosition(position);
                        this.setVirtualCursorPosition(position, position, false);
                        this.setTextareInputCursorPosition(position);
                        position.group.appendInputCapture(this.inputCapture);
                        this.inputCapture.focus();
                        this.clickGroup.send(group);

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
            if (!this.position) { return; }
            this.allowAutocomplete = true;
            justInputted = true;
            this.position.group.onCursorInput(this.position, input);
        };

        this.inputCapture.lineDeleteHandler = lineOp => {
            if (!this.position) { return; }
            this.position.group.onLineDelete(this.position, lineOp);
        };

        this.inputCapture.keydownIntercepter = e => {
            if (e.ctrlKey && !["ArrowLeft", "ArrowRight", "Delete", "Backspace"].includes(e.key)) {
                this.keyboardShortcutPress.send(e);
                e.preventDefault();
                return;
            }

            if (!this.position) { return; }
            if (!this.autocomplete.isShowingSuggestions()) { return; }
            if (!this.lastActiveEditable) { return; }

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
                    const text = this.autocomplete.getSelectedSuggestion();
                    this.autocomplete.clearSuggestions();
                    if (!text) { preventDefault = false; break; }
                    this.lastActiveEditable.setValue(text);
                    this.setPosition({
                        group: this.position.group,
                        char: this.position.char,
                        editable: Math.min(this.position.editable + 1, this.position.group.getLines()[this.position.line].getLastEditableIndex()),
                        line: this.position.line
                    });
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
        return this.position;
    }

    public setPosition(position: EditorCursorPositionAbsolute) {
        this._setPosition(position);
        this.clampPosition();
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
        const lastPosition = this.position;
        this.position = position;
        if (!lastPosition || position.group !== lastPosition.group) {
            this.focusChangeGroup.send(position.group);
        }
    }

    private setVirtualCursorPosition(positionStart: Readonly<EditorCursorPositionAbsolute>, positionEnd: Readonly<EditorCursorPositionAbsolute>, backwards: boolean) {
        if (this.lastActiveEditable) {
            this.lastActiveEditable.updateAndDeactivate();
        }
        const line = positionStart.group.getLines()[positionStart.line];
        if (!line) { return; }

        const editable = line.getEditableFromIndex(positionStart.editable);
        editable.setActive(positionStart.char, positionEnd.char, this);
        if (this.lastActiveEditable !== editable) {
            if (this.lastActiveEditable) {
                this.autocomplete.enteredValue(this.lastActiveEditable);
            }
            this.lastActiveEditable = editable;
        }
        if (this.allowAutocomplete) {
            this.autocomplete.updatePosition(this);
            this.autocomplete.showSuggestions(editable);
        }
        this.inputCapture.setStyleTop(this.elm.offsetTop + this.elm.offsetHeight);
        if (backwards) { this.class("backwards"); } else { this.removeClass("backwards"); }
    }

    private setTextareInputCursorPosition(position: Readonly<EditorCursorPositionAbsolute>) {
        this.updateInputCaptureContext(position);
        this.inputCapture.setPositionOnCurrentLine(position.editable, position.char);
    }

    private clampPosition() {
        if (!this.position) { throw new Error("No position to clamp"); }

        const lines = this.position.group.getLines();
        if (this.position.line >= lines.length) {
            const lastLine = lines[lines.length - 1];
            this.position = {
                group: this.position.group,
                line: lines.length - 1,
                editable: lastLine.getLastEditableIndex(),
                char: lastLine.getLastEditableCharacterIndex()
            };
        } else if (this.position.line < 0) {
            this.position = {
                group: this.position.group,
                line: 0,
                editable: 0,
                char: 0
            };
        } else {
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
