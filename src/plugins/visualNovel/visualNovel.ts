import { ControlItem } from "../../FlowRunner";
import { InstructionGroupEditor } from "../../editor/editor/InstructionGroupEditor";
import { globalAutocompleteTypes } from "../../editor/editor/editing/AutoComplete";
import { Editable } from "../../editor/editor/editing/Editable";
import { InstructionBlueprintMin, InstructionBlueprintRegistery } from "../../editor/editor/instruction/InstructionBlueprintRegistery";
import { BranchInstructionLine, Instruction, InstructionComposite, InstructionLine, InstructionOneLine, OneLineInstruction } from "../../editor/editor/instruction/instructionTypes";
import { Project } from "../../editor/project/Project";
import { JaPNaAEngine2d } from "../../japnaaEngine2d/JaPNaAEngine2d";
import { EditorPlugin } from "../../editor/EditorPlugin";
import { VisualNovelAnalyser } from "./analyser";
import { ControlAnimate, ControlBackgroundMusic, ControlBackgroundMusicSettings, ControlGraphic, ControlSFX, ControlSFXSettings, ControlSay, ControlSayAdd, ControlSetVariableString, ControlShow, ControlSpeechBubbleSettings, ControlWait, VisualNovelControlItem } from "./controls";
import { VisualNovelExecuter } from "./executer";
import { VisualNovelRenderer } from "./renderer";
import { SingleInstructionBlock } from "../../editor/editor/instruction/InstructionBlock";
import { NewInstruction } from "../../editor/editor/instruction/NewInstruction";

const autocompleteTypeCharacter = Symbol();
const autocompleteTypeBackground = Symbol();
const autocompleteTypeBackgroundMusic = Symbol();
const autocompleteTypeShow = Symbol();

export default class VisualNovelPlugin implements EditorPlugin {
    name = "Visual Novel";

    instructionBlueprints: InstructionBlueprintMin[] = [{
        instructionName: "say",
        description: "Display text indicating a character talking",
        shortcutKey: "KeyS",
        create: () => new VNContentInstrOneLine(new SayInstruction("", "")),
    }, {
        instructionName: "say-add",
        description: "Add more text to the previous 'say' or 'display' command",
        shortcutKey: "KeyA",
        create: () => new VNContentInstrOneLine(new SayAddInstruction("")),
    }, {
        //     instructionName: "show",
        //     description: "Show an image in the foreground",
        //     shortcutKey: "KeyK",
        //     create: () => new VNContentInstrOneLine(new ShowInstruction({
        //         visualNovelCtrl: "show",
        //         src: ""
        //     })),
        // }, {
        instructionName: "display",
        description: "Display text indicating narration",
        shortcutKey: "KeyT",
        create: () => new VNContentInstrOneLine(new DisplayMacro("")),
    }, {
        //     instructionName: "choose branch",
        //     description: "Macro. Display buttons that allow the player to choose which instructions to execute",
        //     shortcutKey: "KeyB",
        //     create: () => new ChoiceBranchMacro(["a", "b"]),
        // }, {
        instructionName: "background",
        description: "Set the background",
        shortcutKey: "KeyH",
        create: () => new BackgroundMacro({
            visualNovelCtrl: "background",
            color: "000"
        }),
    }, {
        instructionName: "set text reveal speed",
        description: "Sets the speed of revealing text in a `say` or `display` command",
        create: () => new VNContentInstrOneLine(new SetTextRevealSpeedInstruction(50)),
    }, {
        instructionName: "set speech bubble position",
        description: "Sets the position of the speech bubble",
        create: () => new VNContentInstrOneLine(new SetSpeechBubblePositionInstruction(50, 100))
    }, {
        instructionName: "choose",
        description: "Displays buttons that allow the player to make a choice. The choice is stored in a variable",
        shortcutKey: "KeyC",
        create: () => new VNContentInstrOneLine(new ChooseInstruction({
            visualNovelCtrl: "choose",
            variable: "choice",
            options: ['a', 'b']
        })),
    }, {
        instructionName: "wait",
        description: "Do nothing for a specified amount of time",
        shortcutKey: "KeyW",
        create: () => new VNContentInstrOneLine(new WaitInstruction(1000)),
    }, {
        instructionName: "background music",
        description: "Set the background music",
        shortcutKey: "KeyM",
        create: () => new VNContentInstrOneLine(new BackgroundMusicInstruction({
            visualNovelCtrl: "bgm",
            src: ""
        }))
    }, {
        instructionName: "set background music volume",
        description: "Set the volume of the background music",
        create: () => new VNContentInstrOneLine(new BackgroundMusicVolumeInstruction({
            visualNovelCtrl: "bgmSettings",
            volume: 0.4
        }))
    }, {
        instructionName: "play sfx",
        description: "Play a sound effect",
        create: () => new VNContentInstrOneLine(new SFXInstruction({
            visualNovelCtrl: "sfx",
            src: ""
        }))
    }, {
        instructionName: "set sfx volume",
        description: "Set the volume of sound effects",
        create: () => new VNContentInstrOneLine(new SFXVolumeInstruction({
            visualNovelCtrl: "sfxSettings",
            volume: 0.6
        }))
    }, {
        instructionName: "set variable to text",
        description: "Sets the value of a variable to text (by setting the value to a number identifying the text.)",
        create: () => new VNContentInstrOneLine(new SetVariableStringInstruction({
            visualNovelCtrl: "strset",
            v: "text",
            str: ""
        }))
    }, {
        instructionName: "create graphic",
        description: "Create an image or shape that can be displayed",
        create: () => new CreateGraphicInstruction({
            params: [],
            name: "unnamed graphic"
        })
    }];
    executer = new VisualNovelExecuter();
    renderer = new VisualNovelRenderer();
    analyser = new VisualNovelAnalyser();

