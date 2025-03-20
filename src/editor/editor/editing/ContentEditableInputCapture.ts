import { Elm } from "../../../japnaaEngine2d/JaPNaAEngine2d";
import { UserInputEvent, LineOperationEvent } from "./UserInputEvents";
import { EditorCursorPositionAbsolute } from "./EditorCursor";
import { InstructionGroup } from "../InstructionGroup";
import { TwoWayMap, findEditableValuesInChangedString, getAncestorWhich } from "../../utils";
import { InstructionLine } from "../instruction/instructionTypes";
import { Editable } from "./Editable";
import { AddInstructionAction, EditableEditAction, RemoveInstructionAction } from "./actions/undoableActions";
import { ActionInstance } from "./actions/ActionBus";

/**
 * `ContentEditableInputCapture` user the 'contentEditable' attribute to
 * capture user input.
 * 
 * Version history:
 * 
 * - `ContentEditableInputCapture`
 * - `ContentEditableOverlayUserInputCapture` (`911365e`)
 * - `ContentEditableInputCapture`
 * - `TextareaUserInputCapture` (`b4078f7`)
 */
export class ContentEditableInputCapture {
    private inputCaptureElmToEditor = new TwoWayMap<InputCapture, InstructionGroup>();
    private inputCaptureElmToHTMLElm = new TwoWayMap<InputCapture, HTMLDivElement>();

    /**
     * Fired when the user changes the cursor position. Will not fire if user
     * sets cursor position to the same position (when the user clicks the
     * cursor).
     * 
     * Precondition: posStart < posEnd.
     */
    public positionChangeHandler?: (posStart: EditorCursorPositionAbsolute, posEnd: EditorCursorPositionAbsolute, selectBackwards: boolean) => void;

    /** Fired when an editable is edited */
    public inputHandler?: (userInputEvent: UserInputEvent) => void;

    /** Fired after a editables are edited and the changes are applied */
    public afterInputHandler?: (userInputEvents: UserInputEvent[]) => void;

    /** Fired on keydown, before changing the textarea. Can preventDefault here. Return 'true' to cancel change check. */
    public keydownIntercepter?: (event: KeyboardEvent) => boolean | undefined;

    /** Fired when an editable in focus */
    public focusHandler?: () => void;
    /** Fired when no editables are in focus */
    public unfocusHandler?: () => void;

    public _lastSelectionAnchor?: Node;
    public _lastSelectionOffset?: number;
    public lastPositionStart?: EditorCursorPositionAbsolute;
    public lastPositionEnd?: EditorCursorPositionAbsolute;

    /**
     * The direction the cursor is moving. Forward is when the previous index is
     * smaller than the current. Backwards when previous index is larger than
     * the current.
     * 
     * Used to decide to place the cursor in the left or right editable when the
     * cursor is in a noneditable.
     */
    public cursorMovingBackwards = false;

    /**
     * Ignores mutation and selection events. Set when in the middle of composition.
     * We don't want to do anything when compositing otherwise the composition
     * may be cancelled or duplicated.
     */
    public isCompositing = false;

    /**
     * Ignore document selection change events? Set to prevent infinite recursion
     * when changing the document selection.
     */
    private freezeSelectionEvents = false;

    /**
     * Ignore calls to setPosition. Set during InputCaptureElm's mutation handlers.
     */
    public _freezeSelectionSets = false;

    /**
     * Flag set true when position is updated.
     * 
     * The flag is reset before any editable handlers are called.
     * If any editable handler sets the position, this flag is set.
     * 
     * If the position is never set after handling editable updates,
     * a default position setter runs that keeps the cursor in an
     * expected position.
     */
    public _wasPositionSet = false;

    constructor() {
        document.addEventListener("selectionchange", ev => {
            if (!ev.isTrusted) { return; }
            if (this.freezeSelectionEvents) { return; }
            if (this.isCompositing) { return; }
            const selection = getSelection();

            if (selection && selection.anchorNode) {
                // set this.cursorMovingBackwards
                if (this._lastSelectionAnchor) {
                    const compared = selection.anchorNode.compareDocumentPosition(this._lastSelectionAnchor);
                    if (compared & Node.DOCUMENT_POSITION_FOLLOWING) {
                        this.cursorMovingBackwards = true;
                    } else if (compared & Node.DOCUMENT_POSITION_PRECEDING) {
                        this.cursorMovingBackwards = false;
                    } else if (this._lastSelectionOffset! < selection.anchorOffset) {
                        this.cursorMovingBackwards = false;
                    } else if (this._lastSelectionOffset! > selection.anchorOffset) {
                        this.cursorMovingBackwards = true;
                    }
                }

                this._lastSelectionAnchor = selection.anchorNode;
                this._lastSelectionOffset = selection.anchorOffset;
            }

            if (!selection || !selection.focusNode || !selection.anchorNode) { return; }
            const positionStart = this.domPositionToAbsolute(selection.anchorNode, selection.anchorOffset);
            const positionEnd = this.domPositionToAbsolute(selection.focusNode, selection.focusOffset);
            if (!positionStart || !positionEnd) { return; }

            this.setPosition(positionStart, positionEnd);
        });

        document.addEventListener("compositionstart", () => this.isCompositing = true);
        document.addEventListener("compositionend", () => this.isCompositing = false);
    }

