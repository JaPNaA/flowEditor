import { Editable } from "./Editable.js";
import { ControlBranch, ControlEnd, ControlInput, ControlJump, ControlVariable, isControlItem } from "../FlowRunner.js";
import { InstructionGroupEditor } from "./InstructionGroupEditor.js";
import { TextareaUserInputCaptureAreas, UserInputEvent } from "./TextareaUserInputCapture.js";
import { Component, Elm } from "../japnaaEngine2d/JaPNaAEngine2d.js";
import { getAncestorWhich } from "../utils.js";
import { pluginHooks } from "../index.js";

export abstract class Instruction {
    public parentGroup!: InstructionGroupEditor;
    protected lines: InstructionLine[] = [];

    public static fromData(data: any): Instruction {
        let instruction;

        if (!isControlItem(data)) {
            // not control, check if plugin recognizes
            instruction = pluginHooks.parseInstruction(data);
            if (instruction) {
                return instruction;
            } else {
                return new InstructionOneLine(new JSONLine(data));
            }
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
            default:
                // unknown control
                return new InstructionOneLine(new JSONLine(data));
        }
    }

    /** Return a list of flow control items that perform this instruction */
    public abstract export(): any[];

    /** Return a JSON object that can be used to reconstruct this instruction. */
    public abstract serialize(): any;

    /** Try to remove a line in instruction. Returns true if removed. */
    public abstract removeLine(line: InstructionLine): boolean;

    /**
     * Request inserting a line at (absolute) index.
     * Return true if handled (inserted instruction).
     * If returns false, lets the parent group handle the line insertion.
     */
    public abstract insertLine(index: number): boolean;

    public getIndex() {
        return this.parentGroup.getInstructions().indexOf(this);
    }

    public getLines(): ReadonlyArray<InstructionLine> {
        return this.lines;
    }

    public _setParent(group: InstructionGroupEditor) {
        this.parentGroup = group;
    }

    public requestSelectInstructionGroup(): Promise<InstructionGroupEditor | null> {
        return this.parentGroup.parentEditor.requestSelectInstructionGroup();
    }

    public isBranch() {
        return false; // this.view instanceof BranchInstructionLineView;
    }

    public getBranchTargets(): (InstructionGroupEditor | null)[] | null {
        return null;
    }

    public setBranchTargets(_targets: (InstructionGroupEditor | null)[] | null) { }

    public setBranchOffsets(_offsets: (number | null)[]) {
        return;
    }

    protected addLine(line: InstructionLine) {
        this.lines.push(line);
        line._setParent(this);
    }
}

export abstract class InstructionLine extends Component {
    public preferredStartingCharOffset = 0;
    public parentInstruction!: Instruction;

    private areas: TextareaUserInputCaptureAreas = [];
    private spanToEditable = new Map<HTMLSpanElement, Editable>();
    private editables: Editable[] = [];

    constructor() {
        super("instructionLine");
    }

    public _setParent(instruction: Instruction) {
        this.parentInstruction = instruction;
    }

    public getEditableIndexFromSelection(selection: Selection): number {
        const editable = this.getEditableFromSelection(selection);
        if (!editable) { return -1; }
        return this.editables.indexOf(editable);
    }

    public getEditableFromSelection(selection: Selection): Editable | null {
        const thisElm = this.elm.getHTMLElement();
        let directChild = getAncestorWhich(
            selection.anchorNode, node => node.parentElement === thisElm
        ) as Node | Element | null;

        // search backwards
        let curr = directChild;
        while (curr) {
            const editable = this.spanToEditable.get(curr as HTMLSpanElement);
            curr = curr.previousSibling;
            if (editable) {
                return editable;
            }
        }

        // search forwards
        curr = directChild;
        while (curr) {
            const editable = this.spanToEditable.get(curr as HTMLSpanElement);
            curr = curr.nextSibling;
            if (editable) {
                return editable;
            }
        }

        return null;
    }

    public getAreas(): TextareaUserInputCaptureAreas {
        return this.areas;
    }

    protected setAreas(...elements: (string | Editable)[]) {
        let lastStringLength = 0;
        this.areas = [];

        for (const element of elements) {
            if (typeof element === "string") {
                lastStringLength += element.length;
            } else {
                if (lastStringLength) {
                    this.areas.push(lastStringLength);
                    lastStringLength = 0;
                }
                this.areas.push(element);
            }
            this.elm.append(element);
        }
    }

    protected createEditable(text: string | number): Editable {
        const editable = new Editable(text.toString());
        this.registerEditable(editable);
        return editable;
    }

    protected registerEditable<T extends Editable>(editable: T): T {
        this.spanToEditable.set(editable.getHTMLElement(), editable);
        this.editables.push(editable);
        return editable;
    }

