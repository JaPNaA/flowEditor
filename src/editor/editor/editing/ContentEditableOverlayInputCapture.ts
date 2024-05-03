import { Elm } from "../../../japnaaEngine2d/JaPNaAEngine2d";
import { UserInputEvent, LineOperationEvent } from "./UserInputEvents";
import { EditorCursorPositionAbsolute } from "./EditorCursor";
import { InstructionGroupEditor } from "../InstructionGroupEditor";
import { TwoWayMap, findEditableValuesInChangedString, getAncestorWhich, singleDiffWithCursor } from "../../utils";
import { InstructionLine } from "../instruction/instructionTypes";
import { Editable } from "./Editable";
import { AddInstructionAction, EditableEditAction, RemoveInstructionAction, UndoableAction } from "./actions";

/**
 * `ContentEditableOverlayInputCapture` uses a hidden contenteditable
 * element in front of displayed `InstructionGroupEditor`s to capture user's
 * text input.
 * 
 * `BackgroundContentEditableUserInputCapture` is the successor to
 * `ContentEditableInputCapture` and `TextareaUserInputCapture` (which can be
 * found in commit `b4078f7`).
 * 
 * This solution combines methods from the former two classes in attempt to
 * solve issues of both methods. The input capture element is similar to a
 * textarea -- plain text without formatting. However, we capture input by
 * watching for mutations to the contentEditable element.
 * 
 * This should the issues with the previous implementations:
 *   - We do not need to scan the entire textarea value to find
 *     the user's change every keystroke, improving performance.
 *   - We can use regular drag selection by having the user select invisible
 *     text overlayed over InstructionGroupEditors.
 *   - We do not need to 'fix' the user's input unless an invalid action
 *     is performed (ex. paste formatted text)
 */
export class ContentEditableOverlayInputCapture {
    private inputCaptureElmToEditor = new TwoWayMap<InputCaptureElm, InstructionGroupEditor>();
    private inputCaptureElmToHTMLElm = new TwoWayMap<InputCaptureElm, HTMLPreElement>();

    /** Fired when the cursor position changes. Expect posStart < posEnd */
    public positionChangeHandler?: (posStart: EditorCursorPositionAbsolute, posEnd: EditorCursorPositionAbsolute, selectBackwards: boolean) => void;

    /** Fired when an editable is edited */
    public inputHandler?: (userInputEvent: UserInputEvent) => void;

    /** Fired when an editable is edited, and it's new value is applied */
    public afterInputHandler?: (userInputEvent: UserInputEvent) => void;

    /** Fired when a line deletion is requested by the user. Event handlers must setup the input capture again, unless the event is rejected. */
    public lineDeleteHandler?: (lineOp: LineOperationEvent) => void;

    /** Fired on keydown, before changing the textarea. Can preventDefault here. Return 'true' to cancel change check. */
    public keydownIntercepter?: (event: KeyboardEvent) => boolean | undefined;

    /** Fired when an editable in focus */
    public focusHandler?: () => void;
    /** Fired when no editables are in focus */
    public unfocusHandler?: () => void;

    public _lastSelection?: Selection;
    public _currentSelection?: Selection;
    public lastPositionStart?: EditorCursorPositionAbsolute;
    public lastPositionEnd?: EditorCursorPositionAbsolute;

    private freezeSelectionEvents = false;

    constructor() {
        document.addEventListener("selectionchange", ev => {
            if (!ev.isTrusted) { return; }
            if (this.freezeSelectionEvents) { return; }
            const selection = getSelection();
            this._lastSelection = this._currentSelection;
            this._currentSelection = selection || undefined;

            if (!selection || !selection.focusNode || !selection.anchorNode) { return; }
            const positionStart = this.domSelectionToPosition(selection.anchorNode, selection.anchorOffset);
            const positionEnd = this.domSelectionToPosition(selection.focusNode, selection.focusOffset);
            if (!positionStart || !positionEnd) { return; }

            if (
                !this.lastPositionStart || compareAbsoluteCursorPositions(this.lastPositionStart, positionStart) !== 0 ||
                !this.lastPositionEnd || compareAbsoluteCursorPositions(this.lastPositionEnd, positionEnd) !== 0
            ) {
                const diff = compareAbsoluteCursorPositions(positionStart, positionEnd);
                if (diff && diff > 0) {
                    this.positionChangeHandler?.(positionEnd, positionStart, true);
                } else {
                    this.positionChangeHandler?.(positionStart, positionEnd, false);
                }
            }
            this.setPosition(positionStart, positionEnd);
            this.lastPositionStart = positionStart;
            this.lastPositionEnd = positionEnd;
        });
    }

