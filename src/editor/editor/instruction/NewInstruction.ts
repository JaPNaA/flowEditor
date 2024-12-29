import { Editable } from "../editing/Editable";
import { InstructionOneLine, InstructionLine, OneLineInstruction, Instruction } from "./instructionTypes";
import { UserInputEvent } from "../editing/UserInputEvents";
import { Elm, EventBus } from "../../../japnaaEngine2d/JaPNaAEngine2d";
import { NewInstructionAutocompleteSuggester } from "./NewInstructionAutocompleteSuggester";
import { InstructionBlueprint, InstructionBlueprintRegistery } from "./InstructionBlueprintRegistery";
import { InstructionGroup } from "../InstructionGroup";
import { EditorCursor } from "../editing/EditorCursor";

export class NewInstruction extends InstructionOneLine<NewInstructionLine> {
    public getBlueprintRegistery: () => InstructionBlueprintRegistery | undefined;

    constructor(blueprintRegistery?: InstructionBlueprintRegistery) {
        super(new NewInstructionLine());
        if (blueprintRegistery) {
            this.getBlueprintRegistery = () => blueprintRegistery;
        } else {
            this.getBlueprintRegistery = () => this.block.getGroup()?.group.parentEditor.blueprintRegistery;
        }
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
    private isEmpty = true;

    constructor() {
        super();

        this.elm.class("newInstructionLine");
        this.setAreas(this.editable = this.registerEditable(new NewInstructionEditable(this)));
        this.editable.isPlaceholder = true;

        this.editable.onCheckInput.subscribe(changes => {
            if (changes.newContent && changes.newContent[0] === "\n") {
                this.splitGroupHere();
                return;
            }

            this.isEmpty = Boolean(!changes.newContent);
        });

        this.editable.onKeyIntercepted.subscribe(event => {
            if (!this.isEmpty) { return; }
            if (event.ctrlKey || event.shiftKey || event.altKey || event.metaKey) { return; }

            const blueprint = (this.parentBlock.instruction as NewInstruction)
                .getBlueprintRegistery()?.getBlueprintByShortcut(event.code);
            if (blueprint) {
                const instruction = blueprint.create();
                this.changeView(instruction);
                event.preventDefault();
            }
        });
        this.editable.parentLine = this;
    }

    public reset(): void {
        super.reset();
    }

    public splitGroupHere() {
        const groupBlock = this.parentBlock.getGroup();
        if (!groupBlock) { throw new Error("No editor attached"); }
        const group = groupBlock.group;
        group.parentEditor.undoLog.startGroup();
        const index = group.block.children.indexOf(this.parentBlock);
        this.parentBlock.parent?.removeBlock(this.parentBlock);
        const newGroup = group.splitAtInstruction(index);
        if (newGroup.block.children.length === 0) {
            newGroup.requestNewLine(0);
        }
        group.parentEditor.cursor.update();
        group.parentEditor.undoLog.endGroup();
    }

    public serialize() {
        return { ctrl: "nop" };
    }

    public changeView(instruction: Instruction) {
        // set all instruction's editables to placeholder if undefined
        for (const line of instruction.block.lineIter()) {
            for (const editable of line.getEditables()) {
                if (editable.isPlaceholder === undefined) {
                    editable.isPlaceholder = true;
                }
            }
        }

        const groupBlock = this.parentBlock.getGroup();
        if (!groupBlock) { throw new Error("Editor not attached"); }
        const group = groupBlock.group;
        const parentBlock = this.parentBlock.parent;
        if (!parentBlock) { throw new Error("No parent block"); }

        group.parentEditor.undoLog.startGroup();
        const currentLine = parentBlock.locateLine(this);
        const currentInstructionIndex = parentBlock.children.indexOf(this.parentBlock);
        const position = group.parentEditor.cursor.getPosition();
        parentBlock.removeBlock(currentInstructionIndex);
        parentBlock.insertBlock(currentInstructionIndex, instruction.block);

        if (instruction.isBranch() && parentBlock == groupBlock) {
            this.splitAfterIfNeeded(group, currentLine, instruction.isAlwaysJump());
        }

        if (position) {
            group.parentEditor.cursor.setPosition({
                ...position,
                char: instruction.block.getLine(0).preferredStartingCharOffset
            });
        }

        group.parentEditor.undoLog.endGroup();
    }

    private splitAfterIfNeeded(group: InstructionGroup, thisIndex: number, thisIsAlwaysJump: boolean) {
        const nextInstruction = group.block.children[thisIndex + 1];

        if (nextInstruction && nextInstruction.instruction &&
            (thisIsAlwaysJump || !nextInstruction.instruction.isBranch())
        ) {
            group.splitAtInstruction(thisIndex + 1);
        }
    }
}

export class NewInstructionEditable extends Editable {
    public onCheckInput = new EventBus<UserInputEvent>();
    public onKeyIntercepted = new EventBus<KeyboardEvent>();
    private isActive = false;
    private previousCursor?: EditorCursor;

    constructor(parentLine: NewInstructionLine) {
        super("Press shortcut or hold shift and type to search...", parentLine);
        this.intercepter = this.intercepter.bind(this);
        this.autoCompleteType = NewInstructionAutocompleteSuggester.symbol;
    }

    public checkInput(event: UserInputEvent): void {
        // allow all
        this.onCheckInput.send(event);
    }

    public update() {
        super.update();
        const group = this.parentLine.parentBlock.getGroup();
        if (group) {
            const cursor = group.group.parentEditor.cursor;
            if (cursor.activeEditable === this) {
                if (!this.isActive) {
                    cursor.onKeydownIntercept.subscribe(this.intercepter);
                }
                this.isActive = true;
                this.previousCursor = cursor;
                return;
            }
        }

        this.deactivate();
    }

    public deactivate() {
        if (!this.isActive) { return; }
        this.previousCursor!.onKeydownIntercept.unsubscribe(this.intercepter);
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
