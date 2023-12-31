import { Editable } from "./Editable";
import { Elm } from "../../../japnaaEngine2d/JaPNaAEngine2d";

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
    public positionChangeHandler?: (posStart: TextareaUserInputCursorPositionRelative, posEnd: TextareaUserInputCursorPositionRelative, selectBackwards: boolean) => void;

    /** Fired when an editable is edited */
    public inputHandler?: (userInputEvent: UserInputEvent) => void;

    /** Fired when an editable is edited, and it's new value is applied */
    public afterInputHandler?: (userInputEvent: UserInputEvent) => void;

    /** Fired when a line deletion is requested by the user. Event handlers must setup the input capture again, unless the event is rejected. */
    public lineDeleteHandler?: (lineOp: LineOperationEvent) => void;

    /** Fired on keydown, before changing the textarea. Can preventDefault here. Return 'true' to cancel change check. */
    public keydownIntercepter?: (event: KeyboardEvent) => boolean | undefined;

    /** Fired when textarea in focus */
    public focusHandler?: () => void;
    /** Fired when textarea is no longer focused */
    public unfocusHandler?: () => void;

    private lastSelectionStart: number = 0;
    private lastSelectionEnd: number = 0;
    private lastTextareaValue = "";

    constructor() {
        this.textarea = this.inputCapture.getHTMLElement();
        this.inputCapture.on("focus", () => this.focusHandler?.());
        this.inputCapture.on("blur", () => this.unfocusHandler?.());

        this.inputCapture.on("input", () => this.onChange());
        this.inputCapture.on("selectionchange", () => this.onChange());

        // chrome support
        // from https://stackoverflow.com/a/53999418
        this.inputCapture.on("keydown", ev => {
            if (this.keydownIntercepter && this.keydownIntercepter(ev)) { return; }
            setTimeout(() => this.checkCursorPosition(), 1);
        });
        this.inputCapture.on("paste", () => this.checkCursorPosition()); // Clipboard actions
        this.inputCapture.on("cut", () => this.checkCursorPosition());
        this.inputCapture.on("select", () => this.checkCursorPosition()); // Some browsers support this event
        this.inputCapture.on("selectstart", () => this.checkCursorPosition()); // Some browsers support this event
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

    public unfocus() {
        this.textarea.blur();
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

        const posStart = this.getPosition(this.textarea.selectionStart);
        const posEnd = this.getPosition(this.textarea.selectionEnd);
        if (this.positionChangeHandler) {
            this.positionChangeHandler(posStart, posEnd, this.textarea.selectionDirection === 'backward');
        }

        this.lastSelectionStart = this.textarea.selectionStart;
        this.lastSelectionEnd = this.textarea.selectionEnd;

        setTimeout(() => {
            const indexStart = this.getIndexOnCurrentLine(posStart[1], posStart[2]);
            const indexEnd = this.getIndexOnCurrentLine(posEnd[1], posEnd[2]);
            this.setTextareaCursorPositionsIfNeeded(indexStart, indexEnd);
        }, 1);
    }

    private generateTextareaText() {
        return "\n \xa0" + this.areasToString(this.aboveLine) + "\n \xa0" + this.areasToString(this.currentLine) + "\n \xa0" + this.areasToString(this.belowLine) + "\n";
    }

    private getChanges() {
        const that = this;
        const lastValue = this.lastTextareaValue;
        const currentValue = this.textarea.value;
        const currentValueLen = currentValue.length;
        const lastValueLen = lastValue.length;
        const deltaLength = currentValue.length - lastValue.length;

        const maxStartMatch = Math.min(this.lastSelectionStart, this.textarea.selectionStart);
        const maxEndMatch = Math.min(
            lastValueLen - this.lastSelectionStart,
            currentValueLen - this.textarea.selectionStart
        );

        let i: number;
        for (i = 0; i < maxStartMatch; i++) {
            if (currentValue[i] !== this.lastTextareaValue[i]) {
                break;
            }
        }


        let j: number;
        for (j = 1; j < maxEndMatch; j++) {
            if (currentValue[currentValueLen - j] !== this.lastTextareaValue[lastValueLen - j]) {
                break;
            }
        }

        let currI = 0;

        // \n
        if (i <= currI++) { console.log('a'); return null; }

        // aboveLine, currentLine, belowLine
        for (const [posStr, areas] of [["up", this.aboveLine], ["same", this.currentLine], ["down", this.belowLine]] as ['up' | 'same' | 'down', TextareaUserInputCaptureAreas][]) {
            let editableIndex = -1;

            // first extra space in front of line to capture moves to start of line
            // second extra space in front of line to capture moves to the previous line by moving left
            currI += 2;
            if (i < currI) {
                // probably backspaced at start of line
                applyLineOperation(false, false);
                return;
            }

            let seenEditable = false;
            for (let areaIndex = 0; areaIndex < areas.length; areaIndex++) {
                const area = areas[areaIndex];
                const isEditable = area instanceof Editable;
                if (isEditable) {
                    seenEditable = true;
                    const value = area.getValue();
                    if (i <= currI + value.length) {
                        if (lastValueLen - j <= currI + value.length) {
                            applyChange(
                                area,
                                lastValue.slice(currI, currI + value.length),
                                currentValue.slice(currI, currI + value.length + deltaLength)
                            );
                            return;
                        }
                    }
                    currI += value.length;
                } else {
                    if (i < currI + area) {
                        if (!seenEditable) {
                            // backspace on the first space
                            applyLineOperation(false, false);
                            return;
                        } else {
                            this.resetChanges(deltaLength);
                            return;
                        }
                    }
                    currI += area;
                }
            }

            if (i <= currI++) {
                // delete at end of line
                applyLineOperation(true, false);
                return;
            }
        }

        function applyChange(editable: Editable, original: string, newContent: string) {
            const event = new UserInputEvent(
                currentValue.slice(i, currentValueLen - j),
                that.lastTextareaValue.slice(i, lastValueLen - j),
                newContent
            );
            editable.checkInput(event);
            that.inputHandler?.(event);
            if (event.isRejected()) {
                that.resetChanges(0);
            } else {
                editable.setValue(newContent);
                if (that.positionChangeHandler) {
                    const cursorPos = that.getPosition(that.textarea.selectionStart);
                    that.positionChangeHandler(cursorPos, cursorPos, false);
                }
                editable.afterChangeApply();
            }
            that.afterInputHandler?.(event);
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
            if (cursorPos && cursorPos[3] && this.positionChangeHandler) {
                this.positionChangeHandler(cursorPos, cursorPos, false);
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
        const indexPos = this.getIndexOnCurrentLine(editableOrIndex, characterIndex);
        this.setTextareaCursorPositionIfNeeded(indexPos);
    }

    /** Sets the cursor positions on the current line */
    public setPositionsOnCurrentLine(
        editableOrIndexStart: number | Editable, characterIndexStart: number,
        editableOrIndexEnd: number | Editable, characterIndexEnd: number
    ) {
        const indexPosStart = this.getIndexOnCurrentLine(editableOrIndexStart, characterIndexStart);
        const indexPosEnd = this.getIndexOnCurrentLine(editableOrIndexEnd, characterIndexEnd);
        this.setTextareaCursorPositionsIfNeeded(indexPosStart, indexPosEnd);
    }

    private getIndexOnCurrentLine(editableOrIndex: number | Editable, characterIndex: number) {
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
                    return curr + characterIndex;
                }
                currEditable++;
                curr += area.getValue().length;
            } else {
                curr += area;
            }
        }
        console.warn("Tried to set position, but could not find position", editableOrIndex, characterIndex, this);
        return 0;
    }

    private setTextareaCursorPositionIfNeeded(index: number) {
        if (this.lastSelectionEnd != index || this.lastSelectionStart != index) {
            this.textarea.selectionStart = this.textarea.selectionEnd =
                this.lastSelectionStart = this.lastSelectionEnd = index;
        }
    }

    private setTextareaCursorPositionsIfNeeded(indexStart: number, indexEnd: number) {
        if (this.lastSelectionEnd !== indexEnd) {
            this.textarea.selectionEnd = this.lastSelectionEnd = indexEnd;
        }
        if (this.lastSelectionStart !== indexStart) {
            this.textarea.selectionStart = this.lastSelectionStart = indexStart;
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
export abstract class RejectableEvent {
    private rejected = false;

    public reject() {
        this.rejected = true;
    }

    public isRejected() {
        return this.rejected;
    }
}

export class UserInputEvent extends RejectableEvent {
    constructor(
        public readonly added: string,
        public readonly removed: string,
        public readonly newContent: string
    ) { super(); }
}

export class LineOperationEvent extends RejectableEvent {
    constructor(
        /** Is the operation on the current line or next line? */
        public readonly isNextLine: boolean,
        /** Is the operation an insertion or deletion? */
        public readonly isInsert: boolean
    ) { super(); }
}