    /** Register an element and watches for edits. */
    public registerGroup(group: InstructionGroup) {
        if (this.inputCaptureElmToEditor.getK(group)) {
            throw new Error("Trying to register a group already registered");
        }

        const inputCapture = this.attachInputCapture(group);
        this.inputCaptureElmToEditor.set(inputCapture, group);
        this.inputCaptureElmToHTMLElm.set(inputCapture, group.editor.elm.getHTMLElement());
    }

    /** Unregister an element and stop watching for edits. */
    public unregisterGroup(group: InstructionGroup) {
        const inputCapture = this.inputCaptureElmToEditor.getK(group);
        this.inputCaptureElmToEditor.deleteV(group);
        if (!inputCapture) { return; }
        this.inputCaptureElmToHTMLElm.deleteK(inputCapture);
        inputCapture.remove();

        if (this.lastPositionStart?.group === group) { this.lastPositionStart = undefined; }
        if (this.lastPositionEnd?.group === group) { this.lastPositionEnd = undefined; }
    }

    public setPosition(positionStart: EditorCursorPositionAbsolute, positionEnd: EditorCursorPositionAbsolute) {
        if (positionStart.group !== positionEnd.group) { throw new Error("Cannot do cross-group selections"); }

        const groupElm = this.inputCaptureElmToEditor.getK(positionStart.group);
        if (!groupElm) { throw new Error("Trying to set position in group that is not registered"); }

        this.firePositionChangeHandlerIfChanged(positionStart, positionEnd);

        this.lastPositionStart = positionStart;
        this.lastPositionEnd = positionEnd;
        this._wasPositionSet = true;

        if (this._freezeSelectionSets) { return; }

        const startLine = positionStart.group.block.getLine(positionStart.line);
        const startEditableOffset = startLine.getCharIndexOfEditable(startLine.getEditableFromIndex(positionStart.editable));
        const startLineHTMLElm = groupElm.lineMap.getK(startLine);
        if (!startLineHTMLElm) { return; }

        const endLine = positionEnd.group.block.getLine(positionEnd.line);
        const endEditableOffset = endLine.getCharIndexOfEditable(endLine.getEditableFromIndex(positionEnd.editable));
        const endLineHTMLElm = groupElm.lineMap.getK(endLine);
        if (!endLineHTMLElm) { return; }

        const selection = getSelection();
        const startPos = startLine.getEditableAndOffsetFromCharIndex(startEditableOffset + positionStart.char);
        const endPos = endLine.getEditableAndOffsetFromCharIndex(endEditableOffset + positionEnd.char);
        if (!startPos || !endPos) { return; }

        const startNode = startPos.editable.getHTMLElement().childNodes[0] || startPos.editable.getHTMLElement();
        const endNode = endPos.editable.getHTMLElement().childNodes[0] || endPos.editable.getHTMLElement();

        if (selection) {
            if (selection.rangeCount === 1) {
                if (
                    selection.anchorNode == startNode &&
                    selection.anchorOffset == startPos.offset &&
                    selection.focusNode == endNode &&
                    selection.focusOffset == endPos.offset
                ) {
                    return; // don't need to change
                }
            }

            this.freezeSelectionEvents = true;
            selection.setBaseAndExtent(startNode, startPos.offset, endNode, endPos.offset);
            this.freezeSelectionEvents = false;
        }
    }

    public focus() {
        if (this.lastPositionStart) {
            this.inputCaptureElmToEditor.getK(this.lastPositionStart.group)?.focus();
        }
    }

    public unfocus() {
        if (this.lastPositionStart) {
            this.inputCaptureElmToEditor.getK(this.lastPositionStart.group)?.blur();
        }
    }

