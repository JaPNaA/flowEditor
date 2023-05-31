import { ControlBranch, ControlEnd, ControlInput, ControlJump, ControlVariable, FlowData, FlowRunner, isControlItem } from "./FlowRunner.js";
import { Component, Elm, EventBus, Hitbox, ParentComponent, RectangleM, SubscriptionsComponent, WorldElm, WorldElmWithComponents } from "./japnaaEngine2d/JaPNaAEngine2d.js";
import { JaPNaAEngine2d } from "./japnaaEngine2d/JaPNaAEngine2d.js";

class Editor extends WorldElmWithComponents {
    private parentComponent = this.addComponent(new ParentComponent());
    private subscriptions = this.addComponent(new SubscriptionsComponent());
    private draggingInstructionRectangle?: InstructionGroupEditor;
    private draggingCamera = false;

    private instructionElms: InstructionGroupEditor[] = [];

    public childFocused = new EventBus<InstructionGroupEditor>();

    public _setEngine(engine: JaPNaAEngine2d): void {
        super._setEngine(engine);
        this.subscriptions.subscribe(this.engine.mouse.onMousedown, this.mousedownHandler);
        this.subscriptions.subscribe(this.engine.mouse.onMousemove, this.mousemoveHandler);
        this.subscriptions.subscribe(this.engine.mouse.onMouseup, this.mouseupHandler);
        this.subscriptions.subscribe(this.engine.keyboard.getKeydownBus("KeyA"), this.addRectangleHandler);
    }

    private mousedownHandler() {
        const collisions = this.engine.collisions.getCollisionsWith(
            new RectangleM(this.engine.mouse.worldPos.x, this.engine.mouse.worldPos.y, 1, 1)
        );
        for (const collision of collisions) {
            if (collision.elm instanceof InstructionGroupEditor) {
                this.draggingInstructionRectangle = collision.elm;
                return;
            }
        }

        // no hits
        this.draggingCamera = true;
    }

    private mousemoveHandler(ev: MouseEvent) {
        if (this.draggingInstructionRectangle) {
            this.draggingInstructionRectangle.rect.x += ev.movementX;
            this.draggingInstructionRectangle.rect.y += ev.movementY;
        } else if (this.draggingCamera) {
            this.engine.camera.move(-ev.movementX, -ev.movementY);
        }
    }

    private mouseupHandler() {
        this.draggingInstructionRectangle = undefined;
        this.draggingCamera = false;
    }

    private addRectangleHandler() {
        const newData = newInstructionData();
        const newEditor = new InstructionGroupEditor(this, newData);
        newEditor.rect.x = this.engine.mouse.worldPos.x;
        newEditor.rect.y = this.engine.mouse.worldPos.y;
        this.parentComponent.addChild(newEditor);
        this.instructionElms.push(newEditor);
        newEditor.insertNewInstructionLine(0);
    }

    public requestSelectInstructionGroup(): Promise<InstructionGroupEditor | null> {
        return this.childFocused.promise();
    }

    public setInstructions(instructionsData: InstructionData[]) {
        const instructionToElmMap = new Map<InstructionData, InstructionGroupEditor>();
        for (const instruction of instructionsData) {
            const elm = new InstructionGroupEditor(this, instruction);
            this.parentComponent.addChild(elm);
            instructionToElmMap.set(instruction, elm);
            this.instructionElms.push(elm);
        }

        for (const [instruction, elm] of instructionToElmMap) {
            for (const child of instruction.children) {
                elm.addBranchTarget(instructionToElmMap.get(child)!);
            }
        }
    }

    public deserialize(data: EditorSaveData) {
        const idElmMap = new Map<number, InstructionGroupEditor>();
        for (const elmData of data.elms) {
            const instructionData = newInstructionData();
            instructionData.instructions = elmData.instructions;
            instructionData.branches = elmData.branches;
            instructionData.x = elmData.x;
            instructionData.y = elmData.y;

            const elm = new InstructionGroupEditor(this, instructionData);
            idElmMap.set(elmData.id, elm);
            this.instructionElms.push(elm);
            this.parentComponent.addChild(elm);
        }

        for (const elmData of data.elms) {
            for (const child of elmData.children) {
                idElmMap.get(elmData.id)!.addBranchTarget(idElmMap.get(child)!);
            }
        }
    }

    public serialize(): EditorSaveData {
        const uidGen = new UIDGenerator();
        const elms = [];
        for (const elm of this.instructionElms) {
            elms.push(elm.serialize(uidGen));
        }
        return { elms: elms };
    }
}

interface EditorSaveData {
    elms: InstructionElmData[];
}

interface InstructionElmData {
    id: number;
    instructions: any[],
    branches: any[],
    children: number[];
    x: number;
    y: number;
}

class UIDGenerator {
    private count = 0;
    private map = new WeakMap();

    getId(object: any) {
        const existing = this.map.get(object);
        if (existing !== undefined) {
            return existing;
        } else {
            const id = this.count++;
            this.map.set(object, id);
            return id;
        }
    }
}

