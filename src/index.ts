import { ControlBranch, ControlEnd, ControlInput, ControlJump, ControlVariable, FlowData, FlowRunner, isControlItem } from "./FlowRunner.js";
import { Component, Elm, Hitbox, InputElm, ParentComponent, PrerenderCanvas, RectangleM, SubscriptionsComponent, WorldElm, WorldElmWithComponents } from "./japnaaEngine2d/JaPNaAEngine2d.js";
import { JaPNaAEngine2d } from "./japnaaEngine2d/JaPNaAEngine2d.js";

class Editor extends WorldElmWithComponents {
    private parentComponent = this.addComponent(new ParentComponent());
    private subscriptions = this.addComponent(new SubscriptionsComponent());
    private draggingInstructionRectangle?: InstructionGroupEditor;
    private draggingCamera = false;

    private instructionElms: InstructionGroupEditor[] = [];

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
        const newRectangle = new InstructionGroupEditor(newData);
        newData.instructions.push("New instruction");
        newRectangle.rect.x = this.engine.mouse.worldPos.x;
        newRectangle.rect.y = this.engine.mouse.worldPos.y;
        this.parentComponent.addChild(newRectangle);
        this.instructionElms.push(newRectangle);
    }

    public setInstructions(instructionsData: InstructionData[]) {
        const instructionToElmMap = new Map<InstructionData, InstructionGroupEditor>();
        for (const instruction of instructionsData) {
            const elm = new InstructionGroupEditor(instruction);
            this.parentComponent.addChild(elm);
            instructionToElmMap.set(instruction, elm);
            this.instructionElms.push(elm);
        }

        for (const [instruction, elm] of instructionToElmMap) {
            for (const child of instruction.children) {
                elm.addChild(instructionToElmMap.get(child)!);
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

            const elm = new InstructionGroupEditor(instructionData);
            idElmMap.set(elmData.id, elm);
            this.instructionElms.push(elm);
            this.parentComponent.addChild(elm);
        }

        for (const elmData of data.elms) {
            for (const child of elmData.children) {
                idElmMap.get(elmData.id)!.addChild(idElmMap.get(child)!);
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

class InstructionGroupEditor extends WorldElm {
    private static fontSize = 16;
    private static collisionType = Symbol();

    private rendered = false;
    private children: InstructionGroupEditor[] = [];
    private lines: InstructionLine[] = [];
    private htmlInstructionLineToJS = new WeakMap<HTMLDivElement, InstructionLine>();
    private activeEditable: Editable | null = null;
    private elm: Elm;

    public collisionType = InstructionGroupEditor.collisionType;

    constructor(private data: InstructionData) {
        super();
        this.rect.x = data.x;
        this.rect.y = data.y;

        this.elm = new Elm().class("instructionElm");
        this.elm.attribute("tabindex", "-1");
        this.elm.on("input", () => this.updateHeight());
        document.addEventListener("selectionchange", e => {
            if (!e.isTrusted) { return; } // prevent self-caused selection changes

            // must be in this.elm
            const selection = getSelection();
            if (!selection || !isAncestor(selection.anchorNode || null, this.elm.getHTMLElement())) { return; }

            const instructionLine = getAncestorWhich(selection.anchorNode || null, (node) => node instanceof HTMLDivElement && node.classList.contains("instructionLine"))
            if (instructionLine) {
                const instructionLineElm = this.htmlInstructionLineToJS.get(instructionLine as HTMLDivElement);
                if (instructionLineElm) {
                    const prevEditable = this.activeEditable;
                    const newEditable = instructionLineElm.getEditableFromSelection(selection);

                    if (prevEditable !== newEditable) {
                        // restoreSelections = true;
                        prevEditable?.deactivate();
                        this.activeEditable = newEditable;
                    }

                    newEditable?.activate(selection);
                }
            }
        });
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
        for (const child of this.children) {
            childrenUids.push(uidGen.getId(child));
        }

        return {
            id: uidGen.getId(this),
            instructions: this.data.instructions,
            branches: this.data.branches,
            children: childrenUids,
            x: this.rect.x,
            y: this.rect.y
        };
    }

    public addChild(instructionRectangle: InstructionGroupEditor) {
        this.children.push(instructionRectangle);
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
        for (const child of this.children) {
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
        const instructionLine = new InstructionLine(instruction).appendTo(this.elm);
        this.lines.push(instruction);
        this.htmlInstructionLineToJS.set(instructionLine.elm.getHTMLElement(), instructionLine);
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
    private view: InstructionLineView;

    constructor(data: any) {
        super("instructionLine");

        if (isControlItem(data)) {
            switch (data.ctrl) {
                case "branch":
                    this.view = new ControlBranchLine(data);
                    break;
                case "jump":
                    this.view = new ControlJumpLine(data);
                    break;
                case "end":
                    this.view = new ControlEndLine(data);
                    break;
                case "input":
                    this.view = new ControlInputLine(data);
                    break;
                case "variable":
                    this.view = new ControlVariableLine(data);
                    break;
                default:
                    this.view = new JSONLine(data);
            }

            if (data.ctrl === "branch" || data.ctrl === "jump") {
                this.elm.class("jump");
            } else {
                this.elm.class("control");
            }
        } else {
            this.view = new JSONLine(data);
        }

        this.elm.append(this.view);
    }

    public getEditableFromSelection(selection: Selection) {
        return this.view.getEditableFromSelection(selection);
    }
}

class InstructionLineView extends Component {
    public spanToEditable = new Map<HTMLSpanElement, Editable>();

    public getEditableFromSelection(selection: Selection): Editable | null {
        const editable = getAncestorWhich(
            selection.anchorNode, node => node instanceof HTMLSpanElement && node.classList.contains("editable")
        ) as HTMLSpanElement | null;
        if (editable) {
            return this.spanToEditable.get(editable) || null;
        }
        return null;
    }

    protected createEditable(text: string | number): Editable {
        const editable = new Editable(text.toString());
        this.spanToEditable.set(editable.getHTMLElement(), editable);
        return editable;
    }
}

class JSONLine extends InstructionLineView {
    constructor(private data: any) {
        super("jsonLine");
        this.elm.append(this.createEditable(JSON.stringify(data)));
    }
}

class ControlBranchLine extends InstructionLineView {
    private opSpan: Editable;
    constructor(private data: ControlBranch) {
        super("controlBranchLine");

        this.elm.append(
            "If ",
            this.createEditable(data.v1),
            " ",
            this.opSpan = this.createEditable(data.op).class("op"),
            " ",
            this.createEditable(data.v2),
            ", goto..."
        );

        if (data.op == "=") { this.opSpan.class("eq"); }
    }
}


class ControlJumpLine extends InstructionLineView {
    constructor(private data: ControlJump) {
        super("controlJumpLine");
        this.elm.append('Goto...');
    }
}


class ControlEndLine extends InstructionLineView {
    constructor(private data: ControlEnd) {
        super("controlEndLine");
        this.elm.append('End');
    }
}


class ControlInputLine extends InstructionLineView {
    constructor(private data: ControlInput) {
        super("controlInputLine");
        this.elm.append(this.createEditable(data.variable), ' <- choose from [', this.createEditable(data.options.join(", ")), ']');
    }
}


class ControlVariableLine extends InstructionLineView {
    constructor(private data: ControlVariable) {
        super("controlVariableLine");
        if (data.op === "=") {
            this.elm.append(this.createEditable(data.v1), " <- ", this.createEditable(data.v2));
        } else {
            this.elm.append(this.createEditable(data.v1), " <- ", this.createEditable(`${data.v1} ${data.op} ${data.v2}`));
        }
    }
}

class Editable extends Elm<"span"> {
    private activated?: {
        cursor: Elm<"span">,
        inputCapture: Elm<"textarea">,
        position: number
    };

    constructor(initialText: string) {
        super("span");
        this.class("editable");
        this.append(initialText);
    }

    public activate(selection: Selection) {
        if (!(selection.anchorNode instanceof Text)) { return; }
        let textarea: HTMLTextAreaElement;

        if (this.activated) {
            textarea = this.activated.inputCapture.getHTMLElement();
            let curr: ChildNode | undefined | null = this.elm.firstChild;
            let count = 0;
            while (curr && curr !== selection.anchorNode) {
                if (curr instanceof Text) {
                    count += curr.textContent ? curr.textContent.length : 0;
                }
                curr = curr?.nextSibling;
            }

            this.activated.position = count + selection.focusOffset;
        } else {
            const inputCapture = new Elm("textarea").class("inputCapture")
                .on("input", e => this.updateByInput())
                .on("selectionchange", e => this.updateByInput());
            const cursor = new Elm("span").class("cursor")
                .append(inputCapture);

            this.activated = { cursor, inputCapture, position: selection.anchorOffset };

            textarea = this.activated!.inputCapture.getHTMLElement();
            textarea.value = this.elm.innerText;
        }

        textarea.selectionStart = textarea.selectionEnd = this.activated.position;
        this.updateByInput();
        // this.cursor.attribute("")

        // console.log(this.elm.innerText.slice(0, selection.anchorOffset) + "|" + this.elm.innerText.slice(selection.anchorOffset));
    }

    public updateByInput() {
        if (!this.activated) { return; }
        const textarea = this.activated.inputCapture.getHTMLElement();
        const before = textarea.value.slice(0, textarea.selectionStart);
        const after = textarea.value.slice(textarea.selectionStart);

        this.replaceContents(before, this.activated.cursor, after);
        textarea.focus();
    }

    public deactivate() {
        if (this.activated) {
            this.activated.cursor.remove();
            this.activated = undefined;
        }
    }

}

/** A string represents an editable area with text. A number represents uneditable space by <number> spaces. */
type TextareaUserInputCaptureAreas = (string | number)[];
/** Change of line. Then, (only for "up", "same", "down") offset on line given by which editiable, then character offset in editable */
type TextareaUserInputCursorPosition = ["top" | "up" | "same" | "down" | "bottom", number, number];

class TextareaUserInputCapture {
    private inputCapture: Elm<"textarea"> = new Elm("textarea").class("inputCapture");
    private currentLine: TextareaUserInputCaptureAreas = [];
    private aboveLine: TextareaUserInputCaptureAreas = [];
    private belowLine: TextareaUserInputCaptureAreas = [];
    private changeHandler?: (pos: TextareaUserInputCursorPosition) => void;

    private lastSelectionStart: number = 0;
    private lastSelectionEnd: number = 0;
    private lastTextareaValue = "";

    constructor() {
        this.inputCapture.on("input", () => this.onChange());
        this.inputCapture.on("selectionchange", () => this.onChange());
    }

    public appendTo(parent: Elm<any>) {
        parent.append(this.inputCapture);
    }

    public focus() {
        this.inputCapture.getHTMLElement().focus();
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
        this.inputCapture.getHTMLElement().value = this.generateTextareaText();
    }

    public setChangeHandler(changeHandler: (pos: TextareaUserInputCursorPosition) => void) {
        this.changeHandler = changeHandler;
    }

    private onChange() {
        const textarea = this.inputCapture.getHTMLElement();
        if (textarea.selectionStart == this.lastSelectionStart &&
            textarea.selectionEnd == this.lastSelectionEnd &&
            textarea.value == this.lastTextareaValue) {
            return;
        }

        const pos = this.getPosition();
        if (this.changeHandler) {
            this.changeHandler(pos);
        }

        this.lastTextareaValue = textarea.value;
        this.lastSelectionStart = textarea.selectionStart;
        this.lastSelectionEnd = textarea.selectionEnd;

        setTimeout(() => this.setPosition(pos[1], pos[2]), 1);
    }

    private generateTextareaText() {
        return "\n" + this.areasToString(this.aboveLine) + "\n" + this.areasToString(this.currentLine) + "\n" + this.areasToString(this.belowLine) + "\n";
    }

    private getPosition(): TextareaUserInputCursorPosition {
        let curr = this.inputCapture.getHTMLElement().selectionStart;
        const movingLeft = curr < this.lastSelectionStart;

        // \n
        if (curr <= 0) { return ["top", 0, 0]; }
        curr--;

        // aboveLine
        for (const [posStr, areas] of [["up", this.aboveLine], ["same", this.currentLine], ["down", this.belowLine]] as ['up' | 'same' | 'down', TextareaUserInputCaptureAreas][]) {
            let editableIndex = -1;
            let lastEditableSize = 0;

            let maxEditableIndex = -1;
            for (const area of areas) { if (typeof area === 'string') { maxEditableIndex++; } }

            for (const area of areas) {
                const isEditable = typeof area === "string";
                let size: number;
                if (isEditable) {
                    size = area.length;
                    editableIndex++;
                } else {
                    size = area;
                }

                if (isEditable ? curr <= size : curr < size) {
                    if (isEditable) {
                        return [posStr, editableIndex, curr];
                    } else {
                        // handle shifting to an editable
                        if (movingLeft || editableIndex + 1 > maxEditableIndex) {
                            return [posStr, Math.max(0, editableIndex), lastEditableSize];
                        } else {
                            return [posStr, Math.min(maxEditableIndex, editableIndex + 1), 0];
                        }
                    }
                }

                curr -= size;
                if (isEditable) {
                    lastEditableSize = size;
                }
            }

            // catch cursor at end of line that ends with space
            if (curr <= 0) { return [posStr, editableIndex, lastEditableSize]; }

            curr--; // \n
        }

        // \n
        return ["bottom", 0, 0];
    }

    /** Sets the cursor position on the current line */
    public setPosition(editableIndex: number, characterIndex: number) {
        let curr = 2; // 2 for \n at start and \n after above line
        for (const area of this.aboveLine) {
            if (typeof area === 'string') { curr += area.length; }
            else { curr += area; }
        }
        let currEditable = 0;
        for (const area of this.currentLine) {
            if (typeof area === 'string') {
                if (currEditable === editableIndex) {
                    this.setTextareaCursorPositionIfNeeded(curr + characterIndex);
                    return;
                }
                currEditable++;
                curr += area.length;
            } else {
                curr += area;
            }
        }
        console.warn("Tried to set position, but could not find position", editableIndex, characterIndex, this);
    }

    private setTextareaCursorPositionIfNeeded(index: number) {
        const textarea = this.inputCapture.getHTMLElement();
        if (this.lastSelectionEnd != index || this.lastSelectionStart != index) {
            textarea.selectionStart = textarea.selectionEnd =
                this.lastSelectionStart = this.lastSelectionEnd = index;
        }
    }

    private areasToString(areas: TextareaUserInputCaptureAreas): string {
        return areas.map(e => typeof e === "string" ? e : " ".repeat(e)).join("");
    }
}


class NewInstructionLine extends InstructionLineView {
    private select: Elm<"select">;

    constructor(emptyDiv: Elm) {
        super("newInstructionLine");

        this.elm.append(
            this.select = new Elm("select").class("typeSelect").append(
                new Elm("option").append("Branch"),
                new Elm("option").append("Input"),
                new Elm("option").append("Jump"),
                new Elm("option").append("End"),
                new Elm("option").append("Variable"),
                new Elm("option").append("Default"),
                new Elm("option").attribute("selected", "selected").attribute("disabled", "disabled").attribute("hidden", "hidden")
            ).attribute("style", "display: inline-block")
        );

        emptyDiv.replaceContents(this.elm);
        this.select.getHTMLElement().focus();

        this.select.on("change", () => {
            emptyDiv.replaceContents(this.select.getHTMLElement().value + ":");
            const range = document.createRange();
            const selection = getSelection();
            range.setStart(emptyDiv.getHTMLElement(), 1);
            range.collapse(true);
            selection?.removeAllRanges();
            selection?.addRange(range);
        });
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

    const runner = new FlowRunner(flowData);
    while (runner.isActive()) {
        runner.runOne();
        console.log(runner.getOutput());
    }
});

