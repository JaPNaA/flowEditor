import { RectangleM } from "../../japnaaEngine2d/JaPNaAEngine2d";
import { Editor } from "./Editor";
import { InstructionElmData } from "./EditorSaveData";
import { InstructionGroupBlock } from "./instruction/InstructionBlock";
import { Instruction } from "./instruction/instructionTypes";
import { UIDGenerator } from "./toolchain/UIDGenerator";
import { InstructionGroupEditor } from "./ui/InstructionGroupEditor";

/**
 * Represents a group of instructions. In the UI, the instruction block
 * can be moved and jumps can be targeted to instruction groups.
 * 
 * This class handles the memory model changes. The editor UI is handled
 * in the {@link InstructionGroupEditor} class.
 * 
 * DO NOT MUTATE this class outside of {@link UndoableAction}
 */
export class InstructionGroup {
    public readonly block = new InstructionGroupBlock(this);
    /** UI editor for this instruction group. */
    public readonly editor: InstructionGroupEditor;
    public readonly _childGroups: InstructionGroup[] = [];
    public readonly _parentGroups: InstructionGroup[] = [];

    public _isStartGroup = false;

    private initBranchTargets: ((InstructionGroup | null)[] | null)[] = [];

    constructor(public readonly parentEditor: Editor, private initData: InstructionElmData) {
        const rect = new RectangleM(
            initData.x,
            initData.y,
            InstructionGroupEditor.defaultWidth,
            (initData.instructions.length + initData.branches.length) * 16 * 1.55 + 16
        );

        this.editor = new InstructionGroupEditor(this, rect);
    }

    public relinkParentsToFinalBranch() {
        let newTarget: InstructionGroup | null = null;
        for (let i = this._childGroups.length - 1; i >= 0; i--) {
            if (this._childGroups[i] !== this) {
                newTarget = this._childGroups[i];
            }
        }

        // loop backwards since we're removing our parents
        for (let i = this._parentGroups.length - 1; i >= 0; i--) {
            const parent = this._parentGroups[i];
            for (const block of parent.block.children) {
                const instruction = block.instruction;
                if (!instruction || !instruction.isBranch()) { continue; }
                const targets = instruction.getBranchTargets();
                const newTargets = [];
                if (targets) {
                    for (const target of targets) {
                        if (target === this) {
                            newTargets.push(newTarget);
                        } else {
                            newTargets.push(target);
                        }
                    }
                    instruction.setBranchTargets(newTargets);
                }
            }
        }
    }

    public serialize(uidGen: UIDGenerator): InstructionElmData {
        const childrenUids: number[][] = [];
        const instructions = [];
        const branches = [];

        for (const block of this.block.children) {
            const instruction = block.instruction;
            if (!instruction) { continue; }
            if (instruction.isBranch()) {
                branches.push(instruction.serialize());
                const branchTargets = instruction.getBranchTargets();
                if (branchTargets) {
                    const uids = [];
                    for (const branchTarget of branchTargets) {
                        uids.push(branchTarget && uidGen.getId(branchTarget));
                    }
                    childrenUids.push(uids);
                } else {
                    childrenUids.push([]);
                }
            } else {
                instructions.push(instruction.serialize());
            }
        }

        return {
            id: uidGen.getId(this),
            instructions: instructions,
            branches: branches,
            children: childrenUids,
            x: Math.round(this.editor.rect.x),
            y: Math.round(this.editor.rect.y)
        };
    }

    public addBranchTargets(targets: (InstructionGroup | null)[] | null) {
        this.initBranchTargets.push(targets);
    }

    /** This method is called only once after instructions and branch targets are added */
    public setupConstruct() {
        this.parentEditor.undoLog.startGroup();

        for (const instruction of this.initData.instructions) {
            this.addInstruction(instruction);
        }

        let index = 0;
        for (const branch of this.initData.branches) {
            const instruction = this.addInstruction(branch);
            instruction.setBranchTargets(this.initBranchTargets[index++]);
        }

        this.parentEditor.undoLog.endGroup();

        this.editor.setupConstruct();
    }

    /**
     * Remove instructions after `instructionIndex`, then move the removed
     * instructions to a new `InstructionGroupEditor`
     */
    public splitAtInstruction(instructionIndex: number) {
        const movingInstructions = [];
        const numMoving = this.block.children.length - instructionIndex;

        this.parentEditor.undoLog.startGroup();

        for (let i = 0; i < numMoving; i++) {
            const instruction = this.block.children[this.block.children.length - 1];
            this.block.removeBlock(this.block.children.length - 1);
            movingInstructions.push(instruction);
        }
        movingInstructions.reverse();

        this.editor.updateHeight();

        const newGroup = new InstructionGroup(this.parentEditor, {
            id: -1,
            x: this.editor.rect.x,
            y: this.editor.rect.bottomY() + 64,
            children: [],
            branches: [],
            instructions: []
        });
        this.parentEditor.addGroup(newGroup);
        let i = 0;
        for (const instruction of movingInstructions) {
            newGroup.block.insertBlock(i++, instruction);
        }

        // add link from this to new group
        const lastInstruction = this.block.children[this.block.children.length - 1].instruction;
        if (lastInstruction && lastInstruction.isAlwaysJump()) {
            const targets = lastInstruction.getBranchTargets();
            const newTargets = [];
            if (targets) {
                let linked = false;
                for (const target of targets) {
                    if (!linked && target === null) {
                        newTargets.push(newGroup);
                        linked = true;
                    } else {
                        newTargets.push(target);
                    }
                }
                if (linked) {
                    lastInstruction.setBranchTargets(newTargets);
                }
            }
        } else {
            const jump = this.instructionFromData({ ctrl: 'jump', offset: 0 });
            this.block.appendBlock(jump.block);
            jump.setBranchTargets([newGroup]);
        }

        newGroup.setupConstruct();

        this.parentEditor.undoLog.endGroup();

        return newGroup;
    }

    public requestNewLine(lineIndex: number) {
        if (lineIndex > 0) {
            const previousLine = this.block.getLine(lineIndex - 1);
            if (previousLine) {
                let previousInstruction = previousLine.parentBlock.parentInstruction();
                while (previousInstruction) {
                    const successful = previousInstruction.insertLine(
                        previousInstruction.block.locateLine(previousLine) + 1
                    );
                    if (successful) { return; }
                    previousInstruction = previousInstruction.block.parent?.parentInstruction();
                }
                const instructionLine = this.instructionFromData({ ctrl: 'nop' });
                return this.block.insertBlock(
                    this.block.children.indexOf(previousLine.parentBlock) + 1,
                    instructionLine.block
                );
            }
        }

        const instructionLine = this.instructionFromData({ ctrl: 'nop' });
        return this.block.insertBlock(0, instructionLine.block);
    }

    /** Asks the instruction corresponding to the specified line to remove the line */
    public requestRemoveLine(lineIndex: number) {
        const line = this.block.getLine(lineIndex);
        if (!line) { return; }
        return line.parentBlock.parentInstruction()?.removeLine(line);
    }

    private addInstruction(data: any) {
        const instruction = this.instructionFromData(data);
        const lines = instruction.block.lineIter();

        for (const line of lines) {
            this.editor._addInstruction(line);
        }

        this.block._insertBlock(this.block.children.length, instruction.block);
        return instruction;
    }

    private instructionFromData(data: any): Instruction {
        return this.parentEditor.deserializer.deserialize(data);
    }
}
