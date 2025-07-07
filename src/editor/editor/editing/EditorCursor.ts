import { Elm, EventBus, JaPNaAEngine2d, Vec2, Vec2M } from "../../../japnaaEngine2d/JaPNaAEngine2d";
import { InstructionGroup } from "../InstructionGroup";
import { Editable } from "./Editable";
import { AutoComplete } from "./AutoComplete";
import { ContentEditableInputCapture } from "./ContentEditableInputCapture";

/**
 * A list of keys to ignore, even if the user is pressing this key while
 * holding ctrl.
 * 
 * These keys have special browser behaviour associated with them
 * when ctrl is held.
 */
const IGNORE_CTRL_KEY_LIST = [
    "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown",
    "Delete", "Backspace",
    "Home", "End",
    "C", "c", "V", "v", "X", "x",
];

export class EditorCursor extends Elm<"span"> {
    public activeEditable?: Editable;

    public onFocusChangeGroup = new EventBus<InstructionGroup>();
    public onClickGroup = new EventBus<InstructionGroup>();
    public onKeyboardShortcutPress = new EventBus<KeyboardEvent>();
    public onKeydownIntercept = new EventBus<KeyboardEvent>();
    public onWorldPositionChange = new EventBus<Vec2>();
    public onInput = new EventBus();

    public autocomplete = new AutoComplete(this);

    protected engine!: JaPNaAEngine2d;

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
            if (this.allowAutocomplete) {
                this.updateWorldPosition();
            }
        };

        this.inputCapture.afterGroupEdited = group => {
            group.editor.updateHeight();
        };

        this.inputCapture.inputHandler = () => {
            if (!this.positionStart) { return; }
            this.allowAutocomplete = true;
            justInputted = true;
            this.onInput.send();
        };

        this.inputCapture.keydownIntercepter = e => {
            if (e.ctrlKey && !IGNORE_CTRL_KEY_LIST.includes(e.key)) {
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
                    const suggestionGetter = this.autocomplete.getSelectedSuggestion();
                    this.autocomplete.clearSuggestions();
                    if (!suggestionGetter) { break; }
                    // run the suggestion getter after clearing suggestions, this is to avoid
                    // the case:
                    //   - suggestionGetter requests autocomplete to be shown
                    //   - this function request autocomplete to be cleared, clearing
                    //     the requested autocomplete from suggestionGetter
                    const suggestion = suggestionGetter();
                    if (!suggestion) { break; }
                    this.activeEditable.requestSetValue(suggestion);

                    this.activeEditable.isPlaceholder = false;
                    this.allowAutocomplete = false;
                    const currLine = this.positionStart.group.block.getLine(this.positionStart.line);
                    if (this.positionStart.editable >= currLine.getLastEditableIndex()) {
                        // end of current editable
                        this.setPosition({
                            group: this.positionStart.group,
                            char: suggestionGetter.length,
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

    public setEngine(engine: JaPNaAEngine2d) {
        this.engine = engine;
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
            this.inputCapture.setPosition(position, position);
            this.afterCursorMove(position);
        }

        this.inputCapture.focus();
    }

    public requestAutocomplete() {
        if (!this.activeEditable) { return; }
        this.allowAutocomplete = true;
        this.autocomplete.showSuggestions(this.activeEditable);
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
        const editable = this.getEditableFromPosition(position);
        this.activeEditable = editable;

        // Update the last active editable after setting the new this.activeEditable
        // since the update method may check the current active editable.
        if (lastActiveEditable && lastActiveEditable !== editable) {
            lastActiveEditable.isPlaceholder = false;
            lastActiveEditable.update(); // some editables like in NewInstruction use update to enable/disable their keydown intercepter
        }

        if (!editable) { return; }
        if (this.allowAutocomplete) {
            this.autocomplete.showSuggestions(editable);
        }
        editable.update(); // some editables like in NewInstruction use update to enable/disable their keydown intercepter
        this.updateWorldPosition();
    }

    private updateWorldPosition() {
        const selection = document.getSelection();
        if (!selection || !selection.anchorNode) { return; }
        const range = document.createRange();
        range.setStart(selection.anchorNode, selection.anchorOffset);
        range.collapse(true);

        let boundingRect = range.getBoundingClientRect();

        // workaround to avoid selecting a range with undefined rectangle
        if (
            boundingRect.x === 0 && boundingRect.y === 0 &&
            boundingRect.width === 0 && boundingRect.height === 0 &&
            selection.anchorOffset === 0 && selection.anchorNode instanceof Text
        ) {
            const oldValue = selection.anchorNode.nodeValue;
            selection.anchorNode.nodeValue = ' ';
            boundingRect = range.getBoundingClientRect();
            selection.anchorNode.nodeValue = oldValue;
        }

        range.detach();

        if (
            boundingRect.x === 0 && boundingRect.y === 0 &&
            boundingRect.width === 0 && boundingRect.height === 0
        ) {
            // likely an invalid bounding box -- better to ignore
            return;
        }

        this.onWorldPositionChange.send(
            this.engine.camera.canvasToWorldPos(
                this.engine.sizer.screenPosToCanvasPos(
                    new Vec2M(boundingRect.x, boundingRect.y + boundingRect.height)
                )
            )
        );
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
