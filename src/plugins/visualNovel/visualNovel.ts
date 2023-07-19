import { ControlItem } from "../../FlowRunner.js";
import { globalAutocompleteTypes } from "../../editor/AutoComplete.js";
import { Editable } from "../../editor/Editable.js";
import { InstructionGroupEditor } from "../../editor/InstructionGroupEditor.js";
import { BranchInstructionLine, Instruction, InstructionLine, InstructionOneLine, OneLineInstruction } from "../../editor/instructionLines.js";
import { EditorPlugin } from "../EditorPlugin.js";
import { ControlBackground, ControlBackgroundMusic, ControlChoose, ControlSay, ControlSayAdd, ControlShow, ControlSpeechBubbleSettings, ControlWait, VisualNovelControlItem } from "./controls.js";
import { VisualNovelExecuter } from "./executer.js";

const autocompleteTypeCharacter = Symbol();
const autocompleteTypeBackground = Symbol();
const autocompleteTypeBackgroundMusic = Symbol();
const autocompleteTypeShow = Symbol();

export default class VisualNovelPlugin implements EditorPlugin {
    keyMappings: { [x: string]: () => Instruction; } = {
        "s": () => new InstructionOneLine(new SayInstruction("", "")),
        "u": () => new InstructionOneLine(new SayAddInstruction("")),
        "k": () => new InstructionOneLine(new ShowInstruction({
            visualNovelCtrl: "show",
            src: ""
        })),
        "t": () => new InstructionOneLine(new DisplayMacro("")),
        "b": () => new ChoiceBranchMacro(["a", "b"]),
        "h": () => new InstructionOneLine(new BackgroundInstruction({
            visualNovelCtrl: "background",
            color: "000"
        })),
        "r": () => new InstructionOneLine(new SetTextRevealSpeedInstruction(50)),
        "f": () => new InstructionOneLine(new ChooseInstruction({
            visualNovelCtrl: "choose",
            variable: "choice",
            options: ['a', 'b']
        })),
        "w": () => new InstructionOneLine(new WaitInstruction(1000)),
        "m": () => new InstructionOneLine(new BackgroundMusicInstruction({
            visualNovelCtrl: "bgm",
            src: ""
        }))
    };
    executer = new VisualNovelExecuter();

    parse(data: any): Instruction | undefined {
        switch (data.visualNovelCtrl) {
            case "say":
                return new InstructionOneLine(new SayInstruction(data.char, data.text));
            case "display":
                return new InstructionOneLine(new DisplayMacro(data.text));
            case "textRevealSpeed":
                return new InstructionOneLine(new SetTextRevealSpeedInstruction(data.speed));
            case "show":
                return new InstructionOneLine(new ShowInstruction(data));
            case "choose":
                return new InstructionOneLine(new ChooseInstruction(data));
            case "choiceBranch":
                return new ChoiceBranchMacro(data.choices);
            case "background":
                return new InstructionOneLine(new BackgroundInstruction(data));
            case "wait":
                return new InstructionOneLine(new WaitInstruction(data.time));
            case "bgm":
                return new InstructionOneLine(new BackgroundMusicInstruction(data));
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

        this.characterEditable.autoCompleteType = autocompleteTypeCharacter;
    }

    public serialize(): ControlSay {
        return { visualNovelCtrl: "say", char: this.characterEditable.getValue(), text: this.textEditable.getValue() };
    }
}

class SayAddInstruction extends InstructionLine implements OneLineInstruction {
    private textEditable: Editable;
    public isBranch: boolean = false;

    constructor(text: string) {
        super();

        this.setAreas(
            'Add: "',
            this.textEditable = this.createEditable(text),
            '"'
        );
    }

    public serialize(): ControlSayAdd {
        return { visualNovelCtrl: "say-add", text: this.textEditable.getValue() };
    }
}

class DisplayMacro extends InstructionLine implements OneLineInstruction {
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

    public export(): ControlSay {
        return { visualNovelCtrl: "say", char: "", text: this.textEditable.getValue() };
    }
}

class WaitInstruction extends InstructionLine implements OneLineInstruction {
    private editable: Editable;
    public isBranch: boolean = false;

    constructor(time: number) {
        super();

        this.setAreas(
            'Wait: ',
            this.editable = this.createEditable(time),
            'ms'
        );
        this.elm.class("secondary");
    }

    public serialize(): ControlWait {
        const time = parseFloat(this.editable.getValue());
        if (isNaN(time)) { throw new Error("Not a number"); }
        return { visualNovelCtrl: "wait", time };
    }
}

class SetTextRevealSpeedInstruction extends InstructionLine implements OneLineInstruction {
    private editable: Editable;
    public isBranch: boolean = false;

    constructor(speed: number) {
        super();

        this.setAreas(
            'Set text reveal speed: ',
            this.editable = this.createEditable(speed),
            ''
        );
        this.elm.class("secondary");
    }

    public export(): ControlSpeechBubbleSettings {
        const speed = parseFloat(this.editable.getValue());
        if (isNaN(speed)) { throw new Error("Not a number"); }
        return { visualNovelCtrl: "speechBubbleSettings", revealSpeed: speed };
    }

    public serialize() {
        const speed = parseFloat(this.editable.getValue());
        if (isNaN(speed)) { throw new Error("Not a number"); }
        return { visualNovelCtrl: "textRevealSpeed", speed };
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
        this.backgroundEditable.autoCompleteType = autocompleteTypeBackground;
        this.elm.class("secondary");
    }

    public serialize(): ControlBackground {
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

class ShowInstruction extends InstructionLine implements OneLineInstruction {
    private editable: Editable;
    public isBranch: boolean = false;

    constructor(data: ControlShow) {
        super();

        this.setAreas(
            "Show: ",
            this.editable = this.createEditable(data.src)
        );
        this.editable.autoCompleteType = autocompleteTypeShow;
        this.elm.class("secondary");
    }

    public serialize(): ControlShow {
        return { visualNovelCtrl: "show", src: this.editable.getValue() };
    }
}


class BackgroundMusicInstruction extends InstructionLine implements OneLineInstruction {
    private editable: Editable;
    public isBranch: boolean = false;

    constructor(data: ControlBackgroundMusic) {
        super();

        this.setAreas(
            "Set background music: ",
            this.editable = this.createEditable(data.src)
        );
        this.editable.autoCompleteType = autocompleteTypeBackgroundMusic;
        this.elm.class("secondary");
    }

    public serialize(): ControlBackgroundMusic {
        return {
            visualNovelCtrl: "bgm",
            src: this.editable.getValue()
        };
    }
}

class ChooseInstruction extends InstructionLine implements OneLineInstruction {
    private variableSpan: Editable;
    private choicesSpan: Editable;
    public isBranch: boolean = false;

    constructor(data: ControlChoose) {
        super();

        this.setAreas(
            this.variableSpan = this.createEditable(data.variable),
            ' <- choose from [',
            this.choicesSpan = this.createEditable(data.options.join(", ")),
            ']'
        );
        this.variableSpan.autoCompleteType = globalAutocompleteTypes.variable;
        this.elm.class("control");
    }

    public serialize(): ControlChoose {
        return {
            visualNovelCtrl: "choose",
            options: this.choicesSpan.getValue().split(",").map(e => e.trim()),
            variable: this.variableSpan.getValue()
        };
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
            this.parentGroup.removeInstruction(this.getIndex());
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
        const output: (VisualNovelControlItem | ControlItem)[] = [{
            visualNovelCtrl: "choose",
            variable: "__choice__",
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