class EditorCursor extends Elm<"span"> {
    public inputCapture = new TextareaUserInputCapture(this);

    constructor() {
        super();
        this.class("cursor");
    }
}

class InstructionGroupEditor extends WorldElm {
    private static fontSize = 16;
    private static collisionType = Symbol();

    private rendered = false;
    private branchTargets: InstructionGroupEditor[] = [];
    private lines: InstructionLine[] = [];
    private htmlInstructionLineToJS = new WeakMap<HTMLDivElement, InstructionLine>();
    private activeLine: number = -1;
    private elm: Elm;

    private cursorElm = new EditorCursor();

    public collisionType = InstructionGroupEditor.collisionType;

    constructor(public readonly parentEditor: Editor, private data: InstructionData) {
        super();
        this.rect.x = data.x;
        this.rect.y = data.y;

        this.elm = new Elm().class("instructionElm");
        this.elm.attribute("tabindex", "-1");
        this.elm.on("input", () => this.updateHeight());
        this.cursorElm.inputCapture.appendTo(this.elm);

        document.addEventListener("selectionchange", e => {
            if (!e.isTrusted) { return; } // prevent self-caused selection changes

            // must be in this.elm
            const selection = getSelection();
            if (!selection || !isAncestor(selection.anchorNode || null, this.elm.getHTMLElement())) { return; }
            if (isAncestor(selection.anchorNode || null, this.cursorElm.getHTMLElement())) { return; }

            this.parentEditor.childFocused.send(this);

            const instructionLine = getAncestorWhich(selection.anchorNode || null, (node) => node instanceof HTMLDivElement && node.classList.contains("instructionLine"))
            if (instructionLine) {
                const instructionLineElm = this.htmlInstructionLineToJS.get(instructionLine as HTMLDivElement);
                if (instructionLineElm) {
                    const index = this.lines.indexOf(instructionLineElm);
                    this.activeLine = index;
                    const newEditable = instructionLineElm.getEditableFromSelection(selection);
                    if (newEditable) {
                        const characterOffset = newEditable.getCharacterOffset(selection);
                        this.updateInputCapture();

                        newEditable.setActive(characterOffset, this.cursorElm);
                        this.cursorElm.inputCapture.setPositionOnCurrentLine(newEditable, characterOffset);
                        this.cursorElm.inputCapture.focus();
                    }
                }
            }
        });

        this.cursorElm.inputCapture.setChangeHandler(this.updateCursorPosition.bind(this));

        this.cursorElm.inputCapture.onInput.subscribe(ev => {
            if (ev.added.includes("\n")) {
                this.insertLineAndUpdateCursor(this.activeLine + 1);
            }
        });

        this.cursorElm.inputCapture.onLineDelete.subscribe(ev => {
            let targetLine = this.activeLine;
            if (ev.isNextLine) { targetLine++ }
            if (ev.isInsert) {
                this.insertLineAndUpdateCursor(targetLine);
            } else {
                this.removeInstructionLine(targetLine);
                this.updateInputCapture();
                const instructionLine = this.lines[this.activeLine];
                instructionLine.getEditableFromIndex(0).setActive(0, this.cursorElm);
                this.cursorElm.inputCapture.setPositionOnCurrentLine(0, 0);
            }
        });
    }

    private insertLineAndUpdateCursor(position: number) {
        this.activeLine = position;
        const instructionLine = this.insertNewInstructionLine(this.activeLine);
        this.updateInputCapture();
        instructionLine.getEditableFromIndex(0).setActive(0, this.cursorElm);
        this.cursorElm.inputCapture.setPositionOnCurrentLine(0, 0);
    }

    private updateCursorPosition(pos: TextareaUserInputCursorPosition) {
        if (this.activeLine < 0) { return; }
        if (pos[0] === "up") {
            this.activeLine--;
            if (this.activeLine < 0) { this.activeLine = 0; }
            this.updateInputCapture();
        }
        if (pos[0] === "down") {
            this.activeLine++;
            if (this.activeLine >= this.lines.length) {
                this.activeLine = this.lines.length - 1;
            }
            this.updateInputCapture();
        }
        if (pos[0] === "top") { this.activeLine = 0; this.updateInputCapture(); }
        if (pos[0] === "bottom") { this.activeLine = this.lines.length - 1; this.updateInputCapture(); }

        // pos[0] === 'same'
        this.activateEditableOnActiveLine(pos[1], pos[2], pos[3]);
    }

    public setCursorPositionStartOfCurrentLine() {
        this.cursorElm.inputCapture.setPositionOnCurrentLine(0, 0);
        const pos = this.cursorElm.inputCapture.getCurrentPosition();
        this.activateEditableOnActiveLine(0, 0, pos[3]);
    }

    private activateEditableOnActiveLine(editableIndex: number, characterOffset: number, editable_: Editable | undefined) {
        let editable = editable_;
        if (!editable_) {
            editable = this.lines[this.activeLine].getEditableFromIndex(editableIndex);
        }
        if (!editable) { throw new Error("Editable not found"); }

        editable.setActive(characterOffset, this.cursorElm);

        const cursorElm = this.cursorElm.getHTMLElement();
        this.cursorElm.inputCapture.setStyleTop(cursorElm.offsetTop + cursorElm.offsetHeight);
        this.cursorElm.inputCapture.focus();
    }

