import { Editable } from "../../editor/Editable.js";
import { InstructionGroupEditor } from "../../editor/InstructionGroupEditor.js";
import { BranchInstructionLine, Instruction, InstructionLine, InstructionOneLine, OneLineInstruction } from "../../editor/instructionLines.js";
import { EditorPlugin } from "../EditorPlugin.js";
import { ControlBackground } from "./controls.js";
import { VisualNovelExecuter } from "./executer.js";

export default class VisualNovelPlugin implements EditorPlugin {
    keyMappings: { [x: string]: () => Instruction; } = {
        "s": () => new InstructionOneLine(new SayInstruction("", "")),
        "t": () => new InstructionOneLine(new DisplayInstruction("")),
        "b": () => new ChoiceBranchMacro(["a", "b"]),
        "h": () => new InstructionOneLine(new BackgroundInstruction({
            visualNovelCtrl: "background",
            color: "000"
        }))
    };
    executer = new VisualNovelExecuter();

    parse(data: any): Instruction | undefined {
        switch (data.visualNovelCtrl) {
            case "say":
                return new InstructionOneLine(new SayInstruction(data.char, data.text));
            case "display":
                return new InstructionOneLine(new DisplayInstruction(data.text));
            case "choiceBranch":
                return new ChoiceBranchMacro(data.choices);
            case "background":
                return new InstructionOneLine(new BackgroundInstruction(data));
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

class DisplayInstruction extends InstructionLine implements OneLineInstruction {
    private textEditable: Editable;
    public isBranch: boolean = false;

    constructor(text: string) {
        super();

        this.setAreas(
            'Display: "',
            this.textEditable = this.createEditable(text),
            '"'
        );
    }

    public serialize() {
        return { visualNovelCtrl: "display", text: this.textEditable.getValue() };
    }
}

class BackgroundInstruction extends InstructionLine implements OneLineInstruction {
    private backgroundEditable: Editable;
    public isBranch: boolean = false;

    constructor(data: ControlBackground) {
        super();

        this.setAreas(
            "Set background: ",
            this.backgroundEditable = this.createEditable(
                data.background || [
                    data.src,
                    data.color && "#" + data.color,
                    data.zoom,
                    data.x || data.y ? `${data.x || 0},${data.y || 0}` : undefined
                ].filter(x => x !== undefined).join(" ")
            )
        );
    }

    public serialize() {
        const parts = this.backgroundEditable.getValue().trim().split(" ");
        const data: ControlBackground = { visualNovelCtrl: "background" };

        for (const part of parts) {
            if (part.startsWith("#")) { // color: #fff
                data.color = part.slice(1);
            } else if (part.match(/^-?\d+(\.\d*)?,-?\d+(\.\d*)?$/)) { // vec2: 0,2.5
                const [x, y] = part.split(",").map(x => parseFloat(x));
                data.x = x;
                data.y = y;
            } else if (part.match(/^-?\d+(\.\d*)?$/)) { // number: 3.2
                data.zoom = parseFloat(part);
            } else {
                data.src = part;
            }
        }

        return data;
    }
}

class ChoiceBranchMacro extends Instruction {
    private choiceLines: ChoiceBranchMacroLineOption[] = [];
    private openingLine: ChoiceBranchMacroLineOpening;
    private branchOffsets: (number | null)[] = [];

    constructor(choices: string[]) {
        super();
        this.addLine(this.openingLine = new ChoiceBranchMacroLineOpening());
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

    public removeLine(line: InstructionLine): boolean {
        if (line instanceof ChoiceBranchMacroLineOption) {
            const index = this.choiceLines.indexOf(line);
            if (index < 0) { throw new Error("Line not in instruction"); }
            this.choiceLines.splice(index, 1);
            this.parentGroup._removeInstructionLine(line.getCurrentLine());
        } else {
            // remove all
            const index = this.openingLine.getCurrentLine();
            this.parentGroup._removeInstructionLine(index);
            for (const _ of this.choiceLines) {
                this.parentGroup._removeInstructionLine(index);
            }
            this.parentGroup._removeInstruction(this.getIndex());
        }
        return true;
    }

    public insertLine(index: number): boolean {
        const choiceNumber = index - this.openingLine.getCurrentLine() - 1;
        if (choiceNumber < 0) { return false; }
        if (choiceNumber > this.choiceLines.length) { return false; }
        const newLine = new ChoiceBranchMacroLineOption("");
        newLine._setParent(this);
        this.choiceLines.splice(choiceNumber, 0, newLine);
        this.parentGroup._insertInstructionLine(index, newLine);
        return true;
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