    public onAction(action: ActionInstance) {
        let group;

        if (action instanceof EditableEditAction) {
            group = action.editable.parentLine.parentBlock.getGroup();
        } else if (action instanceof AddInstructionAction || action instanceof RemoveInstructionAction) {
            group = action.block.getGroup();
        }

        if (!group) { return; }

        this.inputCaptureElmToEditor.getK(group.group)?.onAction(action);
    }

    private attachInputCapture(group: InstructionGroup) {
        const inputCapture = new InputCapture(this, group);
        inputCapture.setFocusHandler(() => this.focusHandler?.());
        inputCapture.setBlurHandler(() => this.unfocusHandler?.());
        return inputCapture;
    }

    /**
     * Converts a DOM position to a position absolute.
     * 
     * Calls {@link domPositionToFloating} then {@link floatingPositionToAbsolute}.
     */
    private domPositionToAbsolute(anchorNode: Node, offset: number) {
        const floating = this.domPositionToFloating(anchorNode, offset);
        if (!floating) { return; }
        return this.floatingPositionToAbsolute(floating);
    }

    /**
     * Gets a floating position from an anchor node and offset.
     * 
     * A floating position consists of a group, line, and a line offset.
     * 
     * Unlike a {@link EditorCursorPositionAbsolute}, this position is not
     * tied to an editable, so can be positioned in non-editables.
     */
    // todo: should be private
    public domPositionToFloating(anchorNode: Node, offset: number): FloatingPosition | undefined {
        const parentInstructionLine =
            getAncestorWhich(
                anchorNode,
                node => node instanceof HTMLDivElement && node.classList.contains("instructionLine")
            ) as HTMLDivElement;
        const inputCaptureHTMLElm =
            getAncestorWhich(
                parentInstructionLine,
                node => node instanceof HTMLDivElement && node.classList.contains("instructionGroup")
            ) as HTMLDivElement;
        const inputCaptureElm = this.inputCaptureElmToHTMLElm.getK(inputCaptureHTMLElm);
        if (!inputCaptureElm) { return; }
        const instructionLine = inputCaptureElm.lineMap.getV(parentInstructionLine);
        if (!instructionLine) { return; }
        const offsetFromLine = offset + instructionLine.getNodeCharIndex(anchorNode);
        const lineNumber = inputCaptureElm.group.block.locateLine(instructionLine);

        return {
            group: inputCaptureElm.group,
            lineNumber,
            instructionLine,
            offsetFromLine,
        };
    }

    /**
     * Gets the EditorCursorPositionAbsolute from a floating selection
     */
    // todo: should be private
    public floatingPositionToAbsolute(floating: FloatingPosition) {
        const closestEditableIndex = floating.instructionLine.getClosestEditableIndexToCharIndex(
            floating.offsetFromLine, this.cursorMovingBackwards
        );
        const editable = floating.instructionLine.getEditableFromIndex(closestEditableIndex);

        let position: EditorCursorPositionAbsolute;
        if (editable) { // verify editable exists
            const editableCharIndex = floating.instructionLine.getCharIndexOfEditable(editable);
            const editableLength = editable.getValue().length;
            position = {
                group: floating.group,
                line: floating.lineNumber,
                char: floating.offsetFromLine < editableCharIndex ? 0 : (
                    floating.offsetFromLine > editableCharIndex + editableLength ? editableLength :
                        floating.offsetFromLine - editableCharIndex
                ),
                editable: closestEditableIndex
            };
        } else {
            position = {
                group: floating.group,
                line: floating.lineNumber,
                char: 0,
                editable: 0
            };
        }
        return position;
    }

    private firePositionChangeHandlerIfChanged(positionStart: EditorCursorPositionAbsolute, positionEnd: EditorCursorPositionAbsolute) {
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
    }
}

/**
 * Class attaches to an InstructionGroupEditor, sets the contenteditable
 * attribute and handles mutations to the InstructionGroupEditor.
 */
class InputCapture {
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
    private lines: { str: string, line: InstructionLine }[] = [];

    private elm: Elm;
    private focusHandler?: (ev: Event) => void;
    private blurHandler?: (ev: Event) => void;

    private activeEditable?: Editable;
    private activeEditableValue?: string;
    /**
     * Should prevent external actions from having an effect on the element?
     * Set true when running mutation handler.
     */
    private freezeExternalActions: boolean = false;
    /**
     * Should reset after a mutation handler finishes execution?
     */
    private shouldReset: boolean = false;

    constructor(private parent: ContentEditableInputCapture, public group: InstructionGroup) {
        this.elm = group.editor.elm;

        this.resetContext();

        this.elm.attribute("contenteditable",
            InputCapture.supportsContentEditablePlaintextOnly ?
                "plaintext-only" : "true");
        this.observer.observe(this.elm.getHTMLElement(), InputCapture.observerOptions);
        this.keydownHandler = this.keydownHandler.bind(this);
        this.elm.getHTMLElement().addEventListener("keydown", this.keydownHandler);
    }

