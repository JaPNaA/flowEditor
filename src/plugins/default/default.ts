import { ControlBranch, ControlEnd, ControlInput, ControlJump, ControlVariable, isControlItem } from "../../FlowRunner.js";
import { AutoCompleteSuggester, globalAutocompleteTypes } from "../../editor/editor/editing/AutoComplete.js";
import { Editable } from "../../editor/editor/editing/Editable.js";
import { TextareaUserInputCaptureAreas } from "../../editor/editor/editing/TextareaUserInputCapture.js";
import { InstructionBlueprintMin } from "../../editor/editor/instruction/InstructionBlueprintRegistery.js";
import { JSONInstruction } from "../../editor/editor/instruction/JSONInstruction.js";
import { NewInstruction } from "../../editor/editor/instruction/NewInstruction.js";
import { BranchInstructionLine, Instruction, InstructionLine, InstructionOneLine, OneLineInstruction } from "../../editor/editor/instruction/instructionTypes.js";
import { EditorPlugin } from "../../editor/EditorPlugin.js";

const autocompleteTypeCompareOp = Symbol();

export class DefaultPlugin implements EditorPlugin {
    name = "Default";

    instructionBlueprints: InstructionBlueprintMin[] = [{
        instructionName: "if",
        description: "Goto somewhere if a variable satisfies a condition",
        shortcutKey: "KeyI",
        create: () => new InstructionOneLine(new ControlBranchLine({
            ctrl: "branch",
            offset: 1,
            op: "=",
            v1: "choice",
            v2: 1
        }))
    }, {
        instructionName: "input",
        description: "Give a choice and save it in a variable",
        shortcutKey: "KeyJ",
        create: () => new InstructionOneLine(new ControlInputLine({
            ctrl: "input",
            options: ["option"],
            variable: "choice"
        }))
    }, {
        instructionName: "goto",
        description: "Continue in at a different instruction",
        shortcutKey: "KeyG",
        create: () => new InstructionOneLine(new ControlJumpLine())
    }, {
        instructionName: "end",
        description: "End the flow",
        shortcutKey: "KeyE",
        create: () => new InstructionOneLine(new ControlEndLine())
    }, {
        instructionName: "variable",
        description: "Change a variable's value",
        shortcutKey: "KeyV",
        create: () => new InstructionOneLine(new ControlVariableLine({
            ctrl: "variable",
            op: "=",
            v1: "v1",
            v2: 1
        }))
    }, {
        instructionName: "default",
        create: () => new JSONInstruction("")
    }];

    autocomplete: [symbol, AutoCompleteSuggester][] = [
        [autocompleteTypeCompareOp, {
            learn() { },
            unlearn() { },
            suggest(editable) {
                if (editable.getValue() && !editable.placeholder) { return null; }
                return [{
                    title: "=",
                    fill: "=",
                }, {
                    title: "<",
                    fill: "<"
                }, {
                    title: "<=",
                    fill: "<="
                }];
            },
        }]
    ]

    parse(data: any): Instruction | undefined {
        if (!isControlItem(data)) {
            return;
        }

        switch (data.ctrl) {
            case "branch":
                return new InstructionOneLine(new ControlBranchLine(data));
            case "jump":
                return new InstructionOneLine(new ControlJumpLine());
            case "end":
                return new InstructionOneLine(new ControlEndLine());
            case "input":
                return new InstructionOneLine(new ControlInputLine(data));
            case "variable":
                return new InstructionOneLine(new ControlVariableLine(data));
            case "nop":
                return new NewInstruction();
        }
    }
}

class ControlBranchLine extends BranchInstructionLine implements OneLineInstruction {
    private opSpan: Editable;
    private v1Span: Editable;
    private v2Span: Editable;

    public isBranch: boolean = true;

    constructor(data: ControlBranch) {
        super();

        this.elm.append(
            "If ",
            this.v1Span = this.createEditable(data.v1),
            " ",
            this.opSpan = this.createEditable(data.op).class("op"),
            " ",
            this.v2Span = this.createEditable(data.v2),
            ", goto..."
        ).class("jump");
        this.opSpan.autoCompleteType = autocompleteTypeCompareOp;
        this.v1Span.autoCompleteType = globalAutocompleteTypes.variable;
        this.v2Span.autoCompleteType = globalAutocompleteTypes.variable;
    }

