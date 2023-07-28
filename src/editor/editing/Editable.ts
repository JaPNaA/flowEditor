import { EditorCursor } from "./EditorCursor.js";
import { Elm, EventBus } from "../../japnaaEngine2d/JaPNaAEngine2d.js";
import { UserInputEvent } from "./TextareaUserInputCapture.js";

export class Editable extends Elm<"span"> {
    public onChange = new EventBus<UserInputEvent>();
    /** The type of value autocomplete tries to complete this editable's value with */
    public autoCompleteType?: symbol;
    /**
     * Set to true if just created by a NewInstruction and is undefined. Set
     * to false during construction of instruction to mark as not placeholder.
     * 
     * If true, the first time EditorCursor activates the editable, the entire
     * editable will be selected, and autocomplete should treat the editable as
     * empty.
     */
    public placeholder?: boolean;

    private value: string;

    constructor(initialText: string) {
        super("span");
        this.class("editable");
        this.append(initialText);
        this.value = initialText;
    }

    public getValue(): string {
        return this.value;
    }

    public setValue(value: string) {
        this.value = value;
    }

    /** Called by TextareaUserInput after setting a new value for the editable and moving the cursor. */
    public afterChangeApply() { }

    public checkInput(event: UserInputEvent) {
        this.onChange.send(event);
        if (event.added.includes("\n")) {
            event.reject();
        }
    }

    public getCharacterOffset(selection: Selection) {
        let curr: ChildNode | undefined | null = this.elm.firstChild;
        let count = 0;
        while (curr && curr !== selection.anchorNode) {
            if (curr instanceof Text) {
                count += curr.textContent ? curr.textContent.length : 0;
            }
            curr = curr?.nextSibling;
        }

        count += selection.focusOffset;
        if (count > this.value.length) {
            return this.value.length;
        }
        return count;
    }

    public setActive(offsetStart: number, offsetEnd: number, cursor: EditorCursor) {
        const before = this.value.slice(0, offsetStart);
        const selected = this.value.slice(offsetStart, offsetEnd);
        const after = this.value.slice(offsetEnd);

        cursor.setSelectedText(selected);

        this.replaceContents(before, cursor, after);
    }

    public updateAndDeactivate() {
        this.replaceContents(this.value);
    }
}
