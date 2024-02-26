import { Editable } from "../editing/Editable";
import { InstructionOneLine, InstructionLine, OneLineInstruction, Instruction } from "./instructionTypes";
import { UserInputEvent } from "../editing/UserInputEvents";
import { Elm, EventBus } from "../../../japnaaEngine2d/JaPNaAEngine2d";
import { NewInstructionAutocompleteSuggester } from "./NewInstructionAutocompleteSuggester";
import { InstructionBlueprint, InstructionBlueprintRegistery } from "./InstructionBlueprintRegistery";
import { InstructionGroupEditor } from "../InstructionGroupEditor";
import { EditorCursor } from "../editing/EditorCursor";

export class NewInstruction extends InstructionOneLine<NewInstructionLine> {
    public getBlueprintRegistery: () => InstructionBlueprintRegistery | undefined;

    constructor(blueprintRegistery?: InstructionBlueprintRegistery) {
        super(new NewInstructionLine());
        if (blueprintRegistery) {
            this.getBlueprintRegistery = () => blueprintRegistery;
        } else {
            this.getBlueprintRegistery = () => this.block.getGroupEditor()?.editor.parentEditor.blueprintRegistery;
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
    private placeholderText: Elm<'span'> = new Elm('span')
        .class("placeholder").attribute("contenteditable", "false")
        .append(`Press shortcut or hold shift and type to search...`);
    private isEmpty = true;

    constructor() {
        super();

        this.elm.class("newInstructionLine");
        this.setAreas(this.editable = this.registerEditable(new NewInstructionEditable(this)));

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

    public resetElm(): void {
        super.resetElm();
        this.elm.append(this.placeholderText);
    }

    public splitGroupHere() {
        const groupBlock = this.parentBlock.getGroupEditor();
        if (!groupBlock) { throw new Error("No editor attached"); }
        const group = groupBlock.editor;
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
                if (editable.placeholder === undefined) {
                    editable.placeholder = true;
                }
            }
        }

        const groupBlock = this.parentBlock.getGroupEditor();
        if (!groupBlock) { throw new Error("Editor not attached"); }
        const group = groupBlock.editor;
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

    private splitAfterIfNeeded(group: InstructionGroupEditor, thisIndex: number, thisIsAlwaysJump: boolean) {
        const nextInstruction = group.block.children[thisIndex + 1];

        if (nextInstruction.instruction && (thisIsAlwaysJump || !nextInstruction.instruction.isBranch())) {
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
        const group = this.parentLine.parentBlock.getGroupEditor();
        if (group) {
            const cursor = group.editor.parentEditor.cursor;
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