    /** Register an element and watches for edits. */
    public registerGroup(group: InstructionGroupEditor) {
        const inputCapture = this.createInputCapture(group);
        this.inputCaptureElmToEditor.set(inputCapture, group);
        this.inputCaptureElmToHTMLElm.set(inputCapture, inputCapture.getHTMLElement());
        group.elm.append(inputCapture);
    }

    /** Unregister an element and stop watching for edits. */
    public unregisterGroup(group: InstructionGroupEditor) {
        const inputCapture = this.inputCaptureElmToEditor.getK(group);
        this.inputCaptureElmToEditor.deleteV(group);
        if (!inputCapture) { return; }
        this.inputCaptureElmToHTMLElm.deleteK(inputCapture);
        inputCapture.remove();
    }

    public setPosition(positionStart: EditorCursorPositionAbsolute, positionEnd: EditorCursorPositionAbsolute) {
        if (positionStart.group !== positionEnd.group) { throw new Error("Cannot do cross-group selections"); }

        const groupElm = this.inputCaptureElmToEditor.getK(positionStart.group);
        if (!groupElm) { throw new Error("Trying to set position in group that is not registered"); }

        const startLine = positionStart.group.block.getLine(positionStart.line);
        const startEditableOffset = startLine.getCharIndexOfEditable(startLine.getEditableFromIndex(positionStart.editable));
        const startLineHTMLElm = groupElm.lineMap.getK(startLine);
        if (!startLineHTMLElm) { return; }

        const endLine = positionEnd.group.block.getLine(positionEnd.line);
        const endEditableOffset = endLine.getCharIndexOfEditable(endLine.getEditableFromIndex(positionEnd.editable));
        const endLineHTMLElm = groupElm.lineMap.getK(endLine);
        if (!endLineHTMLElm) { return; }

        const selection = getSelection();
        const startRangeNode = startLineHTMLElm.childNodes[0];
        const startRangeOffset = startEditableOffset + positionStart.char;
        const endRangeNode = endLineHTMLElm.childNodes[0];
        const endRangeOffset = endEditableOffset + positionEnd.char;

        if (selection) {
            if (selection.rangeCount === 1) {
                if (
                    selection.anchorNode == startRangeNode &&
                    selection.anchorOffset == startRangeOffset &&
                    selection.focusNode == endRangeNode &&
                    selection.focusOffset == endRangeOffset
                ) {
                    return; // don't need to change
                }
            }

            this.freezeSelectionEvents = true;
            selection.setBaseAndExtent(startRangeNode, startRangeOffset, endRangeNode, endRangeOffset);
            this.freezeSelectionEvents = false;
        }
    }

    public focus() {
        if (this.lastPositionStart) {
            this.inputCaptureElmToEditor.getK(this.lastPositionStart.group)?.getHTMLElement().focus();
        }
    }

    public unfocus() {
        if (this.lastPositionStart) {
            this.inputCaptureElmToEditor.getK(this.lastPositionStart.group)?.getHTMLElement().blur();
        }
    }

    public onAction(action: UndoableAction) {
        let group;

        if (action instanceof EditableEditAction) {
            group = action.editable.parentLine.parentBlock.getGroupEditor();
        } else if (action instanceof AddInstructionAction || action instanceof RemoveInstructionAction) {
            group = action.block.getGroupEditor();
        }

        if (!group) { return; }

        this.inputCaptureElmToEditor.getK(group.editor)?.onAction(action);
    }

    private createInputCapture(group: InstructionGroupEditor) {
        const inputCapture = new InputCaptureElm(this, group);
        inputCapture.on("focus", () => this.focusHandler?.());
        inputCapture.on("blur", () => this.unfocusHandler?.());
        return inputCapture;
    }

