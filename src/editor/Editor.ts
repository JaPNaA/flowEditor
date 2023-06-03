import { InstructionGroupEditor } from "./InstructionGroupEditor.js";
import { UIDGenerator } from "./UIDGenerator.js";
import { InstructionData, newInstructionData } from "./flowToInstructionData.js";
import { InstructionLine } from "./instructionLines.js";
import { Elm, JaPNaAEngine2d, ParentComponent, RectangleM, SubscriptionsComponent, Vec2, WorldElm, WorldElmWithComponents } from "../japnaaEngine2d/JaPNaAEngine2d.js";
import { EditorCursor } from "./EditorCursor.js";
import { ControlItem } from "../FlowRunner";

export class Editor extends WorldElmWithComponents {
    public cursor = new EditorCursor();

    private parentComponent = this.addComponent(new ParentComponent());
    private subscriptions = this.addComponent(new SubscriptionsComponent());

    /**
     * In edit mode, the user can can edit the contents of the group and move the
     * cursor (also to other groups) in one click.
     * The user activates edit mode by clicking on the selected group when there is only
     * one selected group.
     * The user deactivates edit mode by clicking on whitespace or pressing Escape.
     * 
     * If not in edit mode, one click will select a group. The user may use ctrl or shift
     * to add/remove groups from the selection.
     * Dragging a selected group without holding space will move all selected groups.
     * 
     * If user is holding space and dragging anywhere, they move the camera.
     */
    private editMode = false;
    private selectedGroups = new Set<InstructionGroupEditor>();
    private movingGroups = false;

    private selectRectangle = new SelectRectangle();

    private groupEditors: InstructionGroupEditor[] = [];

    constructor() {
        super();
        this.parentComponent.addChild(new DummyText());
        this.parentComponent.addChild(this.selectRectangle);
    }

    public _setEngine(engine: JaPNaAEngine2d): void {
        super._setEngine(engine);
        this.subscriptions.subscribe(this.engine.mouse.onMousedown, this.mousedownHandler);
        this.subscriptions.subscribe(this.engine.mouse.onMousemove, this.mousedragHandler);
        this.subscriptions.subscribe(this.engine.mouse.onMouseup, this.mouseupHandler);
        this.subscriptions.subscribe(this.engine.keyboard.getKeydownBus("KeyA"), this.addGroupHandler);
    }

    private mousedownHandler() {
        if (this.engine.keyboard.isDown(["Space"])) { return; }

        const collisions = this.engine.collisions.getCollisionsWith(
            new RectangleM(this.engine.mouse.worldPos.x, this.engine.mouse.worldPos.y, 1, 1)
        );

        let clickedGroup = null;

        for (const collision of collisions) {
            if (collision.elm instanceof InstructionGroupEditor) {
                clickedGroup = collision.elm;
                break;
            }
        }

        if (this.engine.keyboard.isDown(["ControlLeft", "ControlRight"])) {
            // remove from selection
            if (clickedGroup && this.selectedGroups.has(clickedGroup)) {
                this.selectedGroups.delete(clickedGroup);
                clickedGroup.unsetSelected();
            }
        } else {
            if (!clickedGroup || !this.selectedGroups.has(clickedGroup)) {
                // shift to add to selection; otherwise, clear selection
                if (!this.engine.keyboard.isDown(["ShiftLeft", "ShiftRight"])) {
                    for (const group of this.selectedGroups) { group.unsetSelected(); }
                    this.selectedGroups.clear();
                }
            }
            // add to selection
            if (clickedGroup) {
                this.movingGroups = true;
                if (this.selectedGroups.has(clickedGroup)) {
                    //* incorrect behaviour
                    clickedGroup.setEditMode();
                } else {
                    this.selectedGroups.add(clickedGroup);
                    clickedGroup.setSelected();
                }
            }
        }

    }

