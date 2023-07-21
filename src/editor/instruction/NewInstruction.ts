import { Editable } from "../editing/Editable.js";
import { EditorCursor } from "../editing/EditorCursor.js";
import { InstructionOneLine, InstructionLine, OneLineInstruction, Instruction } from "./instructionTypes.js";
import { TextareaUserInputCaptureAreas, UserInputEvent } from "../editing/TextareaUserInputCapture.js";
import { Elm, EventBus } from "../../japnaaEngine2d/JaPNaAEngine2d.js";
import { NewInstructionAutocompleteSuggester } from "./NewInstructionAutocompleteSuggester.js";
import { InstructionBlueprint } from "./InstructionBlueprintRegistery.js";
export class NewInstruction extends InstructionOneLine<NewInstructionLine> {
    constructor() {
        super(new NewInstructionLine());
    }

    public insertLine(_lineIndex: number): boolean {
        this.line.splitGroupHere();
        return true;
    }
}

export class NewInstructionLine extends InstructionLine implements OneLineInstruction {
    private editable: NewInstructionEditable;
    public isBranch: boolean = false;
    private placeholderText: Elm<'span'>;
    private isEmpty = true;

    constructor() {
        super();

        this.elm.class("newInstructionLine");
        this.elm.append(
            this.editable = this.registerEditable(new NewInstructionEditable()),
            this.placeholderText = new Elm('span').class("placeholder").append(`Press shortcut or hold shift and type to search...`)
        );

        this.editable.onChange.subscribe(changes => {
            if (changes.newContent && changes.newContent[0] === "\n") {
                this.splitGroupHere();
                return;
            }

            if (changes.newContent) {
                this.placeholderText.class("hidden");
                this.isEmpty = false;
            } else {
                this.placeholderText.removeClass("hidden");
                this.isEmpty = true;
            }
        });

        this.editable.onKeyIntercepted.subscribe(event => {
            if (!this.isEmpty) { return; }
            if (event.ctrlKey || event.shiftKey || event.altKey || event.metaKey) { return; }

            const blueprint = this.parentInstruction.parentGroup.parentEditor.blueprintRegistery
                .getBlueprintByShortcut(event.code);
            if (blueprint) {
                const instruction = blueprint.create();
                this.changeView(instruction);
                event.preventDefault();
            }
        });
        this.editable.parentLine = this;
    }

    public _setParent(instruction: Instruction): void {
        super._setParent(instruction);
    }

    public splitGroupHere() {
        this.parentInstruction.parentGroup.parentEditor.undoLog.startGroup();
        const index = this.parentInstruction.getIndex();
        this.parentInstruction.removeLine(this);
        const newGroup = this.parentInstruction.parentGroup.splitAtInstruction(index);
        if (newGroup.getInstructions().length === 0) {
            newGroup.requestNewLine(0);
        }
        this.parentInstruction.parentGroup.parentEditor.undoLog.endGroup();
    }

    public serialize() {
        return { ctrl: "nop" };
    }

    public getAreas(): TextareaUserInputCaptureAreas {
        return [this.editable];
    }

    public changeView(instruction: Instruction) {
        this.parentInstruction.parentGroup.parentEditor.undoLog.startGroup();
        const currentLine = this.getCurrentLine();
        const currentInstructionIndex = this.parentInstruction.getIndex();
        const position = this.parentInstruction.parentGroup.parentEditor.cursor.getPosition();
        this.parentInstruction.parentGroup.requestRemoveLine(currentLine);
        this.parentInstruction.parentGroup.insertInstruction(
            instruction, currentInstructionIndex
        );

        if (position) {
            this.parentInstruction.parentGroup.parentEditor.cursor.setPosition({
                ...position,
                char: instruction.getLines()[0].preferredStartingCharOffset
            });
        }

        if (instruction.isBranch()) {
            this.splitAfterIfNeeded(currentLine);
        }
        this.parentInstruction.parentGroup.parentEditor.undoLog.endGroup();
    }

    private splitAfterIfNeeded(thisIndex: number) {
        const nextInstruction = this.parentInstruction.parentGroup.getInstructions()[thisIndex + 1];

        if (nextInstruction && !nextInstruction.isBranch()) {
            this.parentInstruction.parentGroup.splitAtInstruction(thisIndex + 1);
        }
    }
}

export class NewInstructionEditable extends Editable {
    public parentLine!: NewInstructionLine;
    public onKeyIntercepted = new EventBus<KeyboardEvent>();

    constructor() {
        super("");
        this.intercepter = this.intercepter.bind(this);
        this.autoCompleteType = NewInstructionAutocompleteSuggester.symbol;
    }

    public checkInput(event: UserInputEvent): void {
        // allow all
        this.onChange.send(event);
    }

    public setActive(offsetStart: number, offsetEnd: number, cursor: EditorCursor): void {
        super.setActive(offsetStart, offsetEnd, cursor);
        this.parentLine.parentInstruction.parentGroup.parentEditor.cursor.onKeydownIntercept.subscribe(this.intercepter);
    }

    public updateAndDeactivate(): void {
        super.updateAndDeactivate();
        this.parentLine.parentInstruction.parentGroup.parentEditor.cursor.onKeydownIntercept.unsubscribe(this.intercepter);
    }

    public acceptAutocomplete(blueprint: InstructionBlueprint) {
        const newInstruction = blueprint.create();
        this.parentLine.changeView(newInstruction);
    }

    private intercepter(ev: KeyboardEvent) {
        this.onKeyIntercepted.send(ev);
    }
}