    /**
     * Gets the EditorCursorPositionAbsolute from an HTML Anchor node and offset
     * @param anchorNode Selection anchor node
     * @param focusOffset Selection focus offset
     */
    private domSelectionToPosition(anchorNode: Node, focusOffset: number) {
        const parentInstructionLine =
            getAncestorWhich(
                anchorNode,
                node => node instanceof HTMLDivElement && node.classList.contains("instructionLine")
            ) as HTMLDivElement;
        const inputCaptureHTMLElm =
            getAncestorWhich(
                parentInstructionLine,
                node => node instanceof HTMLPreElement && node.classList.contains("inputCapture")
            ) as HTMLPreElement;
        const inputCaptureElm = this.inputCaptureElmToHTMLElm.getK(inputCaptureHTMLElm);
        if (!inputCaptureElm) { return; }
        const instructionLine = inputCaptureElm.lineMap.getV(parentInstructionLine);
        if (!instructionLine) { return; }
        const lineNumber = inputCaptureElm.group.block.locateLine(instructionLine);
        const closestEditableIndex = instructionLine.getClosestEditableIndexToCharIndex(focusOffset);
        const editable = instructionLine.getEditableFromIndex(closestEditableIndex);
        let position: EditorCursorPositionAbsolute;
        if (editable) { // verify editable exists
            const editableCharIndex = instructionLine.getCharIndexOfEditable(editable);
            const editableLength = editable.getValue().length;
            position = {
                group: inputCaptureElm.group,
                line: lineNumber,
                char: focusOffset < editableCharIndex ? 0 : (
                    focusOffset > editableCharIndex + editableLength ? editableLength :
                        focusOffset - editableCharIndex
                ),
                editable: closestEditableIndex
            };
        } else {
            position = {
                group: inputCaptureElm.group,
                line: lineNumber,
                char: 0,
                editable: 0
            };
        }
        return position;
    }
}

/**
 * This is a <pre> (as opposed to <div>) only because CSS assumes all
 * <div>s inside .instructionGroup are instructionLines
 */
class InputCaptureElm extends Elm<"pre"> {
    public lineMap = new TwoWayMap<HTMLDivElement, InstructionLine>();

    private static supportsContentEditablePlaintextOnly = false;
    static {
        const pre = document.createElement('pre');
        pre.setAttribute('contenteditable', 'PLAINTEXT-ONLY');
        this.supportsContentEditablePlaintextOnly = pre.contentEditable === 'plaintext-only';
    }
    private static observerOptions = {
        characterData: true,
        childList: true,
        subtree: true
    };

    private observer: MutationObserver = new MutationObserver(
        mutations => this.mutationHandler(mutations)
    );
    private lines: { str: string, line: InstructionLine, elm: Elm }[] = [];

    private activeEditable?: Editable;
    private activeEditableValue?: string;

    constructor(private parent: ContentEditableOverlayInputCapture, public group: InstructionGroupEditor) {
        super("pre");
        this.class("inputCapture");

        this.resetContext();

        this.attribute("contenteditable",
            InputCaptureElm.supportsContentEditablePlaintextOnly ?
                "plaintext-only" : "true"
        );
        this.observer.observe(this.elm, InputCaptureElm.observerOptions);
        this.on("keydown", ev => this.parent.keydownIntercepter?.(ev));
    }

    public onAction(action: UndoableAction) {
        // ignore edit events caused by us
        if (action instanceof EditableEditAction &&
            action.editable === this.activeEditable &&
            action.newValue == this.activeEditableValue) {
            return;
        }

        this.resetContext();
    }

    private resetContext(): void {
        this.observer.disconnect();

        this.lineMap.clear();
        this.lines.length = 0;
        this.clear();
        for (const line of this.group.block.lineIter()) {
            const strContent = line.elm.getHTMLElement().innerText;
            const elm = new Elm().class("instructionLine").append(strContent).appendTo(this);
            this.lines.push({ str: strContent, line, elm });
            this.lineMap.set(elm.getHTMLElement(), line);
        }

        if (this.group == this.parent.lastPositionStart?.group && this.parent.lastPositionEnd) {
            this.parent.setPosition(
                clampPosition(this.parent.lastPositionStart),
                clampPosition(this.parent.lastPositionEnd)
            );
        }

        this.observer.observe(this.elm, InputCaptureElm.observerOptions);
    }

