import { Editable } from "./Editable.js";
import { ControlBranch, ControlEnd, ControlInput, ControlJump, ControlVariable, isControlItem } from "../FlowRunner.js";
import { InstructionGroupEditor } from "./InstructionGroupEditor.js";
import { TextareaUserInputCaptureAreas, UserInputEvent } from "./TextareaUserInputCapture.js";
import { Component, Elm } from "../japnaaEngine2d/JaPNaAEngine2d.js";
import { getAncestorWhich } from "../utils.js";

export class InstructionLine extends Component {
    public parentGroup!: InstructionGroupEditor;

    constructor(private view: InstructionLineView) {
        super("instructionLine");
        this.view._setParent(this);
        this.elm.append(this.view);
    }

    public _setParent(parent: InstructionGroupEditor) {
        this.parentGroup = parent;
    }

    public static fromInstruction(data: any): InstructionLine {
        if (!isControlItem(data)) {
            return new InstructionLine(new JSONLine(data));
        }

        let view;
        switch (data.ctrl) {
            case "branch":
                view = new ControlBranchLine(data);
                break;
            case "jump":
                view = new ControlJumpLine(data);
                break;
            case "end":
                view = new ControlEndLine(data);
                break;
            case "input":
                view = new ControlInputLine(data);
                break;
            case "variable":
                view = new ControlVariableLine(data);
                break;
            case "nop":
                view = new NewInstructionLine();
                break;
            default:
                view = new JSONLine(data);
        }

        const newLine = new InstructionLine(view);

        return newLine;
    }

    public requestSelectInstructionGroup(): Promise<InstructionGroupEditor | null> {
        return this.parentGroup.parentEditor.requestSelectInstructionGroup();
    }

    public isBranch() {
        return this.view instanceof BranchInstructionLineView;
    }

    public getBranchTarget() {
        if (!(this.view instanceof BranchInstructionLineView)) { throw new Error("Not a branch"); }
        return this.view.branchTarget;
    }

    public exportWithBranchOffset(branchOffset: number) {
        if (!(this.view instanceof BranchInstructionLineView)) { throw new Error("Not a branch"); }
        this.view.branchOffset = branchOffset;
        return this.view.serialize();
    }

    public export() {
        return this.view.serialize();
    }

    public setBranchTarget(target: InstructionGroupEditor | null) {
        if (!(this.view instanceof BranchInstructionLineView)) { throw new Error("Not a branch"); }
        if (target) {
            this.view.branchTarget = target;
        } else {
            this.view.branchTarget = undefined;
        }
    }

    public changeView(view: InstructionLineView) {
        this.view = view;
        this.view._setParent(this);
        this.elm.replaceContents(view);

        const position = this.parentGroup.parentEditor.cursor.getPosition();
        if (position) {
            this.parentGroup.parentEditor.cursor.setPosition({
                ...position,
                char: view.preferredStartingCharOffset
            });
        }
    }

    public serialize() {
        return this.view.serialize();
    }

    public getEditableIndexFromSelection(selection: Selection) {
        return this.view.getEditableIndexFromSelection(selection);
    }

    public getEditableFromIndex(index: number) {
        return this.view.editables[index];
    }

    public getLastEditableIndex() {
        return this.view.editables.length - 1;
    }

    public getLastEditableCharacterIndex() {
        return this.view.editables[this.view.editables.length - 1].getValue().length;
    }

    public getCurrentLine() {
        return this.parentGroup.getLines().indexOf(this);
    }

    public getAreas(): TextareaUserInputCaptureAreas {
        return this.view.getAreas();
    }
}

abstract class InstructionLineView extends Component {
    protected parent!: InstructionLine;

    public spanToEditable = new Map<HTMLSpanElement, Editable>();
    public editables: Editable[] = [];
    public preferredStartingCharOffset = 0;

    public _setParent(parent: InstructionLine) { this.parent = parent; }

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

    public abstract serialize(): any;

    public getAreas(): TextareaUserInputCaptureAreas {
        return [];
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
}

abstract class BranchInstructionLineView extends InstructionLineView {
    public branchTarget?: InstructionGroupEditor;
    public branchOffset: number = 0;

    private branchConnectElm: Elm;

