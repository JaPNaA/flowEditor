import { InstructionGroupEditor } from "./InstructionGroupEditor.js";
import { UIDGenerator } from "./UIDGenerator.js";
import { InstructionData, newInstructionData } from "./flowToInstructionData.js";
import { InstructionLine } from "./instructionLines.js";
import { Elm, EventBus, JaPNaAEngine2d, ParentComponent, RectangleM, SubscriptionsComponent, WorldElm, WorldElmWithComponents } from "../japnaaEngine2d/JaPNaAEngine2d.js";
import { EditorCursor } from "./EditorCursor.js";

export class Editor extends WorldElmWithComponents {
    public cursor = new EditorCursor();
    public childFocused = new EventBus<InstructionGroupEditor>();

    private parentComponent = this.addComponent(new ParentComponent());
    private subscriptions = this.addComponent(new SubscriptionsComponent());
    private draggingInstructionRectangle?: InstructionGroupEditor;
    private draggingCamera = false;

    private groupEditors: InstructionGroupEditor[] = [];

    constructor() {
        super();
        this.parentComponent.addChild(new DummyText());
    }

    public _setEngine(engine: JaPNaAEngine2d): void {
        super._setEngine(engine);
        this.subscriptions.subscribe(this.engine.mouse.onMousedown, this.mousedownHandler);
        this.subscriptions.subscribe(this.engine.mouse.onMousemove, this.mousemoveHandler);
        this.subscriptions.subscribe(this.engine.mouse.onMouseup, this.mouseupHandler);
        this.subscriptions.subscribe(this.engine.keyboard.getKeydownBus("KeyA"), this.addGroupHandler);
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

    private addGroupHandler() {
        const newData = newInstructionData();
        const newEditor = new InstructionGroupEditor(this, newData);
        newEditor.rect.x = this.engine.mouse.worldPos.x;
        newEditor.rect.y = this.engine.mouse.worldPos.y;
        this.addGroup(newEditor);
        newEditor.insertNewInstructionLine(0);
    }

    public requestSelectInstructionGroup(): Promise<InstructionGroupEditor | null> {
        return this.childFocused.promise();
    }

    public setInstructions(instructionsData: InstructionData[]) {
        const instructionToElmMap = new Map<InstructionData, InstructionGroupEditor>();
        for (const instruction of instructionsData) {
            const elm = new InstructionGroupEditor(this, instruction);
            instructionToElmMap.set(instruction, elm);
            this.addGroup(elm);
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
            this.addGroup(elm);
        }

        for (const elmData of data.elms) {
            for (const child of elmData.children) {
                idElmMap.get(elmData.id)!.addBranchTarget(idElmMap.get(child)!);
            }
        }
    }

    public addGroup(group: InstructionGroupEditor) {
        this.groupEditors.push(group);
        this.parentComponent.addChild(group);
        this.cursor.registerInstructionGroup(group);
    }

    public serialize(): EditorSaveData {
        const uidGen = new UIDGenerator();
        const elms = [];
        for (const groupEditor of this.groupEditors) {
            elms.push(groupEditor.serialize(uidGen));
        }
        return { elms: elms };
    }

    public compile() {
        const startIndicies = new Map<InstructionGroupEditor, number>();

        const compiled: any[] = [];
        const groupLines: InstructionLine[][] = [];
        let index = 0;

        for (const group of this.groupEditors) {
            startIndicies.set(group, index);
            const lines = group.getLines();
            groupLines.push(lines);
            index += lines.length;
        }

        index = 0;
        for (const group of groupLines) {
            for (const line of group) {
                if (line.isBranch()) {
                    const target = line.getBranchTarget();
                    if (target) {
                        compiled.push(line.exportWithBranchOffset(startIndicies.get(target)! - index));
                    } else {
                        compiled.push({ ctrl: "nop" });
                        console.warn("NOP inserted in place of branch");
                    }
                } else {
                    compiled.push(line.export());
                }

                index++;
            }
        }

        return compiled;
    }
}

/**
 * Prevents a click on the editor moving the editorCursor back to 0
 */
class DummyText extends WorldElm {
    private elm = new Elm().class("dummyText").append("Editor");

    public _setEngine(engine: JaPNaAEngine2d): void {
        super._setEngine(engine);
        engine.htmlOverlay.elm.append(this.elm);
    }

    public remove(): void {
        super.remove();
        this.elm.remove();
    }
}

interface EditorSaveData {
    elms: InstructionElmData[];
}

export interface InstructionElmData {
    id: number;
    instructions: any[],
    branches: any[],
    children: number[];
    x: number;
    y: number;
}
