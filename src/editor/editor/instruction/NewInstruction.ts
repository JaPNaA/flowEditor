import { Editable, EditableEditAction } from "../editing/Editable";
import { EventBus } from "../../../japnaaEngine2d/JaPNaAEngine2d";
import { NewInstructionAutocompleteSuggester } from "./NewInstructionAutocompleteSuggester";
import { InstructionBlueprint, InstructionBlueprintRegistery } from "./InstructionBlueprintRegistery";
import { InstructionGroup } from "../InstructionGroup";
import { EditorCursor } from "../editing/EditorCursor";
import { RequestAccepter } from "../editing/requests/RequestAccepter";
import { InstructionLine } from "./components/InstructionLine";
import { Instruction } from "./baseInstructions/Instruction";
import { InstructionOneLine, OneLineInstruction } from "./baseInstructions/InstructionOneLine";
import { CompositeInstructionBlock } from "./block/CompositeInstructionBlock";

export class NewInstruction extends InstructionOneLine<NewInstructionLine> {
    public readonly blueprintRegistery: InstructionBlueprintRegistery;

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
        this.line._setIndentation(indentationLevel - 1); // -1, since the parent block is always there
    }

    public insertLine(_lineIndex: number): boolean {
        this.line.splitGroupHereOrReduceIndentation();
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
                this.splitGroupHereOrReduceIndentation();
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

    public splitGroupHereOrReduceIndentation() {
        const groupBlock = this.parentBlock.getGroup();
        if (!groupBlock) { throw new Error("No editor attached"); }
        const group = groupBlock.group;
        if (this.parentBlock.parent?.parent) {
            // cannot split a composite instruction, need to reduce indentation
            this.reduceIndentation(group);
            return;
        }
        if (group.block.children.length <= 1) {
            return; // cannot split -- after removing self, block would become empty
        }

        this.splitGroupHere(group);
    }

    private splitGroupHere(group: InstructionGroup) {
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

    private reduceIndentation(group: InstructionGroup) {
        const parent = this.parentBlock.parent;
        if (!parent) { return; } // no parent
        const parentParent = parent.parent;
        if (!parentParent) { return; } // no parent parent to append to
        const parentIndexInParentParent = parentParent.children.indexOf(parent);
        if (parentIndexInParentParent < 0) {
            console.warn("Could not locate parent parent in parent.");
            return;
        }

        group.parentEditor.undoLog.startGroup();
        parent.removeBlock(this.parentBlock);

        const instruction = new NewInstruction(parentParent);
        parentParent.insertBlock(
            parentIndexInParentParent + 1,
            instruction.block
        );
        group.parentEditor.cursor.setPosition({
            char: 0,
            editable: 0,
            group: group,
            line: group.block.locateLine(instruction.block.getLine(0))
        });

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

    public _setIndentation(level: number) {
        this.setIndentation(level);
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