    public focus() {
        this.elm.getHTMLElement().focus();
    }

    public blur() {
        this.elm.getHTMLElement().blur();
    }

    public setFocusHandler(handler: (ev: Event) => void) {
        if (this.focusHandler) { throw new Error("Setting focus handler twice"); }
        this.focusHandler = handler;
        this.elm.getHTMLElement().addEventListener("focus", this.focusHandler);
    }

    public setBlurHandler(handler: (ev: Event) => void) {
        if (this.blurHandler) { throw new Error("Setting blur handler twice"); }
        this.blurHandler = handler;
        this.elm.getHTMLElement().addEventListener("blur", this.blurHandler);
    }

    public onAction(action: ActionInstance) {
        // ignore edit events caused by us
        if (action instanceof EditableEditAction &&
            action.editable === this.activeEditable &&
            action.newValue == this.activeEditableValue) {
            return;
        }

        if (this.freezeExternalActions) {
            this.shouldReset = true;
        } else {
            this.resetContext();
        }
    }

    public remove(): void {
        this.observer.disconnect();
        this.elm.removeAttribute("contenteditable");
        this.elm.getHTMLElement().removeEventListener("keydown", this.keydownHandler);
        if (this.focusHandler) {
            this.elm.getHTMLElement().removeEventListener("focus", this.focusHandler);
        }
        if (this.blurHandler) {
            this.elm.getHTMLElement().removeEventListener("blur", this.blurHandler);
        }
    }

    private resetContext(): void {
        this.observer.disconnect();

        this.shouldReset = false;

        this.lineMap.clear();
        this.lines.length = 0;
        this.elm.clear();
        for (const line of this.group.block.lineIter()) {
            const strContent = areasToString(line.getAreas());
            line.reset();
            line.resetEditables();
            this.elm.append(line);
            this.lines.push({ str: strContent, line });
            this.lineMap.set(line.elm.getHTMLElement(), line);
        }

        if (this.group == this.parent.lastPositionStart?.group && this.parent.lastPositionEnd) {
            const startPos = clampPosition(this.parent.lastPositionStart);
            const endPos = clampPosition(this.parent.lastPositionEnd);
            if (startPos && endPos) {
                this.parent.setPosition(startPos, endPos);
            }
        }

        this.observer.observe(this.elm.getHTMLElement(), InputCapture.observerOptions);
    }

    private keydownHandler(ev: KeyboardEvent) {
        const shouldCancelHandle = this.parent.keydownIntercepter?.(ev);
        if (shouldCancelHandle) { return; }

        const lastPosition = this.parent.lastPositionStart;
        if (!lastPosition) { return; }

        const instructionLine = lastPosition.group.block.getLine(lastPosition.line);

        if (ev.key === "Backspace") {
            // delete at first possible position
            if (lastPosition.editable === 0 && lastPosition.char === 0) {
                // deletion
                const lineOpEvent = new LineOperationEvent(instructionLine, false, false);
                lastPosition.group.editor.onLineDelete(lineOpEvent);
                ev.preventDefault();
            }
        }
    }

    private mutationHandler(mutations: MutationRecord[]) {
        if (this.parent.isCompositing) { return; } // frozen when in the middle of IME input

        this.observer.disconnect();
        this.freezeExternalActions = true;
        this.parent._freezeSelectionSets = true;
        this.parent._wasPositionSet = false;

        const selection = getSelection();
        let floatingPosition: FloatingPosition | undefined;
        if (selection && selection.anchorNode) {
            floatingPosition = this.parent.domPositionToFloating(selection.anchorNode, selection.anchorOffset);
        }


        // Sometimes Chrome inserts multiple records of mutations for one node, which
        // we don't want. This variable checks to make sure each line is only
        // checked once per mutation.
        const checkedElements = new Set<HTMLDivElement>();

        for (const mutation of mutations) {
            if (mutation.type === "childList" && mutation.addedNodes.length === 0) {
                for (const removedNode of mutation.removedNodes) {
                    // case: complete line removal
                    const instructionLine = this.lineMap.getV(removedNode as HTMLDivElement);
                    if (instructionLine) {
                        const lineOpEvent = new LineOperationEvent(instructionLine, false, false);
                        instructionLine.parentBlock.getGroup()?.group.editor.onLineDelete(lineOpEvent);
                        if (lineOpEvent.isRejected()) {
                            this.shouldReset = true;
                        }
                    }
                }
            }

            // editable change
            const lineElm = this.findParentLineElement(mutation.target);
            if (!lineElm) { continue; }
            if (checkedElements.has(lineElm)) { continue; }
            checkedElements.add(lineElm);
            this.onMutateLineContent(lineElm, floatingPosition);
        }

        this.freezeExternalActions = false;
        this.parent._freezeSelectionSets = false;

        if (floatingPosition && !this.parent._wasPositionSet) {
            const position = this.parent.floatingPositionToAbsolute(floatingPosition);
            this.parent.setPosition(position, position);
        }

        if (this.shouldReset) {
            this.resetContext(); // resetContext will add observer again
        } else {
            this.observer.observe(this.elm.getHTMLElement(), InputCapture.observerOptions);
        }
    }

