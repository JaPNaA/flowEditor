import { Elm, EventBus } from "../../../japnaaEngine2d/JaPNaAEngine2d";
import { InstructionLine } from "../instruction/instructionTypes";
import { UndoableAction } from "./actions/UndoableAction";
import { ActionBusDispatchable } from "./actions/ActionBus";

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

    public actionBus = new ActionBusDispatchable();

    private value: string;

    constructor(initialText: string, public parentLine: InstructionLine) {
        super("span");
        this.class("editable");
        this.append(initialText);
        this.value = initialText;

        this.actionBus.subscribe(EditableEditAction, (action, controls) => {
            if (!this.checkInput(action)) {
                controls.rejected = true;
                return;
            }

            const autocomplete = action.editable.parentLine.parentBlock.getGroup()?.group.parentEditor.cursor.autocomplete;

            if (autocomplete) { autocomplete.removedValue(action.editable); }
            action.previousValue = action.editable.value;
            action.editable.value = action.newValue;
            action.editable.isPlaceholder = false;
            if (autocomplete) { autocomplete.enteredValue(action.editable); }

            action.editable.update();
            controls.accepted = true;
        });
    }

    public getValue(): string {
        return this.value;
    }

    public setValue(value: string) {
        if (this.value === value) { return; }
        const groupBlock = this.parentLine.parentBlock.getGroup();
        if (!groupBlock) { return; }
        const group = groupBlock.group;
        this.onChange.send(value);

        const action = new EditableEditAction(this, value, this.value);
        return {
            action,
            result: group.parentEditor.undoLog.perform(
                new EditableEditAction(this, value, this.value)
            )
        };
    }

    /** Called by ContentEditableOverlayInputCapture after setting a new value for the editable and moving the cursor. */
    public afterChangeApply() { }

    /** Called by ContentEditableOverlayInputCapture to verify validity of input */
    public checkInput(event: EditableEditAction): boolean {
        if (event.newValue.includes("\n")) {
            return false;
        }
        return true;
    }

    public update() {
        if (this.elm.textContent !== this.value) {
            this.replaceContents(this.value);
        }
    }
}

export class EditableEditAction implements UndoableAction {
    public static key = Symbol();
    public key = EditableEditAction.key;

    constructor(
        public editable: Editable,
        public newValue: string,
        public previousValue: string
    ) { }

    public getTarget(): ActionBusDispatchable {
        return this.editable.actionBus;
    }

    public inverse(): EditableEditAction {
        return new EditableEditAction(this.editable, this.previousValue, this.newValue);
    }
}
