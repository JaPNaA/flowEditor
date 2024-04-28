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

    private lineMap = new WeakMap<HTMLDivElement, InstructionLine>();
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

        // Sometimes chrome inserts multiple records of mutations for one node, which
        // we don't want. This variable checks to make sure characterData mutations
        // are only checked once per mutation.
        const characterDataNodesChecked = new Set();

        for (const mutation of mutations) {
            if (mutation.type === "characterData") {
                if (characterDataNodesChecked.has(mutation.target)) { continue; }
                characterDataNodesChecked.add(mutation.target);

                const lineElm = getAncestorWhich(mutation.target, (node) => node instanceof HTMLDivElement && node.classList.contains("instructionLine")) as HTMLDivElement;
                if (!lineElm) { continue; }
                let newValue = mutation.target.nodeValue || "";
                const oldValue = mutation.oldValue || "";
                const deltaLength = newValue.length - oldValue.length;
                const diff = singleDiffWithCursor( // note: potential bug: mutation event happens before selectionChange event
                    oldValue, this.parent._lastSelection?.anchorOffset || 0,
                    newValue, this.parent._currentSelection?.anchorOffset || 0);
                if (!diff) { continue; }

                const line = this.lineMap.get(lineElm);
                if (!line) { continue; }

                const editable = line.getEditableFromCharIndex(diff.index);
                if (editable) {
                    let index = line.getCharIndexOfEditable(editable);
                    editable.setValue(newValue.slice(index, index + editable.getValue().length + deltaLength));
                }

            } else if (mutation.type === "childList") {
            }
        }

        this.observer.observe(this.elm, InputCaptureElm.observerOptions);
    }

}