    setProject(project: Project): void {
        this.renderer.setProject(project);
    }

    setEngine(engine: JaPNaAEngine2d): void {
        this.renderer.setEngine(engine);
    }

    parse(data: any): Instruction | undefined {
        switch (data.visualNovelCtrl) {
            case "say":
                return new VNContentInstrOneLine(new SayInstruction(data.char, data.text));
            case "say-add":
                return new VNContentInstrOneLine(new SayAddInstruction(data.text));
            case "display":
                return new VNContentInstrOneLine(new DisplayMacro(data.text));
            case "textRevealSpeed":
                return new VNContentInstrOneLine(new SetTextRevealSpeedInstruction(data.speed));
            case "speechBubblePosition":
                return new VNContentInstrOneLine(new SetSpeechBubblePositionInstruction(data.positionX, data.positionY));
            case "graphic":
                return new CreateGraphicInstruction(data);
            // case "show":
            //     return new VNContentInstrOneLine(new ShowInstruction(data));
            case "choose":
                return new VNContentInstrOneLine(new ChooseInstruction(data));
            case "choiceBranch":
                return new ChoiceBranchMacro(data.choices);
            case "background":
                return new BackgroundMacro(data);
            case "wait":
                return new VNContentInstrOneLine(new WaitInstruction(data.time));
            case "bgm":
                return new VNContentInstrOneLine(new BackgroundMusicInstruction(data));
            case "bgmVolume":
                return new VNContentInstrOneLine(new BackgroundMusicVolumeInstruction(data));
            case "sfx":
                return new VNContentInstrOneLine(new SFXInstruction(data));
            case "sfxVolume":
                return new VNContentInstrOneLine(new SFXVolumeInstruction(data));
            case "strset":
                return new VNContentInstrOneLine(new SetVariableStringInstruction(data));
            default:
                return;
        }
    }

    getFlowHeader(): VisualNovelControlItem[] {
        return [
            // parent of all non-ui
            {
                visualNovelCtrl: "graphic",
                id: 3
            },
            // parent of non-background
            {
                visualNovelCtrl: "graphic",
                id: 1,
                parent: 3
            },
            // parent of background graphic
            {
                visualNovelCtrl: "graphic",
                id: 2,
                parent: 3
            },
            {
                visualNovelCtrl: "show",
                id: 2
            },
            // parent of ui graphics
            {
                visualNovelCtrl: "graphic",
                id: 4,
            },
            // temporary: default speech box
            {
                visualNovelCtrl: "graphic",
                id: 5,
                parent: 4,
                points: [100, 20]
            },
            {
                visualNovelCtrl: "show",
                id: 5
            },
            {
                visualNovelCtrl: "animate",
                id: 5,
                length: 0,
                events: [
                    [0, {
                        key: "pos",
                        to: [50, 100],
                    }],
                    [0, {
                        key: "transformAnchor",
                        to: [50, 50],
                    }],
                    [0, {
                        key: "scale",
                        to: { base: "fit", scale: 0.95 },
                    }],
                ]
            }
        ];
    }
}

