import { Elm, EventBus } from "../../japnaaEngine2d/JaPNaAEngine2d.js";
import { UserInputEvent } from "./TextareaUserInputCapture.js";
import { InstructionLine } from "../instruction/instructionTypes.js";
import { EditableEditAction } from "./actions.js";

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

    /** DO NOT MUTATE OUTSIDE OF `UndoableAction` */
    public _value: string;

    constructor(initialText: string, public parentLine: InstructionLine) {
        super("span");
        this.class("editable");
        this.append(initialText);
        this._value = initialText;
    }

    public getValue(): string {
        return this._value;
    }

    public setValue(value: string) {
        this.parentLine.parentInstruction.parentGroup.parentEditor.undoLog.perform(
            new EditableEditAction(this, value)
        );
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
        if (count > this._value.length) {
            return this._value.length;
        }
        return count;
    }

    public update() {
        const cursor = this.parentLine.parentInstruction.parentGroup.parentEditor.cursor;
        if (
            cursor.activeEditable === this
        ) {
            const { start, end } = cursor.getPositions();
            const before = this._value.slice(0, start!.char);
            const selected = this._value.slice(start!.char, end!.char);
            const after = this._value.slice(end!.char);

            cursor.setSelectedText(selected);

            this.replaceContents(before, cursor, after);
        } else {
            this.replaceContents(this._value);
        }
    }
}
