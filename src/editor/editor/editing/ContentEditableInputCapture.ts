import { InstructionGroupEditor } from "../InstructionGroupEditor";
import { InstructionLine } from "../instruction/instructionTypes";
import { EditorCursorPositionAbsolute } from "./EditorCursor";
import { UserInputEvent, LineOperationEvent } from "./UserInputEvents";

export class ContentEditableInputCapture {
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

    private static observerOptions: MutationObserverInit = {
        characterData: true,
        characterDataOldValue: true,
        childList: true,
        subtree: true
    };
    private static supportsContentEditablePlaintextOnly = false;
    static {
        const div = document.createElement('div');
        div.setAttribute('contenteditable', 'PLAINTEXT-ONLY');
        this.supportsContentEditablePlaintextOnly = div.contentEditable === 'plaintext-only';
    }

    private observerToGroup: Map<MutationObserver, InstructionGroupEditor> = new Map();
    private groupToObserver: Map<InstructionGroupEditor, MutationObserver> = new Map();

    /** Register an element and watches for edits. */
    public registerGroup(group: InstructionGroupEditor) {
        const observer: MutationObserver = new MutationObserver(
            mutations => this.mutationHandler(group, observer, mutations)
        );
        observer.observe(group.elm.getHTMLElement(), ContentEditableInputCapture.observerOptions);
        this.observerToGroup.set(observer, group);
        this.groupToObserver.set(group, observer);

        if (ContentEditableInputCapture.supportsContentEditablePlaintextOnly) {
            group.elm.attribute("contenteditable", "plaintext-only");
        } else {
            group.elm.attribute("contenteditable", "true");
        }
    }

    /** Register an element and watches for edits. */
    public unregisterGroup(group: InstructionGroupEditor) {
        const observer = this.groupToObserver.get(group);
        if (!observer) { throw new Error("Tried to unregister group not registered"); }
        observer.disconnect();
        this.observerToGroup.delete(observer);
        this.groupToObserver.delete(group);

        group.elm.attribute("contenteditable", "false");
    }

    private mutationHandler(group: InstructionGroupEditor, observer: MutationObserver, mutations: MutationRecord[]) {
        observer.disconnect();

        for (const mutation of mutations) {
            if (mutation.type === "characterData") {
                const position = group.nodeToPosition(mutation.target);
                if (!position) { mutation.target.nodeValue = mutation.oldValue; continue; } // revert
                const line = group.block.getLine(position.line);
                if (!line) { mutation.target.nodeValue = mutation.oldValue; continue; } // revert
                const editable = line.getEditableFromIndex(position.editable);
                if (!editable) { line.resetElm(); continue; } // revert
                editable.setValue(mutation.target.nodeValue || "");
            } else if (mutation.type === "childList") {
                const line = group.nodeToLine(mutation.target);
                if (line) {
                    line.resetElm();
                } else {
                    if (mutation.addedNodes.length !== 0) {
                        // insert nodes (ex. by undo/paste) not supported (yet)
                        group.resetElm();
                        continue;
                    }
                    const deleteList: InstructionLine[] = [];
                    for (const node of mutation.removedNodes) {
                        const line = group.nodeToLine(node);
                        if (!line) { continue; } // not supported
                        deleteList.push(line);
                    }
                    for (const line of deleteList) {
                        line.parentBlock.parentInstruction()?.removeLine(line);
                    }
                }
            }
        }

        observer.observe(group.elm.getHTMLElement(), ContentEditableInputCapture.observerOptions);
    }
}