    public updateInputCapture() {
        if (this.activeLine - 1 >= 0) {
            this.cursorElm.inputCapture.setAboveLine(this.lines[this.activeLine - 1].getAreas());
        } else {
            this.cursorElm.inputCapture.setAboveLine([]);
        }
        if (this.activeLine >= 0) {
            this.cursorElm.inputCapture.setCurrentLine(this.lines[this.activeLine].getAreas());
        } else {
            this.cursorElm.inputCapture.setCurrentLine([]);
        }
        if (this.activeLine + 1 < this.lines.length) {
            this.cursorElm.inputCapture.setBelowLine(this.lines[this.activeLine + 1].getAreas());
        } else {
            this.cursorElm.inputCapture.setBelowLine([]);
        }

        this.cursorElm.inputCapture.update();
        this.cursorElm.inputCapture.focus();
    }

    public _setEngine(engine: JaPNaAEngine2d): void {
        super._setEngine(engine);
        this.engine.collisions.addHitbox(new Hitbox(this.rect, this));
        this.engine.htmlOverlay.elm.append(this.elm);
    }

    public remove(): void {
        super.remove();
        this.elm.remove();
    }

    public serialize(uidGen: UIDGenerator): InstructionElmData {
        const childrenUids = [];
        for (const child of this.branchTargets) {
            childrenUids.push(uidGen.getId(child));
        }

        return {
            id: uidGen.getId(this),
            instructions: this.lines.map(e => e.serialize()),
            branches: [],
            children: childrenUids,
            x: this.rect.x,
            y: this.rect.y
        };
    }

    public addBranchTarget(instructionRectangle: InstructionGroupEditor) {
        this.branchTargets.push(instructionRectangle);
    }

    public setBranchTarget(instruction: InstructionLine, instructionEditor: InstructionGroupEditor) {
        let index = -1;
        for (const line of this.lines) {
            if (line.isBranch()) {
                index++;
                if (line === instruction) {
                    this.branchTargets[index] = instructionEditor;
                    return;
                }
            }
        }
        throw new Error("Given instruction not in this.lines");
    }

    public draw(): void {
        const X = this.engine.canvas.X;
        const elm = this.elm.getHTMLElement();

        if (!this.rendered) {
            this.render();
        }

        X.fillStyle = "#ddd";
        X.fillRect(this.rect.x, this.rect.y, this.rect.width, this.rect.height);
        elm.style.top = this.rect.y + "px";
        elm.style.left = this.rect.x + "px";

        X.strokeStyle = "#000";
        for (const child of this.branchTargets) {
            X.beginPath();
            X.moveTo(this.rect.centerX(), this.rect.bottomY());
            X.lineTo(child.rect.centerX(), child.rect.y);
            X.stroke();
        }
    }

    private render() {
        const elm = this.elm.getHTMLElement();
        const font = `${InstructionGroupEditor.fontSize}px monospace`;
        elm.style.font = font;

        const width = 460;

        for (const instruction of this.data.instructions) {
            this.addInstructionLine(instruction);
        }

        for (const branch of this.data.branches) {
            this.addInstructionLine(branch);
        }

        this.rect.width = width;
        this.updateHeight();

        this.rendered = true;
    }

    private addInstructionLine(instruction: any) {
        const instructionLine = InstructionLine.fromInstruction(instruction).appendTo(this.elm);
        instructionLine._setParent(this);
        this.lines.push(instructionLine);
        this.htmlInstructionLineToJS.set(instructionLine.elm.getHTMLElement(), instructionLine);
    }

    public insertNewInstructionLine(position: number) {
        const instructionLine = new InstructionLine(new NewInstructionLine(this));

        if (position < this.lines.length) {
            this.elm.getHTMLElement().insertBefore(instructionLine.elm.getHTMLElement(), this.lines[position].elm.getHTMLElement());
        } else {
            this.elm.append(instructionLine);
        }
        instructionLine._setParent(this);
        this.lines.splice(position, 0, instructionLine);
        this.htmlInstructionLineToJS.set(instructionLine.elm.getHTMLElement(), instructionLine);

        return instructionLine;
    }

    public removeInstructionLine(positon: number) {
        const lines = this.lines.splice(positon, 1);
        if (lines.length < 0) { throw new Error("Invalid position"); }
        for (const line of lines) {
            this.htmlInstructionLineToJS.delete(line.elm.getHTMLElement());
            line.elm.remove();
        }
    }

    private updateHeight() {
        this.rect.height = this.elm.getHTMLElement().clientHeight;
    }
}

function isAncestor(child: Node | null, ancestor: Node): boolean {
    let curr = child;
    while (curr) {
        if (curr === ancestor) { return true; }
        curr = curr.parentNode;
    }
    return false;
}

function getAncestorWhich(child: Node | null, test: (node: Node) => boolean): Node | null {
    let curr = child;
    while (curr) {
        if (test(curr)) { return curr; }
        curr = curr.parentNode;
    }
    return null;
}

class InstructionLine extends Component {
    private parent!: InstructionGroupEditor;

    constructor(private view: InstructionLineView) {
        super("instructionLine");
        this.view._setParent(this);
        this.elm.append(this.view);
    }

    public _setParent(parent: InstructionGroupEditor) {
        this.parent = parent;
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
            default:
                view = new JSONLine(data);
        }

        const newLine = new InstructionLine(view);

        return newLine;
    }

    public requestSelectInstructionGroup(): Promise<InstructionGroupEditor | null> {
        return this.parent.parentEditor.requestSelectInstructionGroup();
    }

    public isBranch() {
        return this.view instanceof BranchInstructionLineView;
    }

    public setBranchTarget(target: InstructionGroupEditor) {
        this.parent.setBranchTarget(this, target);
    }

    public changeView(view: InstructionLineView) {
        this.view = view;
        this.view._setParent(this);
        this.elm.replaceContents(view);

        this.parent.updateInputCapture();
        this.parent.setCursorPositionStartOfCurrentLine();
    }

    public serialize() {
        return this.view.serialize();
    }

    public getEditableFromSelection(selection: Selection) {
        return this.view.getEditableFromSelection(selection);
    }

    public getEditableFromIndex(index: number) {
        return this.view.editables[index];
    }

    public getAreas(): TextareaUserInputCaptureAreas {
        return this.view.getAreas();
    }
}

abstract class InstructionLineView extends Component {
    protected parent!: InstructionLine;

    public spanToEditable = new Map<HTMLSpanElement, Editable>();
    public editables: Editable[] = [];

    public _setParent(parent: InstructionLine) { this.parent = parent; }

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
        this.spanToEditable.set(editable.getHTMLElement(), editable);
        this.editables.push(editable);
        return editable;
    }
}

abstract class BranchInstructionLineView extends InstructionLineView {
    public branchTarget?: InstructionGroupEditor;

    constructor(name: string) {
        super(name);
        this.elm.append(new Elm().class("branchConnect").on("click", () => {
            this.parent.requestSelectInstructionGroup()
            .then(editor => {
                if (editor) {
                    this.setBranchTarget(editor);
                }
            });
        }));
    }

    private setBranchTarget(editor: InstructionGroupEditor) {
        this.parent.setBranchTarget(editor);
        this.branchTarget = editor;
    }
}

class JSONLine extends InstructionLineView {
    private editable: Editable;
    constructor(private data: any) {
        super("jsonLine");
        this.elm.append(this.editable = this.createEditable(JSON.stringify(data)));
    }

    public serialize(): any {
        return JSON.parse(this.editable.getValue());
    }

    public getAreas(): TextareaUserInputCaptureAreas {
        return [this.editable];
    }
}



class ControlBranchLine extends BranchInstructionLineView {
    private opSpan: Editable;
    private v1Span: Editable;
    private v2Span: Editable;

    constructor(private data: ControlBranch) {
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
            offset: this.data.offset
        };
    }

    public getAreas(): TextareaUserInputCaptureAreas {
        return [3, this.v1Span, 1, this.opSpan, 1, this.v2Span];
    }
}


class ControlJumpLine extends BranchInstructionLineView {
    private editable = this.createEditable('');

    constructor(private data: ControlJump) {
        super("controlJumpLine");
        this.elm.append('Goto...', this.editable).class("jump");
    }

    public serialize(): ControlJump {
        return { ctrl: 'jump', offset: this.data.offset };
    }

    public getAreas(): TextareaUserInputCaptureAreas {
        return [7, this.editable];
    }
}


class ControlEndLine extends InstructionLineView {
    private editable = this.createEditable('');

