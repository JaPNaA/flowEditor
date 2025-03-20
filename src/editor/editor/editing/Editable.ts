import { Elm, EventBus } from "../../../japnaaEngine2d/JaPNaAEngine2d";
import { UserInputEvent } from "./UserInputEvents";
import { InstructionLine } from "../instruction/instructionTypes";
import { EditableEditAction } from "./actions/undoableActions";

export class Editable extends Elm<"span"> {
    public onChange = new EventBus<string>();
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
    public isPlaceholder?: boolean;

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
        if (this._value === value) { return; }
        const groupBlock = this.parentLine.parentBlock.getGroup();
        if (!groupBlock) { return; }
        const group = groupBlock.group;
        this.onChange.send(value);
        group.parentEditor.undoLog.perform(
            new EditableEditAction(this, value, this._value)
        );
    }

    /** Called by ContentEditableOverlayInputCapture after setting a new value for the editable and moving the cursor. */
    public afterChangeApply() { }

    /** Called by ContentEditableOverlayInputCapture to verify validity of input */
    public checkInput(event: UserInputEvent) {
        if (event.newContent.includes("\n")) {
            event.reject();
        }
    }

    public update() {
        if (this.elm.textContent !== this._value) {
            this.replaceContents(this._value);
        }
    }
}