    public serialize(): ControlBranch {
        let v1: string | number = this.v1Span.getValue();
        let v1Float = parseFloat(v1);
        let v2: string | number = this.v2Span.getValue();
        let v2Float = parseFloat(v2);
        let op = this.opSpan.getValue();

        if (!isNaN(v1Float)) { v1 = v1Float; }
        if (!isNaN(v2Float)) { v2 = v2Float; }
        if (op !== '=' && op !== '<' && op != '<=') { throw new Error("Invalid"); }
        return {
            ctrl: "branch",
            op, v1, v2,
            offset: this.branchOffset
        };
    }

    public getAreas(): TextareaUserInputCaptureAreas {
        return [3, this.v1Span, 1, this.opSpan, 1, this.v2Span];
    }
}


class ControlJumpLine extends BranchInstructionLine implements OneLineInstruction {
    private editable = this.createEditable('');
    public isBranch = true;
    public isAlwaysJump = true;

    constructor() {
        super();
        this.elm.append('Goto...', this.editable).class("jump");
    }

    public serialize(): ControlJump {
        return { ctrl: 'jump', offset: this.branchOffset };
    }

    public getAreas(): TextareaUserInputCaptureAreas {
        return [7, this.editable];
    }
}


class ControlEndLine extends InstructionLine implements OneLineInstruction {
    private editable = this.createEditable('');
    public isBranch: boolean = false;

    constructor() {
        super();
        this.elm.append('End', this.editable).class("control");
    }

    public serialize(): ControlEnd {
        return { ctrl: 'end' };
    }

    public getAreas(): TextareaUserInputCaptureAreas {
        return [3, this.editable];
    }
}


class ControlInputLine extends InstructionLine implements OneLineInstruction {
    private variableSpan: Editable;
    private choicesSpan: Editable;
    public isBranch: boolean = false;

    constructor(data: ControlInput) {
        super();
        this.elm.append(
            this.variableSpan = this.createEditable(data.variable),
            ' <- choose from [',
            this.choicesSpan = this.createEditable(data.options.join(", ")),
            ']'
        ).class("control");

        this.variableSpan.autoCompleteType = globalAutocompleteTypes.variable;
    }

    public serialize(): ControlInput {
        return {
            ctrl: 'input',
            options: this.choicesSpan.getValue().split(",").map(e => e.trim()),
            variable: this.variableSpan.getValue()
        };
    }

    public getAreas(): TextareaUserInputCaptureAreas {
        return [this.variableSpan, 17, this.choicesSpan];
    }
}


class ControlVariableLine extends InstructionLine implements OneLineInstruction {
    public isBranch: boolean = false;

    private static expressionRegex = /^\s*([-+*])\s*([^+*]+)\s*$/;
    private static warningRegex = /^\s*\//;
    private variableSpan: Editable;
    private expressionSpan: Editable;

    constructor(data: ControlVariable) {
        super();
        this.variableSpan = this.createEditable(data.v1);
        this.variableSpan.autoCompleteType = globalAutocompleteTypes.variable;
        let op: string = data.op;
        let v2 = data.v2;

        if (op === "+" && typeof v2 === "number" && v2 < 0) {
            v2 *= -1;
            op = "-";
        }

        this.expressionSpan = this.createEditable(
            data.op === "=" ?
                data.v2 : `${op}${v2}`
        );
        this.elm.append(this.variableSpan, " <- ", this.expressionSpan).class("control");
    }

    public serialize(): ControlVariable {
        const expression = this.expressionSpan.getValue();
        const match = expression.match(ControlVariableLine.expressionRegex);
        const v1 = this.variableSpan.getValue().trim();
        if (expression.match(ControlVariableLine.warningRegex)) {
            console.warn("Cannot divide (/) in a variable line");
        }

        if (match) {
            let op = match[1];
            let v2 = this.stringToNumberIfIs(match[2]);
            if (op === "-") {
                if (typeof v2 === "string") {
                    throw new Error("Cannot subtract variables. Please *-1 and then +");
                }
                op = "+";
                v2 *= -1;
            }

            return {
                ctrl: "variable",
                v1: v1,
                op: op as "+" | "*",
                v2: v2
            };
        } else {
            return {
                ctrl: "variable",
                v1: v1,
                op: "=",
                v2: this.stringToNumberIfIs(expression.trim())
            };
        }
    }

    private stringToNumberIfIs(str: string): string | number {
        if (str.match(/^-?\d+(\.\d*)?$/)) {
            return parseFloat(str);
        } else {
            return str;
        }
    }

    public getAreas(): TextareaUserInputCaptureAreas {
        return [this.variableSpan, 4, this.expressionSpan];
    }
}