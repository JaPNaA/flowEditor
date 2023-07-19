import { InstructionGroupEditor } from "./InstructionGroupEditor.js";
import { UIDGenerator } from "./UIDGenerator.js";
import { InstructionData, newInstructionData } from "./flowToInstructionData.js";
import { Instruction, registerDefaultBlueprints } from "./instructionLines.js";
import { Elm, JaPNaAEngine2d, ParentComponent, RectangleM, SubscriptionsComponent, Vec2M, WorldElm, WorldElmWithComponents } from "../japnaaEngine2d/JaPNaAEngine2d.js";
import { EditorCursor } from "./EditorCursor.js";
import { ControlItem } from "../FlowRunner.js";
import { AddGroupAction, MarkGroupAsStartAction, RemoveGroupAction, UndoLog } from "./actions.js";
import { GridBackground } from "./GridBackground.js";
import { EditorGroupNavigator } from "./EditorGroupNavigator.js";
import { appHooks } from "../index.js";
import { SmoothCamera } from "./SmoothCamera.js";
import { InstructionBlueprintRegistery } from "./InstructionBlueprintRegistery.js";

export class Editor extends WorldElmWithComponents {
    public cursor = new EditorCursor();
    public undoLog = new UndoLog();
    public smoothCamera = new SmoothCamera();
    public blueprintRegistery = new InstructionBlueprintRegistery();

    /** DO NOT MUTATE OUTSIDE `UndoableAction` */
    public _groupEditors: InstructionGroupEditor[] = []; // todo: make private (see InstructionGroupEditor.relinkParentsToFinalBranch)
    /** DO NOT MUTATE OUTSIDE `UndoableAction` */
    public _children = this.addComponent(new ParentComponent());
    /** DO NOT MUTATE OUTSIDE `UndoableAction` */
    public _startGroup?: InstructionGroupEditor;

    /**
     * Has there been changes? If true, allows autosave every 10 minutes.
     */
    public dirty = false;

    private navigator: EditorGroupNavigator;
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
    private tempEditModeGroup?: InstructionGroupEditor;

    private selectRectangle = new SelectRectangle();

    private requestedInstructionGroupSelectHandlers: ((group: InstructionGroupEditor | null) => any)[] = [];

    constructor() {
        super();
        this._children.addChild(new DummyText());
        this._children.addChild(this.selectRectangle);
        this._children.addChild(new GridBackground());
        this._children.addChild(this.smoothCamera);

        this.navigator = new EditorGroupNavigator(this.subscriptions, this);

        this.subscriptions.subscribe(this.cursor.onKeyboardShortcutPress, ev => {
            this.engine.keyboard.pretendPress(ev);
        });
        this.subscriptions.subscribe(this.cursor.onClickGroup, group => this.handleClickGroup(group));
        this.subscriptions.subscribe(this.cursor.onInput, () => this.dirty = true);

        registerDefaultBlueprints(this.blueprintRegistery);
    }

    public getGroups(): ReadonlyArray<InstructionGroupEditor> {
        return this._groupEditors;
    }

    public _setEngine(engine: JaPNaAEngine2d): void {
        super._setEngine(engine);
        this.subscriptions.subscribe(this.engine.mouse.onMousedown, this.mousedownHandler);
        this.subscriptions.subscribe(this.engine.mouse.onMousemove, this.mousedragHandler);
        this.subscriptions.subscribe(this.engine.mouse.onMouseup, this.mouseupHandler);
        this.subscriptions.subscribe(this.engine.keyboard.getKeydownBus("KeyA"), ev => {
            ev.preventDefault();
            this.addGroupHandler();
        });
        this.subscriptions.subscribe(this.engine.keyboard.getKeydownBus("KeyS"), ev => {
            ev.preventDefault();
            this.markGroupAsStartHandler();
        });
        this.subscriptions.subscribe(this.engine.keyboard.getKeydownBus("KeyZ"), ev => {
            ev.preventDefault();
            this.undoLog.undo();
        });
        this.subscriptions.subscribe(this.engine.keyboard.getKeydownBus("KeyR"), ev => {
            ev.preventDefault();
            appHooks.runFlow();
        });
        this.subscriptions.subscribe(this.engine.keyboard.getKeydownBus(["Backspace", "Delete"]), this.deleteSelectedHandler);
        this.subscriptions.subscribe(this.engine.keyboard.getKeydownBus(["Enter", "NumpadEnter"]), ev => {
            ev.preventDefault();
            this.ensureCursorInSelectedGroup();
            this.setEditMode();
        });
        this.navigator._setEngine(engine);

        this.cursor.autocomplete.setEngine(this.engine);
        this.engine.htmlOverlay.elm.append(this.cursor.autocomplete);
    }

