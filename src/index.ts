import { FlowData, FlowRunner, isControlItem } from "./FlowRunner.js";
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
    private elm: Elm;

    private observer: MutationObserver;

    public collisionType = InstructionGroupEditor.collisionType;

    constructor(private data: InstructionData) {
        super();
        this.rect.x = data.x;
        this.rect.y = data.y;

        this.elm = new Elm().class("instructionElm").attribute("contenteditable", "true");
        this.elm.on("input", () => this.updateHeight());

        this.observer = new MutationObserver(this.mutationHandler.bind(this));
    }

    public _setEngine(engine: JaPNaAEngine2d): void {
        super._setEngine(engine);
        this.engine.collisions.addHitbox(new Hitbox(this.rect, this));
        this.engine.htmlOverlay.elm.append(this.elm);
    }

    public remove(): void {
        this.observer.disconnect();
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
            new InstructionLine(instruction).appendTo(this.elm);
        }

        for (const branch of this.data.branches) {
            new InstructionLine(branch).appendTo(this.elm);
        }

        this.rect.width = width;
        this.updateHeight();

        this.rendered = true;

        this.observer.observe(this.elm.getHTMLElement(), {
            childList: true
        });
    }

    private mutationHandler(changes: MutationRecord[]) {
        for (const change of changes) {
            if (change.addedNodes.length > 0) {
                let emptyDiv = change.nextSibling;
                if (emptyDiv instanceof HTMLDivElement && emptyDiv.innerText.trim() === "") {
                    new NewInstructionLine(emptyDiv);
                }
                for (const emptyDiv of change.addedNodes) {
                    if (emptyDiv instanceof HTMLDivElement && emptyDiv.innerText.trim() === "") {
                        new NewInstructionLine(emptyDiv);
                    }
                }
            }
        }
    }

    private updateHeight() {
        this.rect.height = this.elm.getHTMLElement().clientHeight;
    }
}

class InstructionLine extends Component {
    constructor(data: any) {
        super("instructionLine");
        
        this.elm.append(JSON.stringify(data));

        if (isControlItem(data)) {
            if (data.ctrl === "branch" || data.ctrl === "jump") {
                this.elm.class("jump");
            } else {
                this.elm.class("control");
            }
        }
    }
}

class NewInstructionLine extends Component {
    private select: Elm<"select">;

    constructor(emptyDiv: HTMLDivElement) {
        super("newInstructionLine");

        this.elm.attribute("contenteditable", "false").append(
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

        const emptyDivElm = new Elm(emptyDiv);
        emptyDivElm.attribute("class", "instructionLine");
        emptyDivElm.replaceContents(this.elm);
        this.select.getHTMLElement().focus();

        this.select.on("change", () => {
            emptyDivElm.replaceContents(this.select.getHTMLElement().value + ":");
            const range = document.createRange();
            const selection = getSelection();
            range.setStart(emptyDiv, 1);
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

