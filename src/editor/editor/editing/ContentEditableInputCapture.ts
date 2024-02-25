import { InstructionGroupEditor } from "../InstructionGroupEditor";
import { DOMSelection } from "./DOMSelection";
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

    private static observerOptions = {
        characterData: true,
        subtree: true
    };
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

        group.elm.attribute("contenteditable", "plaintext-only");
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
        console.log(mutations);
        observer.disconnect();

        for (const mutation of mutations) {
            const position = group.selectionToPosition(
                new DOMSelection(mutation.target, 0)
            );
            if (!position) { continue; }
            const line = group.block.getLine(position.line);
            if (!line) { continue; }
            const editable = line.getEditableFromIndex(position.editable);
            if (!editable) { continue; }
            editable.setValue(mutation.target.nodeValue || "");

            // mutation.target
        }

        observer.observe(group.elm.getHTMLElement(), ContentEditableInputCapture.observerOptions);
    }
}