    public remove(): void {
        this.observer.disconnect();
        super.remove();
    }

    private mutationHandler(mutations: MutationRecord[]) {
        this.observer.disconnect();

        console.log(mutations);

        // Sometimes Chrome inserts multiple records of mutations for one node, which
        // we don't want. This variable checks to make sure characterData mutations
        // are only checked once per mutation.
        const checkedElements = new Set<HTMLDivElement>();

        for (const mutation of mutations) {
            const lineElm = this.parentLineElement(mutation.target);
            if (!lineElm) { continue; }
            if (checkedElements.has(lineElm)) { continue; }
            checkedElements.add(lineElm);
            this.onMutateLineContent(lineElm);
        }

        this.observer.observe(this.elm, InputCaptureElm.observerOptions);
    }

    private onMutateLineContent(line: HTMLDivElement) {
        const newValue = line.innerText;
        const instructionLine = this.lineMap.getV(line);
        if (!instructionLine) { throw new Error("Line not registered"); }
        const lineIndex = this.group.block.locateLine(instructionLine);

        const oldValue = this.lines[lineIndex].str;
        const deltaLength = newValue.length - oldValue.length;
        // note: potential bug: mutation event happens before selectionChange event
        const lastCursor = this.parent._lastSelection?.anchorOffset || 0;
        const newCursor = this.parent._currentSelection?.anchorOffset || 0;

        const areas = instructionLine._getAreas();

        const newEditableValues = findEditableValuesInChangedString(areas, oldValue, lastCursor, newValue, newCursor);
        const editables = instructionLine.getEditables();

        let shouldReset = newEditableValues.changedNonEditable;

        for (let i = 0; i < editables.length; i++) {
            const editable = editables[i];
            const newValue = newEditableValues.values[i];
            const oldValue = editable.getValue();
            if (oldValue === newValue) { continue; }

            const event = new UserInputEvent(newValue, oldValue, newValue); // todo
            editable.checkInput(event);
            this.parent.inputHandler?.(event);
            if (event.isRejected()) {
                shouldReset = true;
            } else {
                // set variables so we can ignore context updates caused by this event
                this.activeEditable = editables[i];
                this.activeEditableValue = newValue;

                editable.setValue(newValue);
                this.lines[lineIndex].str = newValue;
                this.parent.afterInputHandler?.(event);
            }
        }

        if (shouldReset) {
            this.resetContext();
        }
    }

    private parentLineElement(node: Node): HTMLDivElement | null {
        return getAncestorWhich(node, (node) => node instanceof HTMLDivElement && node.classList.contains("instructionLine")) as HTMLDivElement;
    }
}

function clampPosition(position: EditorCursorPositionAbsolute): EditorCursorPositionAbsolute {
    const block = position.group.block;
    if (position.line >= block.numLines) {
        const lastLine = block.getLine(block.numLines - 1);
        return {
            group: position.group,
            line: block.numLines - 1,
            editable: lastLine.getLastEditableIndex(),
            char: lastLine.getLastEditableCharacterIndex()
        };
    } else if (position.line < 0) {
        return {
            group: position.group,
            line: 0,
            editable: 0,
            char: 0
        };
    } else {
        const line = position.group.block.getLine(position.line);
        const editable = line.getEditableFromIndex(position.editable) ||
            line.getEditableFromIndex(line.getLastEditableIndex());
        const maxCharOffset = editable.getValue().length;
        if (position.char > maxCharOffset) { // clamp offset
            return {
                group: position.group,
                line: position.line,
                editable: position.editable,
                char: maxCharOffset
            };
        }
    }

    return position;
}

/**
 * Compares two cursor position.
 * 
 * @returns
 *   - null => different, but not comparable
 *   - -1 => first is smaller
 *   - 0 => same position
 *   - 1 => first is larger
 */
function compareAbsoluteCursorPositions(a: EditorCursorPositionAbsolute, b: EditorCursorPositionAbsolute) {
    if (a.group != b.group) { return null; }
    if (a.line < b.line) { return -1; } else if (a.line > b.line) { return 1; }
    if (a.editable < b.editable) { return -1; } else if (a.editable > b.editable) { return 1; }
    if (a.char < b.char) { return -1; } else if (a.char > b.char) { return 1; }
    return 0;
}