    private mousedownHandler(ev: MouseEvent) {
        ev.preventDefault();
        if (this.engine.keyboard.isDown(["Space"]) || this.engine.mouse.rightDown) { return; }

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
            this.unsetTempEditMode();
            if (group && this.selectedGroups.has(group)) {
                this.deselectGroup(group);
            }
        } else {
            if (!group || !this.selectedGroups.has(group)) {
                // shift to add to selection; otherwise, clear selection
                if (!this.engine.keyboard.isDown(["ShiftLeft", "ShiftRight"])) {
                    this.clearSelection();

                    if (!group) {
                        // clicked on whitespace
                        this.unsetEditMode();
                    }
                }
            }
            // clicked on group: add to selection
            if (group) {
                this.movingGroups = true;

                if (this.selectedGroups.size === 0) {
                    this.engine.mouse.onMouseup.promise().then(() => {
                        if (this.selectedGroups.size === 1) {
                            this.setTempEditMode(group);
                        }
                    });
                }

                if (this.selectedGroups.has(group)) {
                    if (this.selectedGroups.size === 1) {
                        this.setEditMode();
                    }
                } else {
                    this.selectGroup(group);
                    if (this.selectedGroups.size > 1) {
                        this.unsetTempEditMode();
                    }
                }
            }
        }
    }

    public getSelectedGroups(): ReadonlySet<InstructionGroupEditor> {
        return this.selectedGroups;
    }

    public selectGroup(group: InstructionGroupEditor) {
        this.selectedGroups.add(group);
        group.setSelected();
    }

    public deselectGroup(group: InstructionGroupEditor) {
        this.selectedGroups.delete(group);
        group.unsetSelected();
    }

    public moveCameraToGroup(group: InstructionGroupEditor) {
        this.smoothCamera.moveToCenterOn(group.rect);
    }

    public clearSelection() {
        for (const group of this.selectedGroups) { group.unsetSelected(); }
        this.selectedGroups.clear();
        this.unsetTempEditMode();
    }

    private setTempEditMode(group: InstructionGroupEditor) {
        if (this.editMode) { return; }
        if (this.tempEditModeGroup) {
            this.unsetTempEditMode();
        }
        this.tempEditModeGroup = group;
        if (this.cursor.getPosition()?.group !== group) {
            // focus selected group
            this.cursor.setPosition({
                group: group,
                line: 0,
                editable: 0,
                char: 0,
            });
            this.cursor.unfocus();
        }
        group.setEditMode();
    }

    private unsetTempEditMode() {
        if (this.tempEditModeGroup) {
            if (!this.editMode) {
                this.tempEditModeGroup.unsetEditMode();
                this.cursor.unfocus();
            }
            this.tempEditModeGroup = undefined;
        }
    }

    public ensureCursorInSelectedGroup() {
        const cursorPos = this.cursor.getPosition();
        if (!cursorPos || !this.selectedGroups.has(cursorPos.group)) {
            const selectedGroup = this.getOneSelectedGroup();
            if (!selectedGroup) { return; }
            this.cursor.setPosition({
                group: selectedGroup,
                char: 0,
                editable: 0,
                line: 0
            });
            if (!this.editMode) {
                this.cursor.unfocus();
            }
        }
    }

    public setEditMode() {
        if (this.editMode) { return; }
        this.cursor.focus();
        for (const group of this._groupEditors) {
            group.setEditMode();
        }
        this.editMode = true;
        if (this.tempEditModeGroup) {
            this.unsetTempEditMode();
        }
    }

    public getOneSelectedGroup() {
        for (const group of this.selectedGroups) {
            return group;
        }
    }

    public unsetEditMode() {
        this.cursor.unfocus();
        this.unsetTempEditMode();
        if (!this.editMode) { return; }
        for (const group of this._groupEditors) {
            group.unsetEditMode();
        }
        this.editMode = false;
    }

    private mousedragHandler(ev: MouseEvent) {
        const scale = this.engine.camera.getScale();
        if (this.engine.keyboard.isDown(["Space"]) || this.engine.mouse.rightDown) {
            // move camera
            this.engine.camera.move(-ev.movementX / scale, -ev.movementY / scale);
        } else if (this.engine.mouse.leftDown) {
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
        if (this._groupEditors.length === 0) {
            newEditor.rect.x = 8;
            newEditor.rect.y = 24;
        } else {
            newEditor.rect.x = this.engine.mouse.worldPos.x;
            newEditor.rect.y = this.engine.mouse.worldPos.y;
        }
        this.addGroup(newEditor);
        newEditor.requestNewLine(0);
        this.setEditMode();
        this.cursor.setPosition({
            group: newEditor,
            line: 0,
            editable: 0,
            char: 0
        });

        if (this._groupEditors.length === 1) {
            this.markGroupAsStart(this._groupEditors[0]);
        }
        this.handleClickGroup(newEditor);
    }

    private markGroupAsStartHandler() {
        if (this.selectedGroups.size !== 1) { alert("Must select exactly one group to mark as start"); return; }
        for (const group of this.selectedGroups) {
            this.markGroupAsStart(group);
            return;
        }
    }

    private deleteSelectedHandler() {
        if (this.editMode) { return; }
        this.undoLog.startGroup();
        for (const group of this.selectedGroups) {
            this.removeGroup(group);
            this.selectedGroups.delete(group);
        }
        this.undoLog.endGroup();
    }

    public requestSelectInstructionGroup(): Promise<InstructionGroupEditor | null> {
        return new Promise(res => {
            this.requestedInstructionGroupSelectHandlers.push(res);
        });
    }

    public setInstructions(instructionsData: InstructionData[]) {
        this.undoLog.freeze();
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

        this.markGroupAsStart(this._groupEditors[0]);

        this.undoLog.thaw();
        this.populateAutocomplete();
    }

    public deserialize(data: EditorSaveData) {
        this.undoLog.freeze();

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

        if (data.startGroup !== undefined) {
            this.markGroupAsStart(idElmMap.get(data.startGroup)!);
        }

        this.undoLog.thaw();

        this.populateAutocomplete();
    }

    private populateAutocomplete() {
        // todo: make this better
        // wait for render()
        setTimeout(() => {
            for (const group of this._groupEditors) {
                for (const instruction of group._instructions) {
                    for (const line of instruction.getLines()) {
                        for (const editable of line.getEditables()) {
                            if (editable.autoCompleteType) {
                                this.cursor.autocomplete.enteredValue(editable);
                            }
                        }
                    }
                }
            }
        }, 20);
    }

    public addGroup(group: InstructionGroupEditor) {
        this.undoLog.startGroup();
        this.undoLog.perform(new AddGroupAction(group, this));
        this.undoLog.endGroup();
    }

    public removeGroup(group: InstructionGroupEditor) {
        this.undoLog.startGroup();
        group.unsetSelected();
        this.selectedGroups.delete(group);
        group.relinkParentsToFinalBranch();
        this.undoLog.perform(new RemoveGroupAction(group, this));
        this.undoLog.endGroup();
    }

    public markGroupAsStart(group: InstructionGroupEditor) {
        this.undoLog.startGroup();
        this.undoLog.perform(new MarkGroupAsStartAction(group, this));
        this.undoLog.endGroup();
    }

    public serialize(): EditorSaveData {
        const uidGen = new UIDGenerator();
        const elms = [];
        for (const groupEditor of this._groupEditors) {
            elms.push(groupEditor.serialize(uidGen));
        }
        return {
            elms: elms,
            startGroup: this._startGroup && uidGen.getId(this._startGroup)
        };
    }

    public compile() {
        const startIndicies = new Map<InstructionGroupEditor, number>();

        const compiled: any[] = [];
        const groupInstructions: Instruction[][] = [];
        let index = 0;

        if (!this._startGroup) { throw new Error("No start group specified."); }

        const groupEditors = [this._startGroup];
        for (const editor of this._groupEditors) {
            if (editor !== this._startGroup) {
                groupEditors.push(editor);
            }
        }

        for (const group of groupEditors) {
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
    startGroup?: number;
}

export interface InstructionElmData {
    id: number;
    instructions: any[],
    branches: ControlItem[],
    children: number[][];
    x: number;
    y: number;
}
