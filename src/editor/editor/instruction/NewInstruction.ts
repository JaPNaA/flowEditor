import { Editable } from "../editing/Editable";
import { InstructionOneLine, InstructionLine, OneLineInstruction, Instruction } from "./instructionTypes";
import { TextareaUserInputCaptureAreas, UserInputEvent } from "../editing/TextareaUserInputCapture";
import { Elm, EventBus } from "../../../japnaaEngine2d/JaPNaAEngine2d";
import { NewInstructionAutocompleteSuggester } from "./NewInstructionAutocompleteSuggester";
import { InstructionBlueprint } from "./InstructionBlueprintRegistery";
import { SingleInstructionBlock } from "./InstructionBlock";
export class NewInstruction extends InstructionOneLine<NewInstructionLine> {
    constructor() {
        super(new NewInstructionLine());
    }

    public insertLine(_lineIndex: number): boolean {
        this.line.splitGroupHere();
        return true;
    }

    public removeLine(line: InstructionLine): boolean {
        this.line.editable.deactivate();
        return super.removeLine(line);
    }
}

export class NewInstructionLine extends InstructionLine implements OneLineInstruction {
    public editable: NewInstructionEditable;
    public isBranch: boolean = false;
    private placeholderText: Elm<'span'>;
    private isEmpty = true;

    constructor() {
        super();

        this.elm.class("newInstructionLine");
        this.elm.append(
            this.editable = this.registerEditable(new NewInstructionEditable(this)),
            this.placeholderText = new Elm('span').class("placeholder").append(`Press shortcut or hold shift and type to search...`)
        );

        this.editable.onCheckInput.subscribe(changes => {
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

            const blueprint = this.parentInstruction.block.getGroupEditor().parentEditor.blueprintRegistery
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
        const group = this.parentInstruction.block.getGroupEditor();
        group.parentEditor.undoLog.startGroup();
        const index = (this.parentInstruction.block as SingleInstructionBlock).locateInstructionIndex();
        this.parentInstruction.removeLine(this);
        const newGroup = group.splitAtInstruction(index);
        if (newGroup.block.getInstructions().length === 0) {
            newGroup.requestNewLine(0);
        }
        group.parentEditor.cursor.update();
        group.parentEditor.undoLog.endGroup();
    }

    public serialize() {
        return { ctrl: "nop" };
    }

    public getAreas(): TextareaUserInputCaptureAreas {
        return [this.editable];
    }

    public changeView(instruction: Instruction) {
        // set all instruction's editables to placeholder if undefined
        for (const line of instruction.block.lineIter()) {
            for (const editable of line.getEditables()) {
                if (editable.placeholder === undefined) {
                    editable.placeholder = true;
                }
            }
        }

        const group = this.parentInstruction.block.getGroupEditor();
            group.parentEditor.undoLog.startGroup();
        const currentLine = this.getCurrentLine();
        const currentInstructionIndex = (this.parentInstruction.block as SingleInstructionBlock).locateInstructionIndex();
        const position = group.parentEditor.cursor.getPosition();
        group.requestRemoveLine(currentLine);
        group.insertInstruction(
            instruction, currentInstructionIndex
        );

        if (instruction.isBranch()) {
            this.splitAfterIfNeeded(currentLine, instruction.isAlwaysJump());
        }

        if (position) {
            group.parentEditor.cursor.setPosition({
                ...position,
                char: instruction.block.getLine(0).preferredStartingCharOffset
            });
        }

        group.parentEditor.undoLog.endGroup();
    }

    private splitAfterIfNeeded(thisIndex: number, thisIsAlwaysJump: boolean) {
        const group = this.parentInstruction.block.getGroupEditor();
        const nextInstruction = group.block.getInstructions()[thisIndex + 1];

        if (nextInstruction && (thisIsAlwaysJump || !nextInstruction.isBranch())) {
            group.splitAtInstruction(thisIndex + 1);
        }
    }
}

export class NewInstructionEditable extends Editable {
    public onCheckInput = new EventBus<UserInputEvent>();
    public onKeyIntercepted = new EventBus<KeyboardEvent>();
    private isActive = false;

    constructor(parentLine: NewInstructionLine) {
        super("", parentLine);
        this.intercepter = this.intercepter.bind(this);
        this.autoCompleteType = NewInstructionAutocompleteSuggester.symbol;
    }

    public checkInput(event: UserInputEvent): void {
        // allow all
        this.onCheckInput.send(event);
    }

    public update() {
        super.update();
        const cursor = this.parentLine.parentInstruction.block.getGroupEditor().parentEditor.cursor;
        if (cursor.activeEditable === this) {
            if (!this.isActive) {
                cursor.onKeydownIntercept.subscribe(this.intercepter);
            }
            this.isActive = true;
        } else {
            this.deactivate();
        }
    }

    public deactivate() {
        if (!this.isActive) { return; }
        const cursor = this.parentLine.parentInstruction.block.getGroupEditor().parentEditor.cursor;
        cursor.onKeydownIntercept.unsubscribe(this.intercepter);
        this.isActive = false;
    }

    public acceptAutocomplete(blueprint: InstructionBlueprint) {
        const newInstruction = blueprint.create();
        (this.parentLine as NewInstructionLine).changeView(newInstruction);
    }

    private intercepter(ev: KeyboardEvent) {
        this.onKeyIntercepted.send(ev);
    }
}