    public getEditableFromIndex(index: number) {
        return this.editables[index];
    }

    public getLastEditableIndex() {
        return this.editables.length - 1;
    }

    public getLastEditableCharacterIndex() {
        return this.editables[this.editables.length - 1].getValue().length;
    }

    public getCurrentLine() {
        return this.parentInstruction.parentGroup.getLines().indexOf(this);
    }
}

export interface OneLineInstruction extends InstructionLine {
    serialize(): any;
    isBranch: boolean;
}

/**
 * One-line instruction. Allows conviently declaring Instruction and it's line
 * in one class.
 */
export class InstructionOneLine<T extends OneLineInstruction> extends Instruction {
    protected line: T;

    constructor(line: T) {
        super();
        this.line = line;
        this.addLine(line);
    }

    public getBranchTargets(): InstructionGroupEditor[] | null {
        if (this.line instanceof BranchInstructionLine) {
            const branchTarget = this.line.getBranchTarget();
            if (branchTarget) {
                return [branchTarget];
            }
        }
        return null;
    }

    public setBranchTargets(targets: (InstructionGroupEditor | null)[] | null): void {
        if (this.line instanceof BranchInstructionLine) {
            this.line.setBranchTarget(targets && targets[0]);
        } else {
            throw new Error("Not a branch");
        }
    }

    public setBranchOffsets(offsets: (number | null)[]): any {
        if (this.line instanceof BranchInstructionLine) {
            return this.line.setBranchOffset(offsets[0] || 1);
        } else {
            throw new Error("Not a branch");
        }
    }

    public isBranch(): boolean {
        return this.line.isBranch;
    }

    public removeLine(line: InstructionLine): boolean {
        if (this.line !== line) { throw new Error("Not a line in this instruction"); }
        this.parentGroup._removeInstruction(this.getIndex());
        this.parentGroup._removeInstructionLine(this.line.getCurrentLine());
        return true;
    }

    public insertLine(_lineIndex: number): boolean {
        return false;
    }

    public serialize(): any {
        return this.line.serialize();
    }

    public export(): any[] {
        return [this.serialize()];
    }
}

export abstract class BranchInstructionLine extends InstructionLine {
    public branchTarget: InstructionGroupEditor | null = null;
    public branchOffset: number = 0;

    private branchConnectElm: Elm;

    constructor() {
        super();
        this.elm.append(this.branchConnectElm =
            new Elm().class("branchConnect").on("click", () => {
                this.parentInstruction.parentGroup.parentEditor.cursor.setPosition({
                    group: this.parentInstruction.parentGroup,
                    char: 0,
                    editable: 0,
                    line: this.getCurrentLine()
                });
                this.branchConnectElm.class("active");
                this.parentInstruction.requestSelectInstructionGroup()
                    .then(editor => {
                        this.branchConnectElm.removeClass("active");
                        if (editor) {
                            this.setBranchTarget(editor);
                        }
                    });
            }));
    }

    public getBranchTarget() {
        return this.branchTarget;
    }

    public setBranchOffset(branchOffset: number) {
        this.branchOffset = branchOffset;
    }

    public setBranchTarget(target: InstructionGroupEditor | null) {
        this.branchTarget = target;
    }
}

class JSONLine extends InstructionLine implements OneLineInstruction {
    private editable: JSONLineEditable;
    public preferredStartingCharOffset = 1;
    public isBranch: boolean = false;

    constructor(data: any) {
        super();
        this.elm.append(this.editable = this.registerEditable(
            new JSONLineEditable(JSON.stringify(data))
        ));
        this.editable.setParentLine(this);
    }


    public serialize(): any {
        return JSON.parse(this.editable.getValue());
    }

    public getAreas(): TextareaUserInputCaptureAreas {
        return [this.editable];
    }
}

class JSONLineEditable extends Editable {
    private newlineDetected = false;
    private parentLine!: InstructionLine;

    public setParentLine(parentLine: InstructionLine) {
        this.parentLine = parentLine;
    }

    public checkInput(event: UserInputEvent): void {
        if (event.added.includes("\n")) {
            const value = this.getValue();
            // support for multiline paste only if JSONLine is a string
            if (value[0] === '"' && value[value.length - 1] === '"') {
                this.newlineDetected = true;
            } else {
                event.reject();
            }
        }
    }