export interface VNInstructionContext {
    backgroundColor?: string;
    backgroundSrc?: string;
}

/** Visual Novel Content Instruction One Line */
export class VNContentInstrOneLine<T extends OneLineInstruction = OneLineInstruction> extends InstructionOneLine<T> {
    /** What this instruction sets the context to */
    public contextSet?: VNInstructionContext;
    public context?: VNInstructionContext;
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

    public export(): VisualNovelControlItem[] {
        return [
            // temporary, until the say control is properly implemented
            {
                visualNovelCtrl: "text",
                id: 5,
                text: this.characterEditable.getValue() + ":\n" + this.textEditable.getValue()
            },
            { visualNovelCtrl: "wait" }
        ];
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

    public export(): VisualNovelControlItem[] {
        return [this.serialize(), { visualNovelCtrl: "wait" }];
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

    public export(): VisualNovelControlItem[] {
        return [
            { visualNovelCtrl: "say", char: "", text: this.textEditable.getValue() },
            { visualNovelCtrl: "wait" }
        ];
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

    public export(): ControlSpeechBubbleSettings[] {
        const speed = parseFloat(this.editable.getValue());
        if (isNaN(speed)) { throw new Error("Not a number"); }
        return [{ visualNovelCtrl: "speechBubbleSettings", revealSpeed: speed }];
    }

    public serialize() {
        const speed = parseFloat(this.editable.getValue());
        if (isNaN(speed)) { throw new Error("Not a number"); }
        return { visualNovelCtrl: "textRevealSpeed", speed };
    }
}


class SetSpeechBubblePositionInstruction extends InstructionLine implements OneLineInstruction {
    private xEditable: Editable;
    private yEditable: Editable;
    public isBranch: boolean = false;

    constructor(x: number, y: number) {
        super();

        this.setAreas(
            'Set speech bubble position x: ',
            this.xEditable = this.createEditable(x),
            ', y: ',
            this.yEditable = this.createEditable(y)
        );
        this.elm.class("secondary");
    }

    public export(): ControlSpeechBubbleSettings[] {
        const x = parseFloat(this.xEditable.getValue());
        const y = parseFloat(this.yEditable.getValue());
        if (isNaN(x) || isNaN(y)) { throw new Error("Not a number"); }
        return [{ visualNovelCtrl: "speechBubbleSettings", positionX: x, positionY: y }];
    }

    public serialize() {
        const x = parseFloat(this.xEditable.getValue());
        const y = parseFloat(this.yEditable.getValue());
        if (isNaN(x) || isNaN(y)) { throw new Error("Not a number"); }
        return { visualNovelCtrl: "speechBubblePosition", positionX: x, positionY: y };
    }
}

interface ControlMacroBackground {
    visualNovelCtrl: "background";
    /**
     * Specify background color with #.
     * Will be ignored by executer.
     * @deprecated
     */
    background?: string;
    /**
     * URL or path of an image to use for the background.
     */
    src?: string;
    /**
     * The background color of the background.
     * Usually not seen unless the background image is transparent or doesn't
     * cover the entire screen.
     * Default: #fff
     */
    color?: string;
    /**
     * How zoomed-in is the background? Default: 1.
     * Values 1 and over are guaranteed to cover the entire screen.
     */
    zoom?: number;
    /** 0 to 100 -- x position of the zoom center? Default: 50 */
    x?: number;
    /** 0 to 100 -- y position of is the zoom center? Default: 50 */
    y?: number;
}

class BackgroundMacro extends VNContentInstrOneLine<BackgroundMacroLine> {
    constructor(data: ControlMacroBackground) {
        super(new BackgroundMacroLine(data));

        this.contextSet = {
            backgroundColor: data.color && "#" + data.color,
            backgroundSrc: data.src
        };
    }
}

class BackgroundMacroLine extends InstructionLine implements OneLineInstruction {
    private backgroundEditable: Editable;
    public isBranch: boolean = false;

    constructor(data: ControlMacroBackground) {
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
        this.backgroundEditable.onChange.subscribe(value => {
            const serialized = this.parseBackgroundString(value);
            (this.parentBlock.instruction as BackgroundMacro).contextSet = {
                backgroundColor: serialized.color && "#" + serialized.color,
                backgroundSrc: serialized.src
            };
        });
        this.elm.class("secondary");
    }

    public serialize(): ControlMacroBackground {
        return this.parseBackgroundString(this.backgroundEditable.getValue());
    }

    public export(): VisualNovelControlItem[] {
        const graphic: ControlGraphic = { visualNovelCtrl: "graphic", id: 2 };
        const data = this.serialize();
        if (data.src) {
            graphic.src = data.src;
            if (data.color) {
                graphic.fill = data.color;
            } else {
                graphic.fill = "fff";
            }
        } else if (data.color) {
            graphic.fill = data.color;
            graphic.points = [100, 100];
        }
        return [graphic, {
            visualNovelCtrl: "animate", id: 2, length: 0, events: [[0,
                { key: "scale", to: { base: "cover" } }
            ], [0,
                {
                    key: "pos", to: [
                        data.x === undefined ? 50 : data.x,
                        data.y === undefined ? 50 : data.y
                    ]
                }
            ]]
        }];
    }

    private parseBackgroundString(backgroundStr: string): ControlMacroBackground {
        const parts = backgroundStr.trim().split(" ");
        const data: ControlMacroBackground = { visualNovelCtrl: "background" };

        for (const part of parts) {
            if (part.startsWith("#")) { // color: #fff
                const hex = part.slice(1);
                if ([3, 4, 6, 8].includes(hex.length)) {
                    data.color = hex;
                }
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

// class ShowInstruction extends InstructionLine implements OneLineInstruction {
//     private editable: Editable;
//     public isBranch: boolean = false;

//     constructor(data: ControlShow) {
//         super();

//         this.setAreas(
//             "Show: ",
//             this.editable = this.createEditable(data.src)
//         );
//         this.editable.autoCompleteType = autocompleteTypeShow;
//         this.elm.class("secondary");
//     }

//     public serialize(): ControlShow {
//         return { visualNovelCtrl: "show", src: this.editable.getValue() };
//     }
// }


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

class BackgroundMusicVolumeInstruction extends InstructionLine implements OneLineInstruction {
    private editable: Editable;
    public isBranch: boolean = false;

    constructor(data: ControlBackgroundMusicSettings) {
        super();

        this.setAreas(
            "Set background music volume: ",
            this.editable = this.createEditable(data.volume)
        );
        this.elm.class("secondary");
    }

    public export(): ControlBackgroundMusicSettings[] {
        const volume = parseFloat(this.editable.getValue());
        if (isNaN(volume)) { throw new Error("Not a number"); }
        return [{
            visualNovelCtrl: "bgmSettings",
            volume: volume
        }];
    }

    public serialize() {
        const volume = parseFloat(this.editable.getValue());
        if (isNaN(volume)) { throw new Error("Not a number"); }
        return {
            visualNovelCtrl: "bgmVolume",
            volume: volume
        };
    }
}

class SFXInstruction extends InstructionLine implements OneLineInstruction {
    private editable: Editable;
    public isBranch: boolean = false;

    constructor(data: ControlSFX) {
        super();

        this.setAreas(
            "Play sfx: ",
            this.editable = this.createEditable(data.src)
        );
        this.editable.autoCompleteType = autocompleteTypeBackgroundMusic;
        this.elm.class("secondary");
    }

    public serialize(): ControlSFX {
        return {
            visualNovelCtrl: "sfx",
            src: this.editable.getValue()
        };
    }
}

class SFXVolumeInstruction extends InstructionLine implements OneLineInstruction {
    private editable: Editable;
    public isBranch: boolean = false;

    constructor(data: ControlSFXSettings) {
        super();

        this.setAreas(
            "Set sfx volume: ",
            this.editable = this.createEditable(data.volume)
        );
        this.elm.class("secondary");
    }

    public export(): ControlSFXSettings[] {
        const volume = parseFloat(this.editable.getValue());
        if (isNaN(volume)) { throw new Error("Not a number"); }
        return [{
            visualNovelCtrl: "sfxSettings",
            volume: volume
        }];
    }

    public serialize() {
        const volume = parseFloat(this.editable.getValue());
        if (isNaN(volume)) { throw new Error("Not a number"); }
        return {
            visualNovelCtrl: "sfxVolume",
            volume: volume
        };
    }
}

class ChooseInstruction extends InstructionLine implements OneLineInstruction {
    private variableSpan: Editable;
    private choicesSpan: Editable;
    public isBranch: boolean = false;

    constructor(data: any) {
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

    public serialize(): any {
        return {
            visualNovelCtrl: "choose",
            options: this.choicesSpan.getValue().split(",").map(e => e.trim()),
            variable: this.variableSpan.getValue()
        };
    }

    public export(): (VisualNovelControlItem | ControlItem)[] {
        const options = this.choicesSpan.getValue().split(",").map(e => e.trim());
        const result: (VisualNovelControlItem | ControlItem)[] = [];
        const graphicIds = [];
        // todo: unique ids for choices instead of hardcoded
        let currGraphicId = 10;
        let currY = 0;
        for (const option of options) {
            const graphicId = currGraphicId++;
            graphicIds.push(graphicId);
            const y = currY++;
            result.push({
                visualNovelCtrl: "graphic",
                id: graphicId,
                fill: "f00",
                points: [100, 15],
            }, { // position choice graphics (temporary)
                visualNovelCtrl: "animate",
                length: 0,
                id: graphicId,
                events: [
                    [0, { key: "scale", to: { scale: 0.5 } }],
                    [0, { key: "pos", to: [50, 10 + y * 20] }]
                ]
            }, {
                visualNovelCtrl: "text",
                id: graphicId,
                text: option
            });
        }
        result.push({
            visualNovelCtrl: "choose",
            options: graphicIds
        });
        for (const graphic of graphicIds) {
            result.push({
                visualNovelCtrl: "show",
                id: graphic
            });
        }
        result.push({ // get input
            ctrl: "input",
            options: options,
            variable: this.variableSpan.getValue()
        }, { // hide options
            visualNovelCtrl: "choose"
        });
        for (const graphic of graphicIds) {
            result.push({
                visualNovelCtrl: "hide",
                id: graphic
            });
        }
        return result;
    }
}

class ChoiceBranchMacro extends Instruction {
    public block: SingleInstructionBlock = new SingleInstructionBlock(this);
    private choiceLines: ChoiceBranchMacroLineOption[] = [];
    private openingLine: ChoiceBranchMacroLineOpening;
    private branchOffsets: (number | null)[] = [];

    constructor(choices: string[]) {
        super();
        this.block._appendLine(this.openingLine = new ChoiceBranchMacroLineOpening());
        for (const choice of choices) {
            const line = new ChoiceBranchMacroLineOption(choice);
            this.block._appendLine(line);
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

    public isAlwaysJump(): boolean {
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
        const group = this.block.getGroupEditor();
        if (!group) { return false; }

        if (line instanceof ChoiceBranchMacroLineOption) {
            const index = this.choiceLines.indexOf(line);
            if (index < 0) { throw new Error("Line not in instruction"); }
            this.choiceLines.splice(index, 1);
            this.block._removeLine(index + 1);
        } else if (this.block.parent) {
            this.block.parent._removeBlock(this.block);
        }
        return true;
    }

    public insertLine(index: number): boolean {
        const group = this.block.getGroupEditor();
        if (!group) { return false; }

        const choiceNumber = index - group.locateLine(this.openingLine) - 1;
        if (choiceNumber < 0) { return false; }
        if (choiceNumber > this.choiceLines.length) { return false; }
        const newLine = new ChoiceBranchMacroLineOption("");
        newLine._setParent(this.block);
        this.choiceLines.splice(choiceNumber, 0, newLine);
        this.block._insertLine(index + 1, newLine);
        group.editor._insertInstructionLine(index, newLine);
        return true;
    }

    public export() {
        const choices = this.getChoices();
        const output: (VisualNovelControlItem | ControlItem)[] = [{
            visualNovelCtrl: "choose",
            options: [] // choices
        }, {
            ctrl: "input",
            options: choices,
            variable: "__choice__"
        }, { // hide options
            visualNovelCtrl: "choose"
        }];
        for (let i = 0; i < choices.length - 1; i++) {
            const offset = this.branchOffsets[i];
            if (offset) {
                output.push({
                    ctrl: "branch",
                    op: "<=",
                    v1: "__choice__",
                    v2: i,
                    offset: offset - output.length
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
                    offset: offset - output.length
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

class SetVariableStringInstruction extends InstructionLine implements OneLineInstruction {
    private variableEditable: Editable;
    private stringEditable: Editable;

    isBranch: boolean = false;

    constructor(data: ControlSetVariableString) {
        super();
        this.setAreas(
            this.variableEditable = this.createEditable(data.v),
            ' <- "',
            this.stringEditable = this.createEditable(data.str),
            '"'
        );
        this.variableEditable.autoCompleteType = globalAutocompleteTypes.variable;
        this.elm.class("control");
    }

    serialize(): ControlSetVariableString {
        return { visualNovelCtrl: "strset", str: this.stringEditable.getValue(), v: this.variableEditable.getValue() };
    }
}

class CreateGraphicInstruction extends InstructionComposite<CreateGraphicLineOpening> {
    private static instructionRegistery = new InstructionBlueprintRegistery();

    private static instructionBlueprints: InstructionBlueprintMin[] = [{
        instructionName: "source",
        description: "Path to an image to use as the graphic's texture",
        shortcutKey: "KeyS",
        create: () => new InstructionOneLine(new CreateGraphicSourceInstruction("path")),
    }, {
        instructionName: "clip",
        description: "The shape of the graphic specified in points. Crops out (clips) the instruction texture",
        shortcutKey: "KeyC",
        create: () => new InstructionOneLine(new CreateGraphicClipInstruction([100, 100])),
    }, {
        instructionName: "fill color",
        description: "Fill or background color of the graphic",
        shortcutKey: "KeyF",
        create: () => new InstructionOneLine(new CreateGraphicFillInstruction("fff")),
    }, {
        instructionName: "outline",
        description: "Outline or stroke of the shape specified by clip",
        shortcutKey: "KeyO",
        create: () => new InstructionOneLine(new CreateGraphicOutlineInstruction("#000 1"))
    }, {
        instructionName: "parent graphic",
        description: "Parent graphic. If the parent graphic moves, this graphic will follow",
        shortcutKey: "KeyP",
        create: () => { throw new Error("Not implemented"); }
    }];

    static {
        this.instructionRegistery.registerBlueprints(this.instructionBlueprints, "graphic");
    }

    public graphicId = 0;

    constructor(data: any) {
        super(new CreateGraphicLineOpening(data.name || "unnamed graphic"));

        for (const [key, val] of data.params) {
            let line: CreateGraphicSubInstruction;
            switch (key) {
                case "src":
                    line = new CreateGraphicSourceInstruction(val);
                    break;
                case "points":
                    line = new CreateGraphicClipInstruction(val);
                    break;
                case "fill":
                    line = new CreateGraphicFillInstruction(val);
                    break;
                case "stroke":
                    line = new CreateGraphicOutlineInstruction(val);
                    break;
                default:
                    continue;
            }
            this.block._appendBlock(new InstructionOneLine(line).block);
        }
    }

    public export(): ControlGraphic[] {
        const graphic: ControlGraphic = { visualNovelCtrl: "graphic", id: this.graphicId };
        for (const block of this.block.children) {
            const instruction = block.instruction;
            if (instruction) {
                const items = instruction.export();
                for (const [key, val] of items) {
                    // @ts-ignore
                    graphic[key] = val;
                }
            }
        }
        return [graphic];
    }

    public serialize(): any {
        return {
            visualNovelCtrl: "graphic",
            name: this.openingLine.editable.getValue(),
            params: this.block.children.map(x => x.instruction?.serialize()).filter(x => x)
        };
    }

    protected createNewInstruction(): Instruction {
        // return new InstructionOneLine(new CreateGraphicSourceInstruction("path"));
        const instruction = new NewInstruction(CreateGraphicInstruction.instructionRegistery);
        return instruction;
    }
}


class CreateGraphicLineOpening extends InstructionLine {
    public editable: Editable;

    constructor(name: string) {
        super();
        this.setAreas("Create Graphic: ", this.editable = this.createEditable(name));
        this.elm.class("control");
    }
}

abstract class CreateGraphicSubInstruction extends InstructionLine implements OneLineInstruction {
    isBranch: boolean = false;

    public abstract serialize(): [keyof ControlGraphic, any];
    public export(): [keyof ControlGraphic, any][] {
        return [this.serialize()];
    }
}

class CreateGraphicSourceInstruction extends CreateGraphicSubInstruction {
    isBranch: boolean = false;
    private editable: Editable;

    constructor(src: string) {
        super();
        this.setAreas(
            "  source: ", this.editable = this.createEditable(src)
        );
        this.elm.class("control");
    }

    public serialize(): ["src", string] {
        return ["src", this.editable.getValue()];
    }
}

class CreateGraphicClipInstruction extends CreateGraphicSubInstruction {
    isBranch: boolean = false;
    private editable: Editable;

    constructor(points: number[]) {
        super();
        let str: (string | number)[] = [];
        if (points.length <= 2) {
            str = points;
        } else {
            for (let i = 0; i < points.length; i += 2) {
                str.push("(" + points[i] + ", " + points[i + 1] + ")");
            }
        }
        this.setAreas(
            "  clip: ", this.editable = this.createEditable(str.join(", "))
        );
        this.elm.class("control");
    }

    public serialize(): ["points", number[]] {
        const vals = this.editable.getValue().split(/[^\d.]+/).map(str => parseFloat(str)).filter(x => !isNaN(x));
        return ["points", vals];
    }
}

class CreateGraphicFillInstruction extends CreateGraphicSubInstruction {
    isBranch: boolean = false;
    private editable: Editable;

    constructor(fill: string) {
        super();
        this.setAreas(
            "  fill: ", this.editable = this.createEditable("#" + fill)
        );
        this.elm.class("control");
    }

    public serialize(): ["fill", string] {
        let val = this.editable.getValue();
        if (val.startsWith("#")) {
            val = val.slice(1);
        }
        return ["fill", val];
    }
}

class CreateGraphicOutlineInstruction extends CreateGraphicSubInstruction {
    isBranch: boolean = false;
    private editable: Editable;

    constructor(val: string) {
        super();
        this.setAreas(
            "  outline: ", this.editable = this.createEditable(val)
        );
        this.elm.class("control");
    }

    public export(): ["stroke" | "strokeWidth", any][] {
        const str = this.editable.getValue();
        const parts = str.split(/\s+/);
        const output: ["stroke" | "strokeWidth", any][] = [];
        for (const part of parts) {
            if (part.startsWith("#")) {
                output.push(["stroke", part.slice(1)]);
            } else {
                const strokeWidth = parseFloat(part);
                if (!isNaN(strokeWidth)) {
                    output.push(["strokeWidth", parseFloat(part)]);
                }
            }
        }
        return output;
    }

    public serialize(): ["stroke", any] {
        return ["stroke", this.editable.getValue()];
    }
}

// class AnimateInstruction extends InstructionComposite {
//     constructor(animateControl: ControlAnimate) {
//         super(new AnimateLineOpening());
//     }
//     public export(): any[] {
//         throw new Error("Method not implemented.");
//     }
//     public serialize() {
//         throw new Error("Method not implemented.");
//     }
//     public removeLine(line: InstructionLine): boolean {
//         throw new Error("Method not implemented.");
//     }
//     protected createNewInstruction(): Instruction {
//         return new InstructionOneLine(new CreateGraphicSourceInstruction("path"));
//     }
// }

/*
Example:

Animate
  0s: posAnchor to (0, 0) from (50, 50) for 1s
  1s: posAnchor to (50, 50) for 1s
  2s: scale to 0.5 fit for 1s
*/
class AnimateLineOpening extends InstructionLine {
    constructor() {
        super();
        this.setAreas("Animate", this.createEditable(""));
        this.elm.class("control");
    }
}

class AnimatePosEventLine extends InstructionLine {
    constructor() {
        super();
        this.setAreas(
            this.createEditable(0),
            "s: pos to",
            "(", this.createEditable(50),
            ", ",
            this.createEditable(50),
            ") for ",
            this.createEditable(1),
            "s"
        );
        this.elm.class("control");
    }
}