    constructor(private data: ControlEnd) {
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

    constructor(private data: ControlInput) {
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

class Editable extends Elm<"span"> {
    private value: string;
    public onChange = new EventBus<UserInputEvent>();

    constructor(initialText: string) {
        super("span");
        this.class("editable");
        this.append(initialText);
        this.value = initialText;
    }

    public getValue(): string {
        return this.value;
    }

    public setValue(value: string) {
        this.value = value;
    }

    public checkInput(event: UserInputEvent) {
        this.onChange.send(event);
        if (event.added.includes("\n")) {
            event.reject();
        }
    }

    public getCharacterOffset(selection: Selection) {
        let curr: ChildNode | undefined | null = this.elm.firstChild;
        let count = 0;
        while (curr && curr !== selection.anchorNode) {
            if (curr instanceof Text) {
                count += curr.textContent ? curr.textContent.length : 0;
            }
            curr = curr?.nextSibling;
        }

        count += selection.focusOffset;
        if (count > this.value.length) {
            return this.value.length;
        }
        return count;
    }

    public setActive(offset: number, cursor: EditorCursor) {
        const before = this.value.slice(0, offset);
        const after = this.value.slice(offset);

        this.replaceContents(before, cursor, after);
    }
}

abstract class RejectableEvent {
    private rejected = false;

    public reject() {
        this.rejected = true;
    }

    public isRejected() {
        return this.rejected;
    }
}

class UserInputEvent extends RejectableEvent {
    constructor(
        public readonly added: string,
        public readonly removed: string,
        public readonly newContent: string
    ) { super(); }
}

class LineOperationEvent extends RejectableEvent {
    constructor(
        /** Is the operation on the current line or next line? */
        public readonly isNextLine: boolean,
        /** Is the operation an insertion or deletion? */
        public readonly isInsert: boolean
    ) { super(); }
}

/** A string represents an editable area with text. A number represents uneditable space by <number> spaces. */
type TextareaUserInputCaptureAreas = (Editable | number)[];
/** Change of line. Then, (only for "up", "same", "down") offset on line given by which editiable, then character offset in editable */
type TextareaUserInputCursorPosition = ["top" | "up" | "same" | "down" | "bottom", number, number, Editable?];

class TextareaUserInputCapture {
    /** Fired when an editable is edited */
    public onInput = new EventBus<UserInputEvent>();

    /** Fired when a line deletion is requested by the user. Event handlers must setup the input capture again, unless the event is rejected. */
    public onLineDelete = new EventBus<LineOperationEvent>();

    private inputCapture: Elm<"textarea"> = new Elm("textarea").class("inputCapture");
    private textarea: HTMLTextAreaElement;
    private currentLine: TextareaUserInputCaptureAreas = [];
    private aboveLine: TextareaUserInputCaptureAreas = [];
    private belowLine: TextareaUserInputCaptureAreas = [];
    private changeHandler?: (pos: TextareaUserInputCursorPosition) => void;

    private lastSelectionStart: number = 0;
    private lastSelectionEnd: number = 0;
    private lastTextareaValue = "";

    constructor(private cursor: EditorCursor) {
        this.textarea = this.inputCapture.getHTMLElement();
        this.inputCapture.on("input", () => this.onChange());
        this.inputCapture.on("selectionchange", () => this.onChange());

        // chrome support
        // from https://stackoverflow.com/a/53999418
        this.inputCapture.on('keydown', () => setTimeout(() => this.checkCursorPosition(), 1));
        this.inputCapture.on('input', () => this.checkCursorPosition()); // Other input events
        this.inputCapture.on('paste', () => this.checkCursorPosition()); // Clipboard actions
        this.inputCapture.on('cut', () => this.checkCursorPosition());
        this.inputCapture.on('select', () => this.checkCursorPosition()); // Some browsers support this event
        this.inputCapture.on('selectstart', () => this.checkCursorPosition()); // Some browsers support this event
    }

    private checkCursorPosition() {
        if (this.textarea.selectionStart !== this.lastSelectionStart || this.textarea.selectionEnd !== this.lastSelectionEnd) {
            this.onChange();
        }
    }

    public setStyleTop(y: number) {
        this.inputCapture.getHTMLElement().style.top = y + "px";
    }

    public appendTo(parent: Elm<any>) {
        parent.append(this.inputCapture);
    }

    public focus() {
        this.textarea.focus();
    }

    public setCurrentLine(areas: TextareaUserInputCaptureAreas) {
        this.currentLine = areas;
    }
    public setAboveLine(areas: TextareaUserInputCaptureAreas) {
        this.aboveLine = areas;
    }
    public setBelowLine(areas: TextareaUserInputCaptureAreas) {
        this.belowLine = areas;
    }

    public update() {
        this.textarea.value = this.lastTextareaValue = this.generateTextareaText();
        this.lastSelectionStart = this.lastSelectionEnd = -1;
    }

    public setChangeHandler(changeHandler: (pos: TextareaUserInputCursorPosition) => void) {
        this.changeHandler = changeHandler;
    }

    public getCurrentPosition() {
        return this.getPosition(this.lastSelectionStart);
    }

    private onChange() {
        if (this.textarea.value !== this.lastTextareaValue) {
            this.getChanges();
            this.lastTextareaValue = this.textarea.value;
        }

        if (this.textarea.selectionStart == this.lastSelectionStart &&
            this.textarea.selectionEnd == this.lastSelectionEnd) { return; }

        const pos = this.getPosition(this.textarea.selectionStart);
        if (this.changeHandler) {
            this.changeHandler(pos);
        }

        this.lastSelectionStart = this.textarea.selectionStart;
        this.lastSelectionEnd = this.textarea.selectionEnd;

        setTimeout(() => this.setPositionOnCurrentLine(pos[1], pos[2]), 1);
    }

    private generateTextareaText() {
        return "\n  " + this.areasToString(this.aboveLine) + "\n  " + this.areasToString(this.currentLine) + "\n  " + this.areasToString(this.belowLine) + "\n";
    }

    private getChanges() {
        // better algorithm: getPosition, but scanning for changes. To be implemented.

        const that = this;
        const currentValue = this.textarea.value;
        const lastValue = this.lastTextareaValue;
        const deltaLength = currentValue.length - lastValue.length;

        let currI = 0;
        let lastI = 0;

        // \n
        if (currentValue[currI++] !== lastValue[lastI++]) { console.log('a'); return null; }

        // aboveLine, currentLine, belowLine
        for (const [posStr, areas] of [["up", this.aboveLine], ["same", this.currentLine], ["down", this.belowLine]] as ['up' | 'same' | 'down', TextareaUserInputCaptureAreas][]) {
            let editableIndex = -1;

            // first extra space in front of line to capture moves to start of line
            if (currentValue[currI++] !== lastValue[lastI++]) {
                // enter at end of line
                applyLineOperation(true, true);
                return;
            }

            // second extra space in front of line to capture moves to the previous line by moving left
            if (currentValue[currI++] !== lastValue[lastI++]) {
                // backspace at start of line
                applyLineOperation(false, false);
                return;
            }

            let seenEditable = false;
            for (let i = 0; i < areas.length; i++) {
                const area = areas[i];
                const isEditable = area instanceof Editable;
                if (isEditable) {
                    seenEditable = true;
                    const value = area.getValue();
                    for (let j = 0; j < value.length; j++) {
                        if (currentValue[currI++] !== lastValue[lastI++]) {
                            applyChange(
                                area,
                                lastValue.slice(currI - 1 - j, currI - 1 - j + value.length),
                                currentValue.slice(currI - j - 1, currI - j - 1 + value.length + deltaLength)
                            );
                            currI += deltaLength;
                            return;
                        }
                    }
                    if (deltaLength > 0 && currentValue[currI] !== lastValue[lastI]) {
                        // insert after editable
                        applyChange(area,
                            lastValue.slice(currI - value.length, currI),
                            currentValue.slice(currI - value.length, currI + deltaLength)
                        );
                        currI += deltaLength;
                        return;
                    }
                } else {
                    for (let j = 0; j < area; j++) {
                        if (currentValue[currI++] !== lastValue[lastI++]) {
                            if (!seenEditable) {
                                // backspace on the first space
                                applyLineOperation(false, false);
                                return;
                            } else {
                                this.resetChanges(deltaLength);
                                return;
                            }
                        }
                    }
                }
            }

            if (currentValue[currI++] !== lastValue[lastI++]) {
                // delete at end of line
                applyLineOperation(true, false);
                return;
            }
        }

        function applyChange(editable: Editable, original: string, newContent: string) {
            const diff = that.singleDiff(original, newContent);
            console.log(original, newContent, diff);
            if (!diff) { return; }

            const event = new UserInputEvent(diff.added, diff.removed, newContent);
            that.onInput.send(event);
            editable.checkInput(event);
            if (event.isRejected()) {
                that.resetChanges(0);
            } else {
                editable.setValue(newContent);
                const cursorPos = that.getPosition(that.textarea.selectionStart);
                editable.setActive(cursorPos[2], that.cursor);
            }
        }

        function applyLineOperation(isNextLine: boolean, isInsert: boolean) {
            const event = new LineOperationEvent(isNextLine, isInsert);
            that.onLineDelete.send(event);
            if (event.isRejected()) {
                that.resetChanges(0);
            }
        }
    }

    /** Diffs a string with a single difference (added/removed/replaced substring). */
    private singleDiff(original: string, currentValue: string): { added: string, removed: string } | null {
        let hadChange = false;
        let sameToIndex;
        const maxLength = Math.max(original.length, currentValue.length);
        for (sameToIndex = 0; sameToIndex < maxLength; sameToIndex++) {
            if (currentValue[sameToIndex] !== original[sameToIndex]) {
                hadChange = true;
                break;
            }
        }

        if (!hadChange) { return null; } // no changes

        const currentValueLen = currentValue.length;
        const lastValueLen = original.length;
        const maxBackwardSearch = Math.min(currentValueLen, lastValueLen) - sameToIndex;
        let sameToIndexRev;
        for (sameToIndexRev = 1; sameToIndexRev <= maxBackwardSearch; sameToIndexRev++) {
            if (currentValue[currentValueLen - sameToIndexRev] !== original[lastValueLen - sameToIndexRev]) {
                break;
            }
        }

        return {
            added: currentValue.slice(sameToIndex, 1 - sameToIndexRev),
            removed: original.slice(sameToIndex, 1 - sameToIndexRev)
        };
    }

    private resetChanges(cursorDelta: number) {
        const lastSelectionStart = this.lastSelectionStart;
        this.update();

        if (cursorDelta) {
            this.lastSelectionStart = lastSelectionStart; // so getPosition gets relative movement data
            const cursorPos = this.getPosition(lastSelectionStart + cursorDelta);
            this.setPositionOnCurrentLine(cursorPos[1], cursorPos[2]);
            if (cursorPos && cursorPos[3]) {
                cursorPos[3].setActive(cursorPos[2], this.cursor);
            }
        } else {
            this.setTextareaCursorPositionIfNeeded(lastSelectionStart);
        }
    }

    private getPosition(cursorOffset: number): TextareaUserInputCursorPosition {
        let curr = cursorOffset;
        const movingLeft = curr < this.lastSelectionStart;

        // \n
        if (curr <= 0) { return ["top", 0, 0]; }
        curr--;

        let previousLinePos: 'up' | 'same' | 'down' = 'up'; // not 'top' to prevent a 'two-line' jump being recognized as a jump to top
        let previousLineLastEditableIndex = 0;
        let previousLineLastCharacterOffset = 0;
        let previousLineLastEditable: Editable | undefined;
        // find the first element of 'up' (first element and not last, since the
        // initial values are only used when going 'up' into the first 'space' area,
        // in which case the cursor should jump to the first editable instead
        // of the last.)
        for (let i = 0; i < this.aboveLine.length; i++) {
            const area = this.aboveLine[i];
            if (area instanceof Editable) {
                previousLineLastEditable = area;
                break;
            }
        }

        // aboveLine, currentLine, belowLine
        for (const [posStr, areas] of [["up", this.aboveLine], ["same", this.currentLine], ["down", this.belowLine]] as ['up' | 'same' | 'down', TextareaUserInputCaptureAreas][]) {
            let editableIndex = -1;
            let lastEditableSize = 0;
            let lastEditable: Editable | undefined;

            let maxEditableIndex = -1;
            for (const area of areas) { if (area instanceof Editable) { maxEditableIndex++; } }

            // first extra space in front of line to capture moves to start of line
            if (curr <= 0) {
                // return first editable
                for (let i = 0; i < areas.length; i++) {
                    const area = areas[i];
                    if (area instanceof Editable) {
                        return [posStr, 0, 0, area];
                    }
                }
                return [posStr, 0, 0];
            }
            curr--;

            // second extra space in front of line to capture moves to the previous line by moving left
            if (curr <= 0) {
                return [previousLinePos, previousLineLastEditableIndex, previousLineLastCharacterOffset, previousLineLastEditable];
            }
            curr--;

            for (let i = 0; i < areas.length; i++) {
                const area = areas[i];
                const isEditable = area instanceof Editable;
                let size: number;
                if (isEditable) {
                    size = area.getValue().length;
                    editableIndex++;
                } else {
                    size = area;
                }

                if (isEditable ? curr <= size : curr < size) {
                    if (isEditable) {
                        return [posStr, editableIndex, curr, area];
                    } else {
                        // handle shifting to an editable
                        if (movingLeft) {
                            if (editableIndex < 0) {
                                return [previousLinePos, previousLineLastEditableIndex, previousLineLastCharacterOffset, previousLineLastEditable];
                            } else {
                                return [posStr, editableIndex, lastEditableSize, lastEditable];
                            }
                        } else {
                            if (editableIndex + 1 > maxEditableIndex) {
                                return [posStr, editableIndex, lastEditableSize, lastEditable];
                            } else {
                                let nextEditableIndex = editableIndex;
                                for (let j = i + 1; j < areas.length; j++) {
                                    const nextArea = areas[j];
                                    if (nextArea instanceof Editable) {
                                        nextEditableIndex++;
                                        return [posStr, nextEditableIndex, 0, nextArea];
                                    }
                                }
                                // return [posStr, Math.min(maxEditableIndex, editableIndex + 1), 0];
                            }
                        }
                    }
                }

                curr -= size;
                if (isEditable) {
                    lastEditableSize = size;
                    lastEditable = area;
                }
            }

            previousLinePos = posStr;
            previousLineLastEditableIndex = editableIndex;
            previousLineLastCharacterOffset = lastEditableSize;
            previousLineLastEditable = lastEditable;

            // catch cursor at end of line that ends with space
            if (curr <= 0) { return [posStr, Math.max(0, editableIndex), lastEditableSize, lastEditable]; }

            curr--; // \n
        }

        // \n
        return ["bottom", 0, 0];
    }

    /** Sets the cursor position on the current line */
    public setPositionOnCurrentLine(editableOrIndex: number | Editable, characterIndex: number) {
        let curr = 6; // 6 for '\n  ' at start and after above line
        for (const area of this.aboveLine) {
            if (area instanceof Editable) { curr += area.getValue().length; }
            else { curr += area; }
        }
        let currEditable = 0;
        for (const area of this.currentLine) {
            if (area instanceof Editable) {
                if (editableOrIndex instanceof Editable ?
                    area === editableOrIndex : currEditable == editableOrIndex) {
                    this.setTextareaCursorPositionIfNeeded(curr + characterIndex);
                    return;
                }
                currEditable++;
                curr += area.getValue().length;
            } else {
                curr += area;
            }
        }
        console.warn("Tried to set position, but could not find position", editableOrIndex, characterIndex, this);
    }

    private setTextareaCursorPositionIfNeeded(index: number) {
        if (this.lastSelectionEnd != index || this.lastSelectionStart != index) {
            this.textarea.selectionStart = this.textarea.selectionEnd =
                this.lastSelectionStart = this.lastSelectionEnd = index;
        }
    }

    private areasToString(areas: TextareaUserInputCaptureAreas): string {
        return areas.map(e => e instanceof Editable ? e.getValue() : "\xa0".repeat(e)).join("");
    }
}


class NewInstructionLine extends InstructionLineView {
    private editable: Editable;

    constructor(group: InstructionGroupEditor) {
        super("newInstructionLine");

        this.elm.append(
            this.editable = this.createEditable("Press one of [ibjved]...")
        );

        this.editable.onChange.subscribe(changes => {
            changes.reject(); // prevent updating
            let newView;
            switch (changes.added && changes.added[0].toLowerCase()) {
                case "b":
                    newView = new ControlBranchLine({
                        ctrl: "branch",
                        offset: 1,
                        op: "<",
                        v1: "v1",
                        v2: "v2"
                    });
                    break;
                case "i":
                    newView = new ControlInputLine({
                        ctrl: "input",
                        options: ["option"],
                        variable: "choice"
                    });
                    break;
                case "j":
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
        throw new Error("Not implemented");
    }

    public getAreas(): TextareaUserInputCaptureAreas {
        return [this.editable];
    }
}

interface InstructionData {
    x: number;
    y: number;
    parents: InstructionData[];
    children: InstructionData[];
    instructions: any[];
    branches: any[];
}

interface GraphInstructionNode {
    parents: number[];
    child?: number;
    instruction: any;
}

function newInstructionData(): InstructionData {
    return {
        branches: [],
        children: [],
        instructions: [],
        parents: [],
        x: 0,
        y: 0
    }
}

function constructInstructionData(flowData: FlowData): InstructionData[] {
    const instructions: GraphInstructionNode[] = [];

    const jumpers: [number, number][] = [];

    for (let i = 0; i < flowData.flow.length; i++) {
        const instruction = flowData.flow[i];

        const obj: GraphInstructionNode = {
            child: undefined,
            parents: [],
            instruction: instruction
        };
        if (isControlItem(instruction)) {
            switch (instruction.ctrl) {
                case "branch":
                case "jump":
                    jumpers.push([
                        i, i + instruction.offset
                    ]);
                    obj.child = i + instruction.offset;
                    break;
            }
        }
        instructions.push(obj);
    }

    for (const [from, destination] of jumpers) {
        instructions[destination].parents.push(from);
    }

    let y = 0;
    const groups: InstructionData[] = [];
    const jumpChildrenParentMap = new Map<number, InstructionData[]>();
    let currGroup: InstructionData = newInstructionData();

    function endGroup() {
        if (currGroup.instructions.length === 0 && currGroup.branches.length === 0) { return; }
        groups.push(currGroup);
        y += 24 * (currGroup.instructions.length + currGroup.branches.length);
        currGroup = newInstructionData();
        currGroup.y = y;
    }

    let lastInstructionWasJump = false;
    for (let i = 0; i < instructions.length; i++) {
        const instruction = instructions[i];

        if (instruction.child === undefined && instruction.parents.length === 0 && currGroup.branches.length === 0) {
            currGroup.instructions.push(instruction.instruction);
            lastInstructionWasJump = false;
        } else if (instruction.parents.length === 0 && isControlItem(instruction.instruction)) {
            // branch or jump
            currGroup.branches.push(instruction.instruction);

            const existing = jumpChildrenParentMap.get(instruction.child!);
            if (existing) {
                existing.push(currGroup);
            } else {
                jumpChildrenParentMap.set(instruction.child!, [currGroup])
            }

            lastInstructionWasJump = false;
            if (instruction.instruction.ctrl === "jump") {
                lastInstructionWasJump = true;
                endGroup();
            }
        } else {
            endGroup();

            const parents = jumpChildrenParentMap.get(i);
            if (parents) {
                for (const parent of parents) {
                    currGroup.parents.push(parent);
                    parent.children.push(currGroup);
                }
            }

            // add last group last so the list of children match with the order of the branches
            if (!lastInstructionWasJump) {
                const lastGroup = groups[groups.length - 1];
                currGroup.parents.push(lastGroup);
                lastGroup.children.push(currGroup);
            }

            currGroup.instructions.push(instruction.instruction);
            lastInstructionWasJump = false;
        }
    }

    endGroup();

    return groups;
}

fetch("/data/exampleFlow.json").then(e => e.json()).then((flowData: FlowData) => {
    const engine = new JaPNaAEngine2d({
        canvas: { alpha: true },
        htmlOverlay: { relativeToWorld: true }
    });
    const editor = new Editor();

    engine.world.addElm(editor);

    if (localStorage['flowEditorSave']) {
        editor.deserialize(JSON.parse(localStorage['flowEditorSave']));
    } else {
        const instructions: InstructionData[] = constructInstructionData(flowData);
        editor.setInstructions(instructions);
    }

    addEventListener("beforeunload", () => {
        localStorage['flowEditorSave'] = JSON.stringify(editor.serialize());
    });

    console.log(engine.world);

    // const runner = new FlowRunner(flowData);
    // while (runner.isActive()) {
    //     runner.runOne();
    //     console.log(runner.getOutput());
    // }
});