    public afterChangeApply(): void {
        if (!this.newlineDetected) { return; }
        this.newlineDetected = false;

        const lines = this.getValue()
            .slice(1, -1)
            .split("\n");
        this.setValue(JSON.stringify(lines[0]));

        const parentGroup = this.parentLine.parentInstruction.parentGroup;
        const currentPosition = this.parentLine.parentInstruction.getIndex();
        let i;
        for (i = 1; i < lines.length; i++) {
            console.log(lines[i]);
            parentGroup.insertInstruction(
                new InstructionOneLine(
                    new JSONLine(lines[i])
                ),
                currentPosition + i
            );
        }

        this.replaceContents(this.getValue());
        parentGroup.parentEditor.cursor.setPosition({
            group: parentGroup,
            line: this.parentLine.getCurrentLine() + i - 1,
            editable: 0,
            char: lines[i - 1].length + 1 // +1 for left quote only
        });
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

        if (data.op == "=") { this.opSpan.class("eq"); }
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
    public isBranch: boolean = true;

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

export class NewInstruction extends InstructionOneLine<NewInstructionLine> {
    constructor() {
        super(new NewInstructionLine());
    }

    public insertLine(_lineIndex: number): boolean {
        this.line.splitGroupHere();
        return true;
    }
}

class NewInstructionLine extends InstructionLine implements OneLineInstruction {
    private editable: Editable;
    public isBranch: boolean = false;

    constructor() {
        super();

        this.elm.class("newInstructionLine");
        this.elm.append(
            // this.editable = this.createEditable("Press one of [ibjved]...")
            this.editable = this.registerEditable(new NewInstructionEditable()),
            `Press one of [divceg${pluginHooks.getKeyInstructionMappingKeys().join("")}]...`
        );

        this.editable.onChange.subscribe(changes => {
            let newView: OneLineInstruction;
            switch (changes.newContent && changes.newContent[0].toLowerCase()) {
                // case "b":
                case "i":
                    newView = new ControlBranchLine({
                        ctrl: "branch",
                        offset: 1,
                        op: "=",
                        // v1: "v1",
                        v1: "choice",
                        // v2: "v2"
                        v2: "0"
                    });
                    break;
                // case "i":
                case "c":
                    newView = new ControlInputLine({
                        ctrl: "input",
                        options: ["option"],
                        variable: "choice"
                    });
                    break;
                // case "j":
                case "g":
                    newView = new ControlJumpLine();
                    break;
                case "e":
                    newView = new ControlEndLine();
                    break;
                case "v":
                    newView = new ControlVariableLine({
                        ctrl: "variable",
                        op: "=",
                        v1: "v1",
                        v2: "v2"
                    });
                    break;
                case "d":
                    newView = new JSONLine("");
                    break;
                case "\n":
                    this.splitGroupHere();
                    return;
                default:
                    changes.reject(); // prevent updating
                    if (!changes.newContent) { return; }
                    const instruction = pluginHooks.getInstructionFromKeyMappingKey(
                        changes.newContent[0].toLowerCase()
                    );
                    if (instruction) {
                        this.changeView(instruction);
                    }
                    return;
            }

            this.changeView(new InstructionOneLine(newView));
        });
    }

    public splitGroupHere() {
        const index = this.parentInstruction.getIndex();
        this.parentInstruction.removeLine(this);
        const newGroup = this.parentInstruction.parentGroup.splitAtInstruction(index);
        if (newGroup.getInstructions().length === 0) {
            newGroup.requestNewLine(0);
        }
    }

    public splitAfterIfNeeded(thisIndex: number) {
        const nextInstruction = this.parentInstruction.parentGroup.getInstructions()[thisIndex + 1];

        if (nextInstruction && !nextInstruction.isBranch()) {
            this.parentInstruction.parentGroup.splitAtInstruction(thisIndex + 1);
        }
    }

    public serialize() {
        return { ctrl: "nop" };
    }

    public getAreas(): TextareaUserInputCaptureAreas {
        return [this.editable];
    }

    public changeView(instruction: Instruction) {
        const currentLine = this.getCurrentLine();
        const currentInstructionIndex = this.parentInstruction.getIndex();
        const position = this.parentInstruction.parentGroup.parentEditor.cursor.getPosition();
        this.parentInstruction.parentGroup.requestRemoveLine(currentLine);
        this.parentInstruction.parentGroup.insertInstruction(
            instruction, currentInstructionIndex
        );

        if (position) {
            this.parentInstruction.parentGroup.parentEditor.cursor.setPosition({
                ...position,
                char: instruction.getLines()[0].preferredStartingCharOffset
            });
        }

        if (instruction.isBranch()) {
            this.splitAfterIfNeeded(currentLine);
        }
    }
}

class NewInstructionEditable extends Editable {
    constructor() {
        super("");
    }

    public checkInput(event: UserInputEvent): void {
        // allow all
        this.onChange.send(event);
    }
}