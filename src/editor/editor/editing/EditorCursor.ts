import { Elm, EventBus } from "../../../japnaaEngine2d/JaPNaAEngine2d";
import { InstructionGroupEditor } from "../InstructionGroupEditor";
import { Editable } from "./Editable";
import { AutoComplete } from "./AutoComplete";
import { ContentEditableOverlayInputCapture } from "./ContentEditableOverlayInputCapture";
import { UndoableAction } from "./actions";

export class EditorCursor extends Elm<"span"> {
    public autocomplete = new AutoComplete();
    public activeEditable?: Editable;

    public onFocusChangeGroup = new EventBus<InstructionGroupEditor>();
    public onClickGroup = new EventBus<InstructionGroupEditor>();
    public onKeyboardShortcutPress = new EventBus<KeyboardEvent>();
    public onKeydownIntercept = new EventBus<KeyboardEvent>();
    public onInput = new EventBus();

    private inputCapture = new ContentEditableOverlayInputCapture();
    private positionStart?: Readonly<EditorCursorPositionAbsolute>;
    private positionEnd?: Readonly<EditorCursorPositionAbsolute>;

    private allowAutocomplete = false;

    constructor() {
        super("span");
        this.class("cursor");

        // note: todo remove below -- should not capture selection changes
        // however, we should make sure the relevant function calls are
        // still performed.

        // document.addEventListener("selectionchange", e => {
        //     if (!e.isTrusted) { return; }

        //     const selection = getSelection();
        //     if (!selection) { return; }
        //     const anchorNode = selection.anchorNode;
        //     if (isAncestor(anchorNode, this.elm)) { return; }

        //     const parentInstructionElm =
        //         getAncestorWhich(
        //             anchorNode,
        //             node => node instanceof HTMLDivElement && node.classList.contains("instructionGroup")
        //         ) as HTMLDivElement;
        //     if (!parentInstructionElm) { return; }
        //     const group = this.groupEditorsElmsMap.get(parentInstructionElm);
        //     if (!group) { return; }
        //     if (selection.rangeCount !== 1) { return; }
        //     const firstRange = selection.getRangeAt(0);
        //     const positionStart = group.selectionToPosition(new DOMSelection(
        //         firstRange.startContainer, firstRange.startOffset
        //     ));
        //     const positionEnd = group.selectionToPosition(new DOMSelection(
        //         firstRange.endContainer, firstRange.endOffset
        //     ));
        //     if (!positionStart || !positionEnd) { return; }

        //     // const compare = compareAbsoluteCursorPositions(positionStart, positionEnd);
        //     // if (!compare) { return; }
        //     // if (compare > 0) {
        //     positionChangeHandler(positionStart, positionEnd, false);
        //     // } else {
        //     //     positionChangeHandler(positionEnd, positionStart, true);
        //     // }
        //     // this.setPosition(position);
        //     this.onClickGroup.send(group);

        //     this.allowAutocomplete = false;
        //     this.autocomplete.clearSuggestions();
        // });

        let justInputted = false;
        let prevPosStart: EditorCursorPositionAbsolute | undefined;
        let prevPosEnd: EditorCursorPositionAbsolute | undefined;
        const positionChangeHandler = (
            posStart: EditorCursorPositionAbsolute,
            posEnd: EditorCursorPositionAbsolute,
            backwards: boolean
        ) => {
            if (!this.positionStart) { return; }
            // select entire editable if is placeholder
            if (
                posStart.char === posEnd.char &&
                posStart.editable === posEnd.editable &&
                posStart.group === posEnd.group &&
                posStart.line === posEnd.line
            ) {
                const editable = this.getEditableFromPosition(posStart);
                if (editable?.placeholder) {
                    posStart.char = 0;
                    posEnd.char = editable.getValue().length;
                }
            }

            this.setVirtualCursorPosition(posStart, posEnd, backwards);
            this._setPosition(posStart);
            // this.inputCapture.focus();

            // filter events duplicate events
            if (prevPosStart && prevPosEnd &&
                posStart.group === prevPosStart.group &&
                posStart.line === prevPosStart.line &&
                posStart.editable === prevPosStart.editable &&
                posStart.char === prevPosStart.char &&
                posEnd.group === prevPosEnd.group &&
                posEnd.line === prevPosEnd.line &&
                posEnd.editable === prevPosEnd.editable &&
                posEnd.char === prevPosEnd.char
            ) {
                return;
            }

            prevPosStart = posStart;
            prevPosEnd = posEnd;

            if (!justInputted) {
                this.allowAutocomplete = false;
                this.autocomplete.clearSuggestions();
            }
            justInputted = false;
        };

        this.inputCapture.positionChangeHandler = positionChangeHandler;

        this.inputCapture.inputHandler = input => {
            if (!this.positionStart) { return; }
            this.allowAutocomplete = true;
            justInputted = true;
            this.onInput.send();
            this.positionStart.group.onCursorInput(this.positionStart, input);

            // const editable = this.getEditableFromPosition(this.positionStart);
            // if (!editable) { return; }
        };

        this.inputCapture.afterInputHandler = () => {
            if (!this.positionStart) { return; }
            // const editable = this.getEditableFromPosition(this.positionStart);
            // if (!editable) { return; }
        };

        this.inputCapture.lineDeleteHandler = lineOp => {
            if (!this.positionStart) { return; }
            this.positionStart.group.onLineDelete(lineOp);
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
                    this.activeEditable.setValue(text);

                    this.activeEditable.placeholder = false;
                    this.allowAutocomplete = false;
                    const currLine = this.positionStart.group.block.getLine(this.positionStart.line);
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

    public onAction(action: UndoableAction) {
        this.inputCapture.onAction(action);
    }

    /** Register a group editor. Called by InstructionGroupEditor when entering edit mode */
    public registerGroupEditor(group: InstructionGroupEditor) {
        this.inputCapture.registerGroup(group);
    }

    /** Unregister a group editor. Called by InstructionGroupEditor when exiting edit mode */
    public unregisterGroupEditor(group: InstructionGroupEditor) {
        this.inputCapture.unregisterGroup(group);
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

    // todo: probably obsolete (behaviour same as positionChangeHandler)
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
            // position.group.appendInputCapture(this.inputCapture);
            this.setVirtualCursorPosition(posStart, posEnd, false);
        } else {
            this._setPosition(position);
            // this.clampPosition();
            // position.group.appendInputCapture(this.inputCapture);
            this.setVirtualCursorPosition(this.positionStart!, this.positionStart!, false);
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

        // set caret position
        this.inputCapture.setPosition(positionStart, positionEnd);

        // this.inputCapture.setStyleTop(this.elm.offsetTop + this.elm.offsetHeight);
        // if (backwards) { this.class("backwards"); } else { this.removeClass("backwards"); }
    }

    private getEditableFromPosition(position: Readonly<EditorCursorPositionAbsolute>) {
        const line = position.group.block.getLine(position.line);
        if (!line) { return; }
        return line.getEditableFromIndex(position.editable);
    }
}

export interface EditorCursorPositionAbsolute {
    group: InstructionGroupEditor;
    line: number;
    editable: number;
    char: number;
}