    private mousedragHandler(ev: MouseEvent) {
        if (!this.engine.mouse.leftDown) { return; }

        const scale = this.engine.camera.scale;
        if (this.engine.keyboard.isDown(["Space"])) {
            // move camera
            this.engine.camera.move(-ev.movementX / scale, -ev.movementY / scale);
        } else {
            if (this.movingGroups) {
                // drag selected
                for (const group of this.selectedGroups) {
                    group.rect.x += ev.movementX / scale;
                    group.rect.y += ev.movementY / scale;
                }
            } else {
                // select rectangle
                this.selectRectangle.setVisible();
                this.selectRectangle.onDrag();

                const touchingElms = this.engine.collisions.getCollisionsWith(this.selectRectangle.getCollisionRect());
                for (const { elm } of touchingElms) {
                    if (elm instanceof InstructionGroupEditor) {
                        if (!this.selectedGroups.has(elm)) {
                            this.selectedGroups.add(elm);
                            elm.setSelected();
                        }
                    }
                }
            }
        }
    }

    private mouseupHandler() {
        this.movingGroups = false;
        this.selectRectangle.release();
    }

    private addGroupHandler() {
        const newData = newInstructionData();
        const newEditor = new InstructionGroupEditor(this, newData);
        newEditor.rect.x = this.engine.mouse.worldPos.x;
        newEditor.rect.y = this.engine.mouse.worldPos.y;
        this.addGroup(newEditor);
        newEditor.insertNewInstructionLine(0);
        this.cursor.setPosition({
            group: newEditor,
            line: 0,
            editable: 0,
            char: 0
        });
    }

    public requestSelectInstructionGroup(): Promise<InstructionGroupEditor | null> {
        return this.cursor.focusChangeGroup.promise();
    }

    public setInstructions(instructionsData: InstructionData[]) {
        const instructionToElmMap = new Map<InstructionData, InstructionGroupEditor>();
        for (const instruction of instructionsData) {
            const elm = new InstructionGroupEditor(this, instruction);
            instructionToElmMap.set(instruction, elm);
            this.addGroup(elm);
        }

        for (const [instruction, elm] of instructionToElmMap) {
            for (const { target } of instruction.branches) {
                if (target) {
                    elm.addBranchTarget(instructionToElmMap.get(target)!);
                } else {
                    elm.addBranchTarget(null);
                }
            }
        }
    }

    public deserialize(data: EditorSaveData) {
        const idElmMap = new Map<number, InstructionGroupEditor>();
        for (const elmData of data.elms) {
            const instructionData = newInstructionData();
            instructionData.instructions = elmData.instructions;
            instructionData.branches = [];
            for (const branch of elmData.branches) {
                instructionData.branches.push({ instruction: branch });
            }
            instructionData.x = elmData.x;
            instructionData.y = elmData.y;

            const elm = new InstructionGroupEditor(this, instructionData);
            idElmMap.set(elmData.id, elm);
            this.addGroup(elm);
        }

        for (const elmData of data.elms) {
            for (const child of elmData.children) {
                if (child === null) {
                    idElmMap.get(elmData.id)!.addBranchTarget(null);
                } else {
                    idElmMap.get(elmData.id)!.addBranchTarget(idElmMap.get(child)!);
                }
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

class SelectRectangle extends WorldElm {
    private visible = false;
    private startSet = false;

    public drawRelative() {
        if (!this.visible) { return; }
        const X = this.engine.canvas.X;
        X.fillStyle = "#aaf";
        X.strokeStyle = "#008";
        X.globalAlpha = 0.5;
        X.rect(0, 0, this.rect.width, this.rect.height);
        X.fill();
        X.stroke();
        X.globalAlpha = 1;
    }

    public setVisible() {
        this.visible = true;
    }

    public release() {
        this.visible = false;
        this.startSet = false;
    }

    public getCollisionRect() {
        const rect = RectangleM.fromRectangle(this.rect);
        if (rect.width < 0) {
            rect.x += rect.width;
            rect.width = -rect.width;
        }
        if (rect.height < 0) {
            rect.y += rect.height;
            rect.height = -rect.height;
        }
        return rect;
    }

    public onDrag() {
        if (this.startSet) {
            this.rect.width = this.engine.mouse.worldPos.x - this.rect.x;
            this.rect.height = this.engine.mouse.worldPos.y - this.rect.y;
        } else {
            this.startSet = true;
            this.rect.x = this.engine.mouse.worldPos.x;
            this.rect.y = this.engine.mouse.worldPos.y;
            this.rect.width = 0;
            this.rect.height = 0;
        }
    }
}

interface EditorSaveData {
    elms: InstructionElmData[];
}

export interface InstructionElmData {
    id: number;
    instructions: any[],
    branches: ControlItem[],
    children: (number | null)[];
    x: number;
    y: number;
}
