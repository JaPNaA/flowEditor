import { Elm, EventBus } from "../../../japnaaEngine2d/JaPNaAEngine2d";
import { InstructionGroup } from "../InstructionGroup";
import { Editable } from "./Editable";
import { AutoComplete } from "./AutoComplete";
import { ContentEditableInputCapture } from "./ContentEditableInputCapture";

export class EditorCursor extends Elm<"span"> {
    public autocomplete = new AutoComplete();
    public activeEditable?: Editable;

    public onFocusChangeGroup = new EventBus<InstructionGroup>();
    public onClickGroup = new EventBus<InstructionGroup>();
    public onKeyboardShortcutPress = new EventBus<KeyboardEvent>();
    public onKeydownIntercept = new EventBus<KeyboardEvent>();
    public onInput = new EventBus();

    private inputCapture = new ContentEditableInputCapture();
    private positionStart?: Readonly<EditorCursorPositionAbsolute>;

    private allowAutocomplete = false;

    constructor() {
        super("span");
        this.class("cursor");

        let justInputted = false;
        const positionChangeHandler = (
            posStart: EditorCursorPositionAbsolute,
            posEnd: EditorCursorPositionAbsolute,
            backwards: boolean
        ) => {
            // select entire editable if is placeholder
            if (
                posStart.char === posEnd.char &&
                posStart.editable === posEnd.editable &&
                posStart.group === posEnd.group &&
                posStart.line === posEnd.line
            ) {
                const editable = this.getEditableFromPosition(posStart);
                if (editable?.isPlaceholder) {
                    posStart.char = 0;
                    posEnd.char = editable.getValue().length;
                }
            }


            this.onClickGroup.send(posStart.group);
            this.afterCursorMove(posStart);

            if (!justInputted) {
                this.allowAutocomplete = false;
                this.autocomplete.clearSuggestions();
            }
            justInputted = false;
        };

        this.inputCapture.positionChangeHandler = positionChangeHandler;

        this.inputCapture.afterChangeDomSelectionHandler = () => {
            this.autocomplete.updatePosition();
        };

        this.inputCapture.inputHandler = () => {
            if (!this.positionStart) { return; }
            this.allowAutocomplete = true;
            justInputted = true;
            this.onInput.send();
        };

        this.inputCapture.afterInputHandler = events => {
            const groups = new Set(events.map(x => x.editable.parentLine.parentBlock.getGroup()));
            for (const group of groups) {
                group?.group.editor.updateHeight();
            }
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

                    this.activeEditable.isPlaceholder = false;
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

    /** Register a group editor. Called by InstructionGroupEditor when entering edit mode */
    public registerGroupEditor(group: InstructionGroup) {
        this.inputCapture.registerGroup(group);
    }

    /** Unregister a group editor. Called by InstructionGroupEditor when exiting edit mode */
    public unregisterGroupEditor(group: InstructionGroup) {
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
        if (editable?.isPlaceholder) { // placeholder handling
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
            this.inputCapture.setPosition(posStart, posEnd);
            this.afterCursorMove(posStart);
        } else {
            this.positionStart = position;
            this.inputCapture.setPosition(this.positionStart, this.positionStart);
            this.afterCursorMove(this.positionStart);
        }

        this.inputCapture.focus();
    }

    public update() {
        if (this.positionStart) {
            this.setPosition(this.positionStart);
        }
    }

    private afterCursorMove(position: Readonly<EditorCursorPositionAbsolute>) {
        const lastPosition = this.positionStart;
        this.positionStart = position;
        if (!lastPosition || position.group !== lastPosition.group) {
            this.onFocusChangeGroup.send(position.group);
        }

        const lastActiveEditable = this.activeEditable;
        if (lastActiveEditable) {
            lastActiveEditable.isPlaceholder = false;
            lastActiveEditable.update(); // some editables like in NewInstruction use update to enable/disable their keydown intercepter
        }

        const editable = this.getEditableFromPosition(position);
        if (!editable) { return; }
        this.activeEditable = editable;
        if (this.allowAutocomplete) {
            this.autocomplete.updatePosition();
            this.autocomplete.showSuggestions(editable);
        }
        editable.update(); // some editables like in NewInstruction use update to enable/disable their keydown intercepter
    }

    private getEditableFromPosition(position: Readonly<EditorCursorPositionAbsolute>) {
        const line = position.group.block.getLine(position.line);
        if (!line) { return; }
        return line.getEditableFromIndex(position.editable);
    }
}

export interface EditorCursorPositionAbsolute {
    group: InstructionGroup;
    line: number;
    editable: number;
    char: number;
}
