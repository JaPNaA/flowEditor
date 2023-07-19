import { Editable } from "../editing/Editable.js";
import { EditorCursor } from "../editing/EditorCursor.js";
import { InstructionOneLine, InstructionLine, OneLineInstruction, Instruction } from "./instructionTypes.js";
import { TextareaUserInputCaptureAreas, UserInputEvent } from "../editing/TextareaUserInputCapture.js";

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

    constructor() {
        super();

        this.elm.class("newInstructionLine");
        this.elm.append(
            this.editable = this.registerEditable(new NewInstructionEditable()),
            `Press shortcut or capitalize to search...`
        );

        this.editable.onChange.subscribe(changes => {
            if (!changes.newContent) { changes.reject(); return; }
            if (changes.newContent[0] === "\n") {
                this.splitGroupHere();
                return;
            }

            const blueprint = this.parentInstruction.parentGroup.parentEditor.blueprintRegistery
                .getBlueprintByShortcut(changes.newContent[0]);
            if (blueprint) {
                const instruction = blueprint.create();
                this.changeView(instruction);
            } else {
                changes.reject();
            }
        });
    }

    public _setParent(instruction: Instruction): void {
        super._setParent(instruction);
        this.editable.parentInstruction = this.parentInstruction;
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

class NewInstructionEditable extends Editable {
    public parentInstruction!: Instruction;

    constructor() {
        super("");
        this.intercepter = this.intercepter.bind(this);
    }

    public checkInput(event: UserInputEvent): void {
        // allow all
        this.onChange.send(event);
    }

    public setValue(value: string): void {
        // do nothing
    }

    public setActive(offsetStart: number, offsetEnd: number, cursor: EditorCursor): void {
        super.setActive(offsetStart, offsetEnd, cursor);
        this.parentInstruction.parentGroup.parentEditor.cursor.onKeydownIntercept.subscribe(this.intercepter);
    }

    public updateAndDeactivate(): void {
        super.updateAndDeactivate();
        this.parentInstruction.parentGroup.parentEditor.cursor.onKeydownIntercept.unsubscribe(this.intercepter);
    }

    private intercepter(ev: KeyboardEvent) {
        console.log(ev);
    }
}