    constructor(name: string) {
        super(name);
        this.elm.append(this.branchConnectElm =
            new Elm().class("branchConnect").on("click", () => {
                this.parent.parentGroup.parentEditor.cursor.setPosition({
                    group: this.parent.parentGroup,
                    char: 0,
                    editable: 0,
                    line: this.parent.getCurrentLine()
                });
                this.branchConnectElm.class("active");
                this.parent.requestSelectInstructionGroup()
                    .then(editor => {
                        this.branchConnectElm.removeClass("active");
                        if (editor) {
                            this.setBranchTarget(editor);
                        }
                    });
            }));
    }

    private setBranchTarget(editor: InstructionGroupEditor) {
        this.branchTarget = editor;
    }
}

class JSONLine extends InstructionLineView {
    private editable: JSONLineEditable;
    public preferredStartingCharOffset = 1;

    constructor(private data: any) {
        super("jsonLine");
        this.elm.append(this.editable = this.registerEditable(
            new JSONLineEditable(JSON.stringify(data))
        ));
    }

    public _setParent(parent: InstructionLine): void {
        super._setParent(parent);
        this.editable.setParentLine(parent);
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
    private surroundingChar = "";
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

        const parentGroup = this.parentLine.parentGroup;
        const currentPosition = this.parentLine.getCurrentLine();
        let i;
        for (i = 1; i < lines.length; i++) {
            console.log(lines[i]);
            parentGroup.insertInstructionLine(
                new InstructionLine(
                    new JSONLine(lines[i])
                ),
                currentPosition + i
            );
        }

        this.replaceContents(this.getValue());
        parentGroup.parentEditor.cursor.setPosition({
            group: parentGroup,
            line: currentPosition + i - 1,
            editable: 0,
            char: lines[i - 1].length + 1 // +1 for left quote only
        });
    }
}



class ControlBranchLine extends BranchInstructionLineView {
    private opSpan: Editable;
    private v1Span: Editable;
    private v2Span: Editable;

    constructor(data: ControlBranch) {
        super("controlBranchLine");

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


class ControlJumpLine extends BranchInstructionLineView {
    private editable = this.createEditable('');

    constructor(data: ControlJump) {
        super("controlJumpLine");
        this.elm.append('Goto...', this.editable).class("jump");
    }

    public serialize(): ControlJump {
        return { ctrl: 'jump', offset: this.branchOffset };
    }

    public getAreas(): TextareaUserInputCaptureAreas {
        return [7, this.editable];
    }
}


class ControlEndLine extends InstructionLineView {
    private editable = this.createEditable('');

    constructor(data: ControlEnd) {
        super("controlEndLine");
        this.elm.append('End', this.editable).class("control");
    }


    public serialize(): ControlEnd {
        return { ctrl: 'end' };
    }

    public getAreas(): TextareaUserInputCaptureAreas {
        return [3, this.editable];
    }
}


class ControlInputLine extends InstructionLineView {
    private variableSpan: Editable;
    private choicesSpan: Editable;

    constructor(data: ControlInput) {
        super("controlInputLine");
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


class ControlVariableLine extends InstructionLineView {
    private variableSpan: Editable;
    private expressionSpan: Editable;

    constructor(private data: ControlVariable) {
        super("controlVariableLine");
        this.variableSpan = this.createEditable(data.v1);
        this.expressionSpan = this.createEditable(
            data.op === "=" ?
                data.v2 : `${data.v1} ${data.op} ${data.v2}`
        );
        this.elm.append(this.variableSpan, " <- ", this.expressionSpan).class("control");
    }

    public serialize(): ControlVariable {
        console.warn("control variable serialize not implemented");
        return this.data;
    }

    public getAreas(): TextareaUserInputCaptureAreas {
        return [this.variableSpan, 4, this.expressionSpan];
    }
}

export class NewInstructionLine extends InstructionLineView {
    private editable: Editable;

    constructor() {
        super("newInstructionLine");

        this.elm.append(
            // this.editable = this.createEditable("Press one of [ibjved]...")
            this.editable = this.createEditable("Press one of [divceg]...")
        );

        this.editable.onChange.subscribe(changes => {
            changes.reject(); // prevent updating
            let newView;
            switch (changes.added && changes.added[0].toLowerCase()) {
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
                    newView = new ControlJumpLine({
                        ctrl: "jump",
                        offset: 1
                    });
                    break;
                case "e":
                    newView = new ControlEndLine({ ctrl: "end" });
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
                default:
                    return;
            }

            this.parent.changeView(newView);
        });
    }

    public serialize() {
        return { ctrl: "nop" };
    }

    public getAreas(): TextareaUserInputCaptureAreas {
        return [this.editable];
    }
}