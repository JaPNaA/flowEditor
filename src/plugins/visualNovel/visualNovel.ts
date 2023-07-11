import { ControlItem } from "../../FlowRunner.js";
import { Editable } from "../../editor/Editable.js";
import { InstructionGroupEditor } from "../../editor/InstructionGroupEditor.js";
import { BranchInstructionLine, Instruction, InstructionLine, InstructionOneLine, OneLineInstruction } from "../../editor/instructionLines.js";
import { EditorPlugin } from "../EditorPlugin.js";
import { VisualNovelExecuter } from "./executer.js";

export default class VisualNovelPlugin implements EditorPlugin {
    keyMappings: { [x: string]: () => Instruction; } = {
        "s": () => new InstructionOneLine(new SayInstruction("", "")),
        "b": () => new ChoiceBranchMacro(["a", "b"]),
        "h": () => new InstructionOneLine(new BackgroundInstruction("#000"))
    };
    executer = new VisualNovelExecuter();

    parse(data: any): Instruction | undefined {
        switch (data.visualNovelCtrl) {
            case "say":
                return new InstructionOneLine(new SayInstruction(data.char, data.text));
            case "choiceBranch":
                return new ChoiceBranchMacro(data.choices);
            case "background":
                return new InstructionOneLine(new BackgroundInstruction(data.background));
            default:
                return;
        }
    }
}

class SayInstruction extends InstructionLine implements OneLineInstruction {
    private characterEditable: Editable;
    private textEditable: Editable;
    public isBranch: boolean = false;

    constructor(character: string, text: string) {
        super();

        this.setAreas(
            this.characterEditable = this.createEditable(character),
            ' says: "',
            this.textEditable = this.createEditable(text),
            '"'
        );
    }

    public serialize() {
        return { visualNovelCtrl: "say", char: this.characterEditable.getValue(), text: this.textEditable.getValue() };
    }
}

class BackgroundInstruction extends InstructionLine implements OneLineInstruction {
    private backgroundEditable: Editable;
    public isBranch: boolean = false;

    constructor(background: string) {
        super();

        this.setAreas(
            "Set background: ",
            this.backgroundEditable = this.createEditable(background)
        );
    }

    public serialize() {
        return { visualNovelCtrl: "background", background: this.backgroundEditable.getValue() };
    }
}

class ChoiceBranchMacro extends Instruction {
    private choiceLines: ChoiceBranchMacroLineOption[] = [];
    private branchOffsets: (number | null)[] = [];

    constructor(choices: string[]) {
        super();
        this.addLine(new ChoiceBranchMacroLineOpening());
        for (const choice of choices) {
            const line = new ChoiceBranchMacroLineOption(choice);
            this.addLine(line);
            this.choiceLines.push(line);
        }
    }

    public serialize() {
        return {
            visualNovelCtrl: "choiceBranch",
            choices: this.getChoices()
        };
    }

    public isBranch(): boolean {
        return true;
    }

    public getBranchTargets(): (InstructionGroupEditor | null)[] | null {
        const targets: (InstructionGroupEditor | null)[] = [];
        for (const line of this.choiceLines) {
            targets.push(line.getBranchTarget());
        }
        return targets;
    }

    public setBranchTargets(targets: (InstructionGroupEditor | null)[] | null): void {
        if (!targets) {
            for (const line of this.choiceLines) {
                line.setBranchTarget(null);
            }
        } else {
            for (let i = 0; i < this.choiceLines.length; i++) {
                this.choiceLines[i].setBranchTarget(targets[i]);
            }
        }
    }

    public setBranchOffsets(offsets: (number | null)[]): void {
        this.branchOffsets = offsets;
    }

    public export() {
        const choices = this.getChoices();
        const output: any[] = [{
            visualNovelCtrl: "choose",
            options: choices
        }];
        for (let i = 0; i < choices.length - 1; i++) {
            const offset = this.branchOffsets[i];
            if (offset) {
                output.push({
                    ctrl: "branch",
                    op: "<=",
                    v1: "__choice__",
                    v2: i,
                    offset: offset - i - 1
                });
            } else {
                output.push({ ctrl: 'nop' });
                console.warn("Choice in choice branch has no offset; will flow-over");
            }
        }
        if (choices.length > 0) {
            const offset = this.branchOffsets[choices.length - 1];
            if (offset) {
                output.push({
                    ctrl: "jump",
                    offset: offset - choices.length
                });
            } else {
                output.push({ ctrl: 'nop' });
                console.warn("Final choice in branch has no offset; will flow-over");
            }
        } else {
            console.warn("Choice branch has no branch offsets");
        }
        return output;
    }

    private getChoices(): string[] {
        const choices = [];
        for (const line of this.choiceLines) {
            choices.push(line.editable.getValue());
        }
        return choices;
    }
}

class ChoiceBranchMacroLineOpening extends InstructionLine {
    constructor() {
        super();
        this.setAreas("Choice branch", this.createEditable(""));
        this.elm.class("jump");
    }
}
class ChoiceBranchMacroLineOption extends BranchInstructionLine {
    public editable: Editable;

    constructor(choice: string) {
        super();
        this.setAreas("-> ", this.editable = this.createEditable(choice));
        this.elm.class("jump");
    }
}