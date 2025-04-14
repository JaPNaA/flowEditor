import { Editable, EditableEditAction } from "../editing/Editable";
import { EventBus } from "../../../japnaaEngine2d/JaPNaAEngine2d";
import { NewInstructionAutocompleteSuggester } from "./NewInstructionAutocompleteSuggester";
import { InstructionBlueprint, InstructionBlueprintRegistery } from "./InstructionBlueprintRegistery";
import { InstructionGroup } from "../InstructionGroup";
import { EditorCursor } from "../editing/EditorCursor";
import { RequestAccepter } from "../editing/requests/RequestAccepter";
import { InstructionLine } from "./InstructionLine";
import { Instruction } from "./baseInstructions/Instruction";
import { InstructionOneLine, OneLineInstruction } from "./baseInstructions/InstructionOneLine";
import { CompositeInstructionBlock } from "./block/CompositeInstructionBlock";

export class NewInstruction extends InstructionOneLine<NewInstructionLine> {
    public readonly blueprintRegistery: InstructionBlueprintRegistery;
    public readonly indentationLevel: number;

    constructor(parentBlock: CompositeInstructionBlock) {
        super(new NewInstructionLine());

        let blueprintRegistery;
        let indentationLevel = 0;
        let curr: CompositeInstructionBlock | undefined = parentBlock;
        while (curr) {
            if (curr.blueprintRegistery && !blueprintRegistery) {
                blueprintRegistery = curr.blueprintRegistery;
            }
            indentationLevel++;
            curr = curr.parent;
        }

        if (!blueprintRegistery) { throw new Error("New instruction must be added to a block with a blueprint registery"); }
        this.blueprintRegistery = blueprintRegistery;
        this.indentationLevel = indentationLevel - 1; // -1, since the parent block is always there
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

        this.elm.class("newInstructionLine", "showPlaceholder");
        this.setAreas(this.editable = this.registerEditable(new NewInstructionEditable(this)));
        this.editable.isPlaceholder = true;

        this.editRequestAccepter = new RequestAccepter((changes, control) => {
            if (changes.newContent && changes.newContent[0] === "\n") {
                control.accepted = true;
                this.splitGroupHere();
            }
        }, this.editRequestAccepter);

        this.editable.actionBus.subscribe(EditableEditAction, (action) => {
            this.isEmpty = Boolean(!action.newValue);

            if (this.isEmpty) {
                this.elm.class("showPlaceholder");
            } else {
                this.elm.removeClass("showPlaceholder");
            }
        });

        this.editable.onKeyIntercepted.subscribe(event => {
            if (!this.isEmpty) { return; }
            if (event.ctrlKey || event.shiftKey || event.altKey || event.metaKey) { return; }

            const blueprint = (this.parentBlock.instruction as NewInstruction)
                .blueprintRegistery.getBlueprintByShortcut(event.code);
            if (blueprint) {
                const instruction = blueprint.create();
                this.changeView(instruction);
                event.preventDefault();
            }
        });
        this.editable.parentLine = this;
    }

    public reset(): void {
        this.elm.replaceContents(this.editable);
    }

    public splitGroupHere() {
        const groupBlock = this.parentBlock.getGroup();
        if (!groupBlock) { throw new Error("No editor attached"); }
        const group = groupBlock.group;
        group.parentEditor.undoLog.startGroup();
        if (group.block.children.length <= 1) {
            return; // cannot split -- after removing self, block would become empty
        }

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
    public onKeyIntercepted = new EventBus<KeyboardEvent>();
    private isActive = false;
    private previousCursor?: EditorCursor;

    constructor(parentLine: NewInstructionLine) {
        super("", parentLine);
        this.intercepter = this.intercepter.bind(this);
        this.autoCompleteType = NewInstructionAutocompleteSuggester.symbol;
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