    private onMutateLineContent(line: HTMLDivElement, floatingPosition?: FloatingPosition) {
        const innerText = line.innerText;
        // Chrome inserts <br> in place of empty lines, which causes empty
        // lines to have innerText = '\n'. We detect this to correctly detect
        // empty lines.
        // Potential bug: the first '\n' may not be the '\n' caused by
        // the <br>, which could cause bugs related to newlines.
        const newValue = line.children[0]?.tagName === 'BR' ? innerText.replace('\n', "") : innerText;

        const instructionLine = this.lineMap.getV(line);
        if (!instructionLine) { throw new Error("Line not registered"); }

        const lineIndex = this.group.block.locateLine(instructionLine);
        const oldValue = this.lines[lineIndex].str;
        const lastLineOffset = this.parent._lastSelectionOffset || 0;

        // if (lastCursor !== newCursor) {
        //     this.parent.cursorMovingBackwards = newCursor < lastCursor;
        // }

        const areas = instructionLine.getAreas();

        // fix non-editables
        let noneditableNodeModified = false;
        const currentChildNodes = line.childNodes;
        if (currentChildNodes.length === areas.length) {
            for (let i = 0; i < areas.length; i++) {
                if (typeof areas[i] === "string") {
                    if (currentChildNodes[i].nodeValue !== areas[i]) {
                        noneditableNodeModified = true;
                    }
                } else {
                    if (!(currentChildNodes[i] instanceof HTMLSpanElement)) {
                        noneditableNodeModified = true;
                    }
                }
            }
        } else {
            // different number of nodes than expected
            noneditableNodeModified = true;
        }

        const cursorLineOffset = floatingPosition?.instructionLine === instructionLine ? floatingPosition.offsetFromLine : 0;
        const newEditableValues = findEditableValuesInChangedString(areas, oldValue, lastLineOffset, newValue, cursorLineOffset);
        const editables = instructionLine.getEditables();

        if (newEditableValues.changedNonEditable) {
            this.shouldReset = true;
        }

        if (noneditableNodeModified) {
            this.shouldReset = true;
            instructionLine.reset();
        }

        const changedEditables: Editable[] = [];
        const changeEvents: UserInputEvent[] = [];
        for (let i = 0; i < editables.length; i++) {
            const editable = editables[i];
            const newValue = newEditableValues.values[i];
            const oldValue = editable.getValue();
            if (oldValue === newValue) { continue; }

            const event = new UserInputEvent(editable, oldValue, newValue);
            editable.checkInput(event);
            this.parent.inputHandler?.(event);
            if (event.isRejected()) {
                this.shouldReset = true;
            } else {
                // set variables so we can ignore context updates caused by this event
                this.activeEditable = editables[i];
                this.activeEditableValue = newValue;

                editable.setValue(newValue);
                this.lines[lineIndex].str = areasToString(areas);
                changedEditables.push(editable);
            }
            changeEvents.push(event);
        }

        for (const editable of changedEditables) {
            editable.afterChangeApply();
        }

        this.parent.afterInputHandler?.(changeEvents);
    }

    private findParentLineElement(node: Node): HTMLDivElement | null {
        return getAncestorWhich(node, (node) => node instanceof HTMLDivElement && node.classList.contains("instructionLine")) as HTMLDivElement;
    }
}

function clampPosition(position: EditorCursorPositionAbsolute): EditorCursorPositionAbsolute | undefined {
    const block = position.group.block;
    if (block.numLines <= 0) {
        return;
    }

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

function areasToString(areas: (Editable | string)[]): string {
    return areas.map(x => typeof x === "string" ? x : x.getValue()).join("");
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

interface FloatingPosition {
    group: InstructionGroup;
    lineNumber: number;
    instructionLine: InstructionLine;
    offsetFromLine: number;
}