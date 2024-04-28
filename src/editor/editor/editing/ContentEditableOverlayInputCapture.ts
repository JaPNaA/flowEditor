import { Elm } from "../../../japnaaEngine2d/JaPNaAEngine2d";
import { UserInputEvent, LineOperationEvent } from "./UserInputEvents";
import { EditorCursorPositionAbsolute } from "./EditorCursor";
import { InstructionGroupEditor } from "../InstructionGroupEditor";
import { TwoWayMap, getAncestorWhich, singleDiffWithCursor } from "../../utils";
import { InstructionLine } from "../instruction/instructionTypes";

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
    private inputCaptureGroup = new TwoWayMap<InputCaptureElm, InstructionGroupEditor>();

    /** Fired when the cursor position changes */
    public positionChangeHandler?: (posStart: EditorCursorPositionAbsolute, posEnd: EditorCursorPositionAbsolute, selectBackwards: boolean) => void;

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

    public _lastSelection?: Selection;
    public _currentSelection?: Selection;

    constructor() {
        document.addEventListener("selectionchange", ev => {
            if (!ev.isTrusted) { return; }
            const selection = getSelection();
            this._lastSelection = this._currentSelection;
            this._currentSelection = selection || undefined;
        });
    }

    /** Register an element and watches for edits. */
    public registerGroup(group: InstructionGroupEditor) {
        const inputCapture = this.createInputCapture(group);
        this.inputCaptureGroup.set(inputCapture, group);
        group.elm.append(inputCapture);
    }

    /** Unregister an element and stop watching for edits. */
    public unregisterGroup(group: InstructionGroupEditor) {
        const inputCapture = this.inputCaptureGroup.getK(group);
        this.inputCaptureGroup.deleteV(group);
        if (!inputCapture) { return; }
        inputCapture.remove();
    }

    public setPosition(positionStart: EditorCursorPositionAbsolute, positionEnd: EditorCursorPositionAbsolute) {
        if (positionStart.group !== positionEnd.group) { throw new Error("Cannot do cross-group selections"); }

        const groupElm = this.inputCaptureGroup.getK(positionStart.group);
        if (!groupElm) { throw new Error("Trying to set position in group that is not registered"); }

        const startLine = positionStart.group.block.getLine(positionStart.line);
        const startLineHTMLElm = groupElm.lineMap.getK(startLine);
        if (!startLineHTMLElm) { return; }

        const endLine = positionEnd.group.block.getLine(positionEnd.line);
        const endLineHTMLElm = groupElm.lineMap.getK(endLine);
        if (!endLineHTMLElm) { return; }

        const selection = getSelection();
        const range = document.createRange();
        range.setStart(startLineHTMLElm.childNodes[0], positionStart.char);
        if (endLine) {
            range.setEnd(endLineHTMLElm.childNodes[0], positionEnd.char);
        } else {
            range.collapse(true);
        }

        if (selection) {
            if (selection.rangeCount === 1) {
                const currRange = selection.getRangeAt(0);
                if (
                    currRange.startContainer == range.startContainer &&
                    currRange.startOffset == range.startOffset &&
                    currRange.endContainer == range.endContainer &&
                    currRange.endOffset == range.endOffset
                ) {
                    return; // don't need to change
                }
            }

            selection.removeAllRanges();
            selection.addRange(range);
        }

        setTimeout(() => groupElm.getHTMLElement().focus(), 1);
    }

    private createInputCapture(group: InstructionGroupEditor) {
        const inputCapture = new InputCaptureElm(this, group);
        inputCapture.on("focus", () => this.focusHandler?.());
        inputCapture.on("blur", () => this.unfocusHandler?.());
        return inputCapture;
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
        characterDataOldValue: true,
        childList: true,
        subtree: true
    };

    private observer: MutationObserver = new MutationObserver(
        mutations => this.mutationHandler(mutations)
    );
    private lastSelectionPosition = 0;

    constructor(private parent: ContentEditableOverlayInputCapture, private group: InstructionGroupEditor) {
        super("pre");
        this.class("inputCapture");

        for (const line of group.block.lineIter()) {
            const elm = new Elm().class("instructionLine").append(line.elm.getHTMLElement().innerText).appendTo(this);
            this.lineMap.set(elm.getHTMLElement(), line);
        }

        this.attribute("contenteditable",
            InputCaptureElm.supportsContentEditablePlaintextOnly ?
                "plaintext-only" : "true"
        );
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
        const characterDataNodesChecked = new Set();
        // Sometimes Chrome duplicates mutation records when inserting newlines.
        // We will workaround this so one DOM Node can trigger one newline insertion.
        const nodesWithInsertedNewLinesSet = new Set();

        for (const mutation of mutations) {
            const lineElm = this.parentLineElement(mutation.target);

            if (mutation.type === "characterData") {
                if (characterDataNodesChecked.has(mutation.target)) { continue; }
                characterDataNodesChecked.add(mutation.target);

                if (!lineElm) { continue; }
                let newValue = mutation.target.nodeValue || "";
                const oldValue = mutation.oldValue || "";
                const deltaLength = newValue.length - oldValue.length;
                const diff = singleDiffWithCursor( // note: potential bug: mutation event happens before selectionChange event
                    oldValue, this.parent._lastSelection?.anchorOffset || 0,
                    newValue, this.parent._currentSelection?.anchorOffset || 0);
                if (!diff) { continue; }

                const line = this.lineMap.getV(lineElm);
                if (!line) { continue; }

                const editable = line.getEditableFromCharIndex(diff.index);
                if (editable) {
                    let index = line.getCharIndexOfEditable(editable);
                    editable.setValue(newValue.slice(index, index + editable.getValue().length + deltaLength));
                }

            } else if (mutation.type === "childList") {
                if (!lineElm) { continue; }
                const line = this.lineMap.getV(lineElm);
                if (line) {
                    const editable = null; // line.getEditableFromNode(mutation.target);
                    if (mutation.addedNodes.length > 0 && mutation.removedNodes.length === 0) {
                        if (
                            mutation.addedNodes[0].nodeValue?.includes("\n") &&
                            !nodesWithInsertedNewLinesSet.has(line)
                        ) {
                            nodesWithInsertedNewLinesSet.add(line);
                            // likely an attempt to insert a line
                            if (editable) {
                                // editable.update();
                            } else {
                                // line.resetElm();
                            }
                            this.parent.lineDeleteHandler?.(new LineOperationEvent(line, true, true));
                        } else if (editable) {
                            console.log("set");
                            // editable.setValue(editable.getHTMLElement().innerText);
                        }
                    } else {
                        // line.resetElm();
                    }
                } else {
                    if (mutation.addedNodes.length !== 0) {
                        // insert nodes (ex. by undo/paste) not supported (yet)
                        // this.group.resetElm();
                        continue;
                    }
                    if (this.parent.lineDeleteHandler) {
                        const deleteList: InstructionLine[] = [];
                        for (const node of mutation.removedNodes) {
                            const lineElm = this.parentLineElement(node);
                            if (!lineElm) { continue; }
                            const line = this.lineMap.getV(lineElm);
                            if (!line) { continue; } // not supported
                            deleteList.push(line);
                        }
                        for (const line of deleteList) {
                            this.parent.lineDeleteHandler(new LineOperationEvent(line, false, false));
                        }
                    }
                }
            }
        }

        this.observer.observe(this.elm, InputCaptureElm.observerOptions);
    }

    private parentLineElement(node: Node): HTMLDivElement | null {
        return getAncestorWhich(node, (node) => node instanceof HTMLDivElement && node.classList.contains("instructionLine")) as HTMLDivElement;
    }

}
