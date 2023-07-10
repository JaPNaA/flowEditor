import { InstructionGroupEditor } from "./InstructionGroupEditor.js";
import { UIDGenerator } from "./UIDGenerator.js";
import { InstructionData, newInstructionData } from "./flowToInstructionData.js";
import { Instruction, InstructionLine } from "./instructionLines.js";
import { Elm, JaPNaAEngine2d, ParentComponent, RectangleM, SubscriptionsComponent, WorldElm, WorldElmWithComponents } from "../japnaaEngine2d/JaPNaAEngine2d.js";
import { EditorCursor } from "./EditorCursor.js";
import { ControlItem } from "../FlowRunner.js";
import { removeElmFromArray } from "../japnaaEngine2d/util/removeElmFromArray.js";

export class Editor extends WorldElmWithComponents {
    public cursor = new EditorCursor();

    private parentComponent = this.addComponent(new ParentComponent());
    private subscriptions = this.addComponent(new SubscriptionsComponent());

    /**
     * In edit mode, the user can can edit the contents of the group and move the
     * cursor (also to other groups) in one click.
     * The user activates edit mode by clicking on the selected group when there is only
     * one selected group, or pressing enter.
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

    public groupEditors: InstructionGroupEditor[] = []; // todo: make private (see InstructionGroupEditor.relinkParentsToFinalBranch)

    private requestedInstructionGroupSelectHandlers: ((group: InstructionGroupEditor | null) => any)[] = [];

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
        this.subscriptions.subscribe(this.engine.keyboard.getKeydownBus(["Backspace", "Delete"]), this.deleteSelectedHandler);
        this.subscriptions.subscribe(this.engine.keyboard.getKeydownBus(["Enter", "NumpadEnter"]), ev => {
            ev.preventDefault();
            this.setEditMode();
        });
        this.subscriptions.subscribe(this.cursor.focusChangeGroup, group => this.handleClickGroup(group));
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

        this.handleClickGroup(clickedGroup);
    }

    private handleClickGroup(group: InstructionGroupEditor | null) {
        // handle select handlers
        for (const handler of this.requestedInstructionGroupSelectHandlers) {
            handler(group);
        }
        this.requestedInstructionGroupSelectHandlers.length = 0;

        // handle selections
        if (this.engine.keyboard.isDown(["ControlLeft", "ControlRight"])) {
            // ctrl: remove from selection
            if (group && this.selectedGroups.has(group)) {
                this.selectedGroups.delete(group);
                group.unsetSelected();
            }
        } else {
            if (!group || !this.selectedGroups.has(group)) {
                // shift to add to selection; otherwise, clear selection
                if (!this.engine.keyboard.isDown(["ShiftLeft", "ShiftRight"])) {
                    for (const group of this.selectedGroups) { group.unsetSelected(); }
                    this.selectedGroups.clear();

                    if (!group) {
                        // clicked on whitespace
                        this.unsetEditMode();
                    }
                }
            }
            // clicked on group: add to selection
            if (group) {
                this.movingGroups = true;
                if (this.selectedGroups.has(group)) {
                    if (this.selectedGroups.size === 1) {
                        this.setEditMode();
                    }
                } else {
                    this.selectedGroups.add(group);
                    group.setSelected();
                }
            }
        }
    }

    public setEditMode() {
        this.cursor.show();
        for (const group of this.groupEditors) {
            group.setEditMode();
        }

        // focus selected group
        setTimeout(() => {
            for (const selectedGroup of this.selectedGroups) {
                this.cursor.setPosition({
                    group: selectedGroup,
                    line: 0,
                    editable: 0,
                    char: 0,
                });
                break; // only one
            }
        }, 1);
    }

    public unsetEditMode() {
        this.cursor.hide();
        for (const group of this.groupEditors) {
            group.unsetEditMode();
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
        this.setEditMode();
        this.cursor.setPosition({
            group: newEditor,
            line: 0,
            editable: 0,
            char: 0
        });
    }

    private deleteSelectedHandler() {
        if (this.editMode) { return; }
        for (const group of this.selectedGroups) {
            this.removeGroup(group);
            this.selectedGroups.delete(group);
        }
    }

    public requestSelectInstructionGroup(): Promise<InstructionGroupEditor | null> {
        return new Promise(res => {
            this.requestedInstructionGroupSelectHandlers.push(res);
        });
    }

    public setInstructions(instructionsData: InstructionData[]) {
        const instructionToElmMap = new Map<InstructionData, InstructionGroupEditor>();
        for (const instruction of instructionsData) {
            const elm = new InstructionGroupEditor(this, instruction);
            instructionToElmMap.set(instruction, elm);
            this.addGroup(elm);
        }

        for (const [instruction, elm] of instructionToElmMap) {
            for (const { targets } of instruction.branches) {
                if (targets) {
                    const resolved = [];
                    for (const target of targets) {
                        if (target) {
                            resolved.push(instructionToElmMap.get(target)!);
                        } else {
                            resolved.push(null);
                        }
                    }
                    elm.addBranchTargets(resolved);
                } else {
                    elm.addBranchTargets(null);
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
            for (const children of elmData.children) {
                if (children === null) {
                    idElmMap.get(elmData.id)!.addBranchTargets(null);
                } else {
                    if (Array.isArray(children)) {
                        const targets = [];
                        for (const child of children) {
                            targets.push(idElmMap.get(child)!);
                        }
                        idElmMap.get(elmData.id)!.addBranchTargets(targets);
                    } else {
                        // backwards compatibility: handle case when not array
                        idElmMap.get(elmData.id)!.addBranchTargets([idElmMap.get(children)!]);
                    }
                }
            }
        }
    }

    public addGroup(group: InstructionGroupEditor) {
        this.groupEditors.push(group);
        this.parentComponent.addChild(group);
        this.cursor.registerInstructionGroup(group);
    }

    public removeGroup(group: InstructionGroupEditor) {
        removeElmFromArray(group, this.groupEditors);
        group.relinkParentsToFinalBranch();
        this.parentComponent.removeChild(group);
        this.cursor.unregisterInstructionGroup(group);
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
        const groupInstructions: Instruction[][] = [];
        let index = 0;

        for (const group of this.groupEditors) {
            startIndicies.set(group, index);
            const instructions = group.getInstructions();
            groupInstructions.push(instructions);
            for (const instruction of instructions) {
                index += instruction.export().length;
            }
        }

        index = 0;
        for (const group of groupInstructions) {
            for (const instruction of group) {
                let exportedInstructions: any[];
                if (instruction.isBranch()) {
                    const targets = instruction.getBranchTargets();
                    if (targets) {
                        const offsets: (number | null)[] = [];
                        for (const target of targets) {
                            if (target) {
                                offsets.push(startIndicies.get(target)! - index);
                            } else {
                                offsets.push(null);
                            }
                        }
                        instruction.setBranchOffsets(offsets);
                        exportedInstructions = instruction.export();
                    } else {
                        exportedInstructions = [{ ctrl: 'nop' }];
                        console.warn("Removed branch because there was no targets");
                    }
                } else {
                    exportedInstructions = instruction.export();
                }

                for (const instruction of exportedInstructions) {
                    compiled.push(instruction);
                }
                index += exportedInstructions.length;
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
    children: number[][];
    x: number;
    y: number;
}
