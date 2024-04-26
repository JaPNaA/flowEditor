import { Editable } from "./Editable";
import { Elm } from "../../../japnaaEngine2d/JaPNaAEngine2d";
import { UserInputEvent, LineOperationEvent } from "./UserInputEvents";
import { EditorCursorPositionAbsolute } from "./EditorCursor";
import { InstructionGroupEditor } from "../InstructionGroupEditor";
import { TwoWayMap } from "../../utils";

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
            console.log(selection);
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

    private observer: MutationObserver = new MutationObserver(
        mutations => this.mutationHandler(mutations)
    );
    private lastSelectionPosition = 0;

    constructor(private parent: ContentEditableOverlayInputCapture, private group: InstructionGroupEditor) {
        super("pre");
        this.class("inputCapture");

        for (const line of group.block.lineIter()) {
            this.append(new Elm().class("instructionLine").append(line.elm.getHTMLElement().innerText));
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

        // When user presses '\n', Chrome may insert two '\n' elements. As a workaround to
        // prevent detection of two newline insertions, each line can only trigger one new
        // line insertion.
        const nodesWithInsertedNewLinesSet = new Set();

        for (const mutation of mutations) {
            if (mutation.type === "characterData") {
                let position = this.group.nodeToPosition(mutation.target);
                let wasPositionFixed = false;
                let diff: { added: string, removed: string } | null = null;
                let newValue = mutation.target.nodeValue || "";

                console.log(this.getChanges(
                    mutation.oldValue || "", this.parent._lastSelection?.anchorOffset || 0,
                    newValue, this.parent._currentSelection?.anchorOffset || 0));
            } else if (mutation.type === "childList") {
            }
        }

        this.observer.observe(this.elm, InputCaptureElm.observerOptions);
    }

    /**
     * Identify the change the user made based on difference in strings and cursor position.
     * @param lastValue original string before modification
     * @param lastCursor last cursor position
     * @param currentValue new string after modification
     * @param currentCursor new cursor position
     * @returns An object describing the change that occurred
     */
    private getChanges(lastValue: string, lastCursor: number, currentValue: string, currentCursor: number) {
        const currentValueLen = currentValue.length;
        const lastValueLen = lastValue.length;

        const maxStartMatch = Math.min(lastCursor, currentCursor);
        const maxEndMatch = Math.min(
            lastValueLen - lastCursor,
            currentValueLen - currentCursor
        );

        let i: number;
        for (i = 0; i < maxStartMatch; i++) {
            if (currentValue[i] !== lastValue[i]) {
                break;
            }
        }

        let j: number;
        for (j = 1; j < maxEndMatch; j++) {
            if (currentValue[currentValueLen - j] !== lastValue[lastValueLen - j]) {
                break;
            }
        }

        return {
            index: i,
            added: currentValue.slice(i, currentValueLen - j),
            removed: lastValue.slice(i, lastValueLen - j)
        };
    }
}
