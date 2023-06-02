import { Editable } from "./Editable.js";
import { EditorCursor } from "./EditorCursor.js";
import { LineOperationEvent, UserInputEvent } from "./events.js";
import { Elm } from "../japnaaEngine2d/JaPNaAEngine2d.js";

/** A string represents an editable area with text. A number represents uneditable space by <number> spaces. */
export type TextareaUserInputCaptureAreas = (Editable | number)[];
/** Change of line. Then, (only for "up", "same", "down") offset on line given by which editiable, then character offset in editable */
export type TextareaUserInputCursorPositionRelative = ["top" | "up" | "same" | "down" | "bottom", number, number, Editable?];

export class TextareaUserInputCapture {

    private inputCapture: Elm<"textarea"> = new Elm("textarea").class("inputCapture");
    private textarea: HTMLTextAreaElement;
    private currentLine: TextareaUserInputCaptureAreas = [];
    private aboveLine: TextareaUserInputCaptureAreas = [];
    private belowLine: TextareaUserInputCaptureAreas = [];

    /** Fired when the cursor position changes */
    private positionChangeHandler?: (pos: TextareaUserInputCursorPositionRelative) => void;

    /** Fired when an editable is edited */
    public inputHandler?: (userInputEvent: UserInputEvent) => void;

    /** Fired when a line deletion is requested by the user. Event handlers must setup the input capture again, unless the event is rejected. */
    public lineDeleteHandler?: (lineOp: LineOperationEvent) => void;

    private lastSelectionStart: number = 0;
    private lastSelectionEnd: number = 0;
    private lastTextareaValue = "";

    constructor(private cursor: EditorCursor) {
        this.textarea = this.inputCapture.getHTMLElement();
        this.inputCapture.on("input", () => this.onChange());
        this.inputCapture.on("selectionchange", () => this.onChange());

        // chrome support
        // from https://stackoverflow.com/a/53999418
        this.inputCapture.on('keydown', () => setTimeout(() => this.checkCursorPosition(), 1));
        this.inputCapture.on('input', () => this.checkCursorPosition()); // Other input events
        this.inputCapture.on('paste', () => this.checkCursorPosition()); // Clipboard actions
        this.inputCapture.on('cut', () => this.checkCursorPosition());
        this.inputCapture.on('select', () => this.checkCursorPosition()); // Some browsers support this event
        this.inputCapture.on('selectstart', () => this.checkCursorPosition()); // Some browsers support this event
    }

    private checkCursorPosition() {
        if (this.textarea.selectionStart !== this.lastSelectionStart || this.textarea.selectionEnd !== this.lastSelectionEnd) {
            this.onChange();
        }
    }

    public setStyleTop(y: number) {
        this.inputCapture.getHTMLElement().style.top = y + "px";
    }

    public appendTo(parent: Elm<any>) {
        parent.append(this.inputCapture);
    }

    public focus() {
        this.textarea.focus();
    }

    public setContext(context: TextareaUserInputCaptureContext) {
        this.currentLine = context.current;
        this.aboveLine = context.above;
        this.belowLine = context.below;
        this.updateTextareaValue();
    }

    private updateTextareaValue() {
        this.textarea.value = this.lastTextareaValue = this.generateTextareaText();
        this.lastSelectionStart = this.lastSelectionEnd = -1;
    }

    public setPositionChangeHandler(changeHandler: (pos: TextareaUserInputCursorPositionRelative) => void) {
        this.positionChangeHandler = changeHandler;
    }

    public setInputHandler(inputHandler: (inputEvent: UserInputEvent) => void) {
        this.inputHandler = inputHandler;
    }

    public setLineDeleteHandler(lineDeleteHandler: (lineOp: LineOperationEvent) => void) {
        this.lineDeleteHandler = lineDeleteHandler;
    }

    public getCurrentPosition() {
        return this.getPosition(this.lastSelectionStart);
    }

    private onChange() {
        if (this.textarea.value !== this.lastTextareaValue) {
            this.getChanges();
            this.lastTextareaValue = this.textarea.value;
        }

        if (this.textarea.selectionStart == this.lastSelectionStart &&
            this.textarea.selectionEnd == this.lastSelectionEnd) { return; }

        const pos = this.getPosition(this.textarea.selectionStart);
        if (this.positionChangeHandler) {
            this.positionChangeHandler(pos);
        }

        this.lastSelectionStart = this.textarea.selectionStart;
        this.lastSelectionEnd = this.textarea.selectionEnd;

        setTimeout(() => this.setPositionOnCurrentLine(pos[1], pos[2]), 1);
    }

    private generateTextareaText() {
        return "\n  " + this.areasToString(this.aboveLine) + "\n  " + this.areasToString(this.currentLine) + "\n  " + this.areasToString(this.belowLine) + "\n";
    }

    private getChanges() {
        // better algorithm: getPosition, but scanning for changes. To be implemented.

        const that = this;
        const currentValue = this.textarea.value;
        const lastValue = this.lastTextareaValue;
        const deltaLength = currentValue.length - lastValue.length;

        let currI = 0;
        let lastI = 0;

        // \n
        if (currentValue[currI++] !== lastValue[lastI++]) { console.log('a'); return null; }

        // aboveLine, currentLine, belowLine
        for (const [posStr, areas] of [["up", this.aboveLine], ["same", this.currentLine], ["down", this.belowLine]] as ['up' | 'same' | 'down', TextareaUserInputCaptureAreas][]) {
            let editableIndex = -1;

            // first extra space in front of line to capture moves to start of line
            if (currentValue[currI++] !== lastValue[lastI++]) {
                // enter at end of line
                applyLineOperation(true, true);
                return;
            }

            // second extra space in front of line to capture moves to the previous line by moving left
            if (currentValue[currI++] !== lastValue[lastI++]) {
                // backspace at start of line
                applyLineOperation(false, false);
                return;
            }

            let seenEditable = false;
            for (let i = 0; i < areas.length; i++) {
                const area = areas[i];
                const isEditable = area instanceof Editable;
                if (isEditable) {
                    seenEditable = true;
                    const value = area.getValue();
                    for (let j = 0; j < value.length; j++) {
                        if (currentValue[currI++] !== lastValue[lastI++]) {
                            applyChange(
                                area,
                                lastValue.slice(currI - 1 - j, currI - 1 - j + value.length),
                                currentValue.slice(currI - j - 1, currI - j - 1 + value.length + deltaLength)
                            );
                            currI += deltaLength;
                            return;
                        }
                    }
                    if (deltaLength > 0 && currentValue[currI] !== lastValue[lastI]) {
                        // insert after editable
                        applyChange(area,
                            lastValue.slice(currI - value.length, currI),
                            currentValue.slice(currI - value.length, currI + deltaLength)
                        );
                        currI += deltaLength;
                        return;
                    }
                } else {
                    for (let j = 0; j < area; j++) {
                        if (currentValue[currI++] !== lastValue[lastI++]) {
                            if (!seenEditable) {
                                // backspace on the first space
                                applyLineOperation(false, false);
                                return;
                            } else {
                                this.resetChanges(deltaLength);
                                return;
                            }
                        }
                    }
                }
            }

            if (currentValue[currI++] !== lastValue[lastI++]) {
                // delete at end of line
                applyLineOperation(true, false);
                return;
            }
        }

        function applyChange(editable: Editable, original: string, newContent: string) {
            const diff = that.singleDiff(original, newContent);
            if (!diff) { return; }

            const event = new UserInputEvent(diff.added, diff.removed, newContent);
            that.inputHandler?.(event);
            editable.checkInput(event);
            if (event.isRejected()) {
                that.resetChanges(0);
            } else {
                editable.setValue(newContent);
                const cursorPos = that.getPosition(that.textarea.selectionStart);
                editable.setActive(cursorPos[2], that.cursor);
            }
        }

        function applyLineOperation(isNextLine: boolean, isInsert: boolean) {
            const event = new LineOperationEvent(isNextLine, isInsert);
            that.lineDeleteHandler?.(event);
            if (event.isRejected()) {
                that.resetChanges(0);
            }
        }
    }

    /** Diffs a string with a single difference (added/removed/replaced substring). */
    private singleDiff(original: string, currentValue: string): { added: string, removed: string } | null {
        let hadChange = false;
        let sameToIndex;
        const maxLength = Math.max(original.length, currentValue.length);
        for (sameToIndex = 0; sameToIndex < maxLength; sameToIndex++) {
            if (currentValue[sameToIndex] !== original[sameToIndex]) {
                hadChange = true;
                break;
            }
        }

        if (!hadChange) { return null; } // no changes

        const currentValueLen = currentValue.length;
        const lastValueLen = original.length;
        const maxBackwardSearch = Math.min(currentValueLen, lastValueLen) - sameToIndex;
        let sameToIndexRev;
        for (sameToIndexRev = 1; sameToIndexRev <= maxBackwardSearch; sameToIndexRev++) {
            if (currentValue[currentValueLen - sameToIndexRev] !== original[lastValueLen - sameToIndexRev]) {
                break;
            }
        }

        return {
            added: currentValue.slice(sameToIndex, 1 - sameToIndexRev),
            removed: original.slice(sameToIndex, 1 - sameToIndexRev)
        };
    }

    private resetChanges(cursorDelta: number) {
        const lastSelectionStart = this.lastSelectionStart;
        this.updateTextareaValue();

        if (cursorDelta) {
            this.lastSelectionStart = lastSelectionStart; // so getPosition gets relative movement data
            const cursorPos = this.getPosition(lastSelectionStart + cursorDelta);
            this.setPositionOnCurrentLine(cursorPos[1], cursorPos[2]);
            if (cursorPos && cursorPos[3]) {
                cursorPos[3].setActive(cursorPos[2], this.cursor);
            }
        } else {
            this.setTextareaCursorPositionIfNeeded(lastSelectionStart);
        }
    }

    private getPosition(cursorOffset: number): TextareaUserInputCursorPositionRelative {
        let curr = cursorOffset;
        const movingLeft = curr < this.lastSelectionStart;

        // \n
        if (curr <= 0) { return ["top", 0, 0]; }
        curr--;

        let previousLinePos: 'up' | 'same' | 'down' = 'up'; // not 'top' to prevent a 'two-line' jump being recognized as a jump to top
        let previousLineLastEditableIndex = 0;
        let previousLineLastCharacterOffset = 0;
        let previousLineLastEditable: Editable | undefined;
        // find the first element of 'up' (first element and not last, since the
        // initial values are only used when going 'up' into the first 'space' area,
        // in which case the cursor should jump to the first editable instead
        // of the last.)
        for (let i = 0; i < this.aboveLine.length; i++) {
            const area = this.aboveLine[i];
            if (area instanceof Editable) {
                previousLineLastEditable = area;
                break;
            }
        }

        // aboveLine, currentLine, belowLine
        for (const [posStr, areas] of [["up", this.aboveLine], ["same", this.currentLine], ["down", this.belowLine]] as ['up' | 'same' | 'down', TextareaUserInputCaptureAreas][]) {
            let editableIndex = -1;
            let lastEditableSize = 0;
            let lastEditable: Editable | undefined;

            let maxEditableIndex = -1;
            for (const area of areas) { if (area instanceof Editable) { maxEditableIndex++; } }

            // first extra space in front of line to capture moves to start of line
            if (curr <= 0) {
                // return first editable
                for (let i = 0; i < areas.length; i++) {
                    const area = areas[i];
                    if (area instanceof Editable) {
                        return [posStr, 0, 0, area];
                    }
                }
                return [posStr, 0, 0];
            }
            curr--;

            // second extra space in front of line to capture moves to the previous line by moving left
            if (curr <= 0) {
                return [previousLinePos, previousLineLastEditableIndex, previousLineLastCharacterOffset, previousLineLastEditable];
            }
            curr--;

            for (let i = 0; i < areas.length; i++) {
                const area = areas[i];
                const isEditable = area instanceof Editable;
                let size: number;
                if (isEditable) {
                    size = area.getValue().length;
                    editableIndex++;
                } else {
                    size = area;
                }

                if (isEditable ? curr <= size : curr < size) {
                    if (isEditable) {
                        return [posStr, editableIndex, curr, area];
                    } else {
                        // handle shifting to an editable
                        if (movingLeft) {
                            if (editableIndex < 0) {
                                return [previousLinePos, previousLineLastEditableIndex, previousLineLastCharacterOffset, previousLineLastEditable];
                            } else {
                                return [posStr, editableIndex, lastEditableSize, lastEditable];
                            }
                        } else {
                            if (editableIndex + 1 > maxEditableIndex) {
                                return [posStr, editableIndex, lastEditableSize, lastEditable];
                            } else {
                                let nextEditableIndex = editableIndex;
                                for (let j = i + 1; j < areas.length; j++) {
                                    const nextArea = areas[j];
                                    if (nextArea instanceof Editable) {
                                        nextEditableIndex++;
                                        return [posStr, nextEditableIndex, 0, nextArea];
                                    }
                                }
                                // return [posStr, Math.min(maxEditableIndex, editableIndex + 1), 0];
                            }
                        }
                    }
                }

                curr -= size;
                if (isEditable) {
                    lastEditableSize = size;
                    lastEditable = area;
                }
            }

            previousLinePos = posStr;
            previousLineLastEditableIndex = editableIndex;
            previousLineLastCharacterOffset = lastEditableSize;
            previousLineLastEditable = lastEditable;

            // catch cursor at end of line that ends with space
            if (curr <= 0) { return [posStr, Math.max(0, editableIndex), lastEditableSize, lastEditable]; }

            curr--; // \n
        }

        // \n
        return ["bottom", 0, 0];
    }

    /** Sets the cursor position on the current line */
    public setPositionOnCurrentLine(editableOrIndex: number | Editable, characterIndex: number) {
        let curr = 6; // 6 for '\n  ' at start and after above line
        for (const area of this.aboveLine) {
            if (area instanceof Editable) { curr += area.getValue().length; }
            else { curr += area; }
        }
        let currEditable = 0;
        for (const area of this.currentLine) {
            if (area instanceof Editable) {
                if (editableOrIndex instanceof Editable ?
                    area === editableOrIndex : currEditable == editableOrIndex) {
                    this.setTextareaCursorPositionIfNeeded(curr + characterIndex);
                    return;
                }
                currEditable++;
                curr += area.getValue().length;
            } else {
                curr += area;
            }
        }
        console.warn("Tried to set position, but could not find position", editableOrIndex, characterIndex, this);
    }

    private setTextareaCursorPositionIfNeeded(index: number) {
        if (this.lastSelectionEnd != index || this.lastSelectionStart != index) {
            this.textarea.selectionStart = this.textarea.selectionEnd =
                this.lastSelectionStart = this.lastSelectionEnd = index;
        }
    }

    private areasToString(areas: TextareaUserInputCaptureAreas): string {
        return areas.map(e => e instanceof Editable ? e.getValue() : "\xa0".repeat(e)).join("");
    }
}

export interface TextareaUserInputCaptureContext {
    above: TextareaUserInputCaptureAreas;
    current: TextareaUserInputCaptureAreas;
    below: TextareaUserInputCaptureAreas;
}
