import { InstructionGroup } from "./InstructionGroup";
import { UIDGenerator } from "./toolchain/UIDGenerator";
import { Elm, JaPNaAEngine2d, ParentComponent, QuadtreeParentComponent, RectangleM, SubscriptionsComponent, WorldElm, WorldElmWithComponents } from "../../japnaaEngine2d/JaPNaAEngine2d";
import { EditorCursor } from "./editing/EditorCursor";
import { UndoableAction } from "./editing/actions/UndoableAction";
import { GridBackground } from "./ui/GridBackground";
import { EditorGroupNavigator } from "./ui/EditorGroupNavigator";
import { appHooks, pluginHooks } from "../index";
import { SmoothCamera } from "./ui/SmoothCamera";
import { InstructionBlueprintRegistery } from "./instruction/InstructionBlueprintRegistery";
import { Instruction } from "./instruction/instructionTypes";
import { InstructionDeserializer } from "./toolchain/InstructionDeserializer";
import { NewInstructionAutocompleteSuggester } from "./instruction/NewInstructionAutocompleteSuggester";
import { TextOpDialogue } from "../modals/TextOpDialogue";
import { EditorSaveData } from "./EditorSaveData";
import { newInstructionData } from "./toolchain/flowToInstructionData";
import { InstructionGroupEditor } from "./ui/InstructionGroupEditor";
import { removeElmFromArray } from "../../japnaaEngine2d/util/removeElmFromArray";
import { UndoLog } from "./editing/actions/UndoLog";
import { ActionBusDispatchable } from "./editing/actions/ActionBus";

export class Editor extends WorldElmWithComponents {
    public cursor = new EditorCursor();
    public actionBus = new ActionBusDispatchable();
    public undoLog = new UndoLog();
    public smoothCamera = new SmoothCamera();
    public blueprintRegistery = new InstructionBlueprintRegistery();
    public deserializer = new InstructionDeserializer();
    public textOpDialogue = new TextOpDialogue();

    private nonGroupEditorChildren = this.addComponent(new ParentComponent());

    private groupEditors: InstructionGroup[] = []; // todo: make private (see InstructionGroupEditor.relinkParentsToFinalBranch)
    private children = this.addComponent(new QuadtreeParentComponent());
    private startGroup?: InstructionGroup;


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
    private selectedGroups = new Set<InstructionGroup>();
    private movingGroups = false;
    private tempEditModeGroup?: InstructionGroup;

    private selectRectangle = new SelectRectangle();

    private requestedInstructionGroupSelectHandlers: ((group: InstructionGroup | null) => any)[] = [];

    constructor() {
        super();
        this.nonGroupEditorChildren.addChild(new DummyText());
        this.nonGroupEditorChildren.addChild(this.selectRectangle);
        this.nonGroupEditorChildren.addChild(new GridBackground());
        this.nonGroupEditorChildren.addChild(this.smoothCamera);

        this.navigator = new EditorGroupNavigator(this.subscriptions, this);

        this.subscriptions.subscribe(this.cursor.onKeyboardShortcutPress, ev => {
            this.engine.keyboard.pretendPress(ev);
        });
        this.subscriptions.subscribe(this.cursor.onClickGroup, group => this.handleClickGroup(group));
        this.subscriptions.subscribe(this.cursor.onInput, () => this.dirty = true);

        this.actionBus.subscribe(AddGroupAction, action => {
            this.groupEditors.push(action.group);
            this.children.addChild(action.group.editor);

            // add parent-child relations
            for (const child of action.group.childGroups) {
                child.parentGroups.push(action.group);
            }
            for (const parent of action.group.parentGroups) {
                parent.childGroups.push(action.group);
            }
        });

        this.actionBus.subscribe(RemoveGroupAction, action => {
            removeElmFromArray(action.group, this.groupEditors);
            this.children.removeChild(action.group.editor);
            this.cursor.unregisterGroupEditor(action.group);

            // remove parent-child relations
            for (const child of action.group.childGroups) {
                removeElmFromArray(action.group, child.parentGroups);
            }
            for (const parent of action.group.parentGroups) {
                removeElmFromArray(action.group, parent.childGroups);
            }
        });

        this.actionBus.subscribe(MarkGroupAsStartAction, action => {
            if (this.startGroup) {
                this.startGroup._isStartGroup = false;
            }
            this.startGroup = action.group;
            if (this.startGroup) {
                this.startGroup._isStartGroup = true;
            }
        });

        this.undoLog.onAfterAllActionsPerformed.subscribe(() => this.engine.ticker.requestTick());
    }

    public getGroups(): ReadonlyArray<InstructionGroup> {
        return this.groupEditors;
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
        this.cursor.autocomplete.registerSuggester(
            NewInstructionAutocompleteSuggester.symbol,
            new NewInstructionAutocompleteSuggester(this.blueprintRegistery)
        );
        this.engine.htmlOverlay.elm.append(this.cursor.autocomplete);
    }

    private mousedownHandler(ev: MouseEvent) {
        ev.preventDefault();
        if (this.engine.keyboard.isDown(["Space"]) || this.engine.mouse.rightDown) { return; }

        const collisions = this.engine.collisions.getCollisionsWith(
            new RectangleM(this.engine.mouse.worldPos.x, this.engine.mouse.worldPos.y, 1, 1)
        );

        let clickedGroup: InstructionGroupEditor | null = null;

        for (const collision of collisions) {
            if (collision.elm instanceof InstructionGroupEditor) {
                clickedGroup = collision.elm;
                break;
            }
        }

        this.handleClickGroup(clickedGroup?.instructionGroup || null, ev);
    }

    private handleClickGroup(
        group: InstructionGroup | null,
        keyboard: { ctrlKey: boolean, shiftKey: boolean } = { ctrlKey: false, shiftKey: false }
    ) {
        // handle select handlers
        for (const handler of this.requestedInstructionGroupSelectHandlers) {
            handler(group);
        }
        this.requestedInstructionGroupSelectHandlers.length = 0;

        // handle selections
        if (keyboard.ctrlKey) {
            // ctrl: remove from selection
            this.unsetTempEditMode();
            if (group && this.selectedGroups.has(group)) {
                this.deselectGroup(group);
            }
        } else {
            if (!group || !this.selectedGroups.has(group)) {
                // shift to add to selection; otherwise, clear selection
                if (!keyboard.shiftKey) {
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
        this.engine.ticker.requestTick();
    }

    public getSelectedGroups(): ReadonlySet<InstructionGroup> {
        return this.selectedGroups;
    }

    public selectGroup(group: InstructionGroup) {
        this.selectedGroups.add(group);
        group.editor.setSelected();
    }

    public deselectGroup(group: InstructionGroup) {
        this.selectedGroups.delete(group);
        group.editor.unsetSelected();
    }

    public moveCameraToGroup(group: InstructionGroup) {
        this.smoothCamera.moveToCenterOn(group.editor.rect);
    }

    public clearSelection() {
        for (const group of this.selectedGroups) { group.editor.unsetSelected(); }
        this.selectedGroups.clear();
        this.unsetTempEditMode();
    }

    private setTempEditMode(group: InstructionGroup) {
        if (this.editMode) { return; }
        if (this.tempEditModeGroup) {
            this.unsetTempEditMode();
        }
        this.tempEditModeGroup = group;
        group.editor.setEditMode();
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
    }

    private unsetTempEditMode() {
        if (this.tempEditModeGroup) {
            if (!this.editMode) {
                this.tempEditModeGroup.editor.unsetEditMode();
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
        for (const group of this.groupEditors) {
            group.editor.setEditMode();
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
        for (const group of this.groupEditors) {
            group.editor.unsetEditMode();
        }
        this.editMode = false;
    }

    private mousedragHandler(ev: MouseEvent) {
        const scale = this.engine.camera.getScale() * this.engine.sizer.scaling;
        if (this.engine.keyboard.isDown(["Space"]) || this.engine.mouse.rightDown) {
            // move camera
            this.engine.camera.move(-ev.movementX / scale, -ev.movementY / scale);
            this.engine.ticker.requestTick();
        } else if (this.engine.mouse.leftDown) {
            if (this.movingGroups) {
                // drag selected
                for (const group of this.selectedGroups) {
                    const groupEditor = group.editor;
                    groupEditor.rect.x += ev.movementX / scale;
                    groupEditor.rect.y += ev.movementY / scale;
                    groupEditor.updateAfterMove();
                }
                this.engine.ticker.requestTick();
            } else {
                // select rectangle
                this.selectRectangle.setVisible();
                this.selectRectangle.onDrag();

                const touchingElms = this.engine.collisions.getCollisionsWith(this.selectRectangle.getCollisionRect());
                for (const { elm } of touchingElms) {
                    if (elm instanceof InstructionGroupEditor) {
                        if (!this.selectedGroups.has(elm.instructionGroup)) {
                            this.selectedGroups.add(elm.instructionGroup);
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
        if (this.groupEditors.length === 0) {
            newData.x = 8;
            newData.y = 24;
        } else {
            newData.x = this.engine.mouse.worldPos.x - InstructionGroupEditor.defaultWidth / 2;
            newData.y = this.engine.mouse.worldPos.y - 16;
        }
        this.undoLog.startGroup();
        const newEditor = new InstructionGroup(this, newData);
        this.addGroup(newEditor);
        this.setEditMode();
        newEditor.editor.showElm(); // show so that it can be focused
        newEditor.setupConstruct();
        newEditor.requestNewLine(0);
        this.cursor.setPosition({
            group: newEditor,
            line: 0,
            editable: 0,
            char: 0
        });

        if (this.groupEditors.length === 1) {
            this.markGroupAsStart(this.groupEditors[0]);
        }
        this.handleClickGroup(newEditor);
        this.undoLog.endGroup();
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

    public requestSelectInstructionGroup(): Promise<InstructionGroup | null> {
        return new Promise(res => {
            this.requestedInstructionGroupSelectHandlers.push(res);
        });
    }

    public deserialize(data: EditorSaveData) {
        this.undoLog.freeze();

        const idElmMap = new Map<number, InstructionGroup>();
        for (const elmData of data.elms) {
            const instructionData = newInstructionData();
            instructionData.instructions = elmData.instructions;
            instructionData.branches = [];
            for (const branch of elmData.branches) {
                instructionData.branches.push(branch);
            }
            instructionData.x = elmData.x;
            instructionData.y = elmData.y;

            const elm = new InstructionGroup(this, instructionData);
            idElmMap.set(elmData.id, elm);
            this.addGroup(elm);
        }

        for (const elmData of data.elms) {
            const group = idElmMap.get(elmData.id)!;
            for (const children of elmData.children) {
                if (children === null) {
                    group.addBranchTargets(null);
                } else {
                    if (Array.isArray(children)) {
                        const targets = [];
                        for (const child of children) {
                            targets.push(idElmMap.get(child)!);
                        }
                        group.addBranchTargets(targets);
                    } else {
                        // backwards compatibility: handle case when not array
                        group.addBranchTargets([idElmMap.get(children)!]);
                    }
                }
            }
            group.setupConstruct();
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
            for (const group of this.groupEditors) {
                for (const line of group.block.lineIter()) {
                    for (const editable of line.getEditables()) {
                        if (editable.autoCompleteType) {
                            this.cursor.autocomplete.enteredValue(editable);
                        }
                    }
                }
            }
        }, 20);
    }

    public addGroup(group: InstructionGroup) {
        this.undoLog.startGroup();
        this.undoLog.perform(new AddGroupAction(group, this));
        this.undoLog.endGroup();

        if (this.editMode) {
            group.editor.setEditMode();
        }
    }

    public removeGroup(group: InstructionGroup) {
        this.undoLog.startGroup();
        group.editor.unsetSelected();
        this.selectedGroups.delete(group);
        group.relinkParentsToFinalBranch();
        this.undoLog.perform(new RemoveGroupAction(group, this));
        this.undoLog.endGroup();
    }

    public markGroupAsStart(group: InstructionGroup) {
        this.undoLog.startGroup();
        this.undoLog.perform(new MarkGroupAsStartAction(group, this.startGroup, this));
        this.undoLog.endGroup();
        this.engine.ticker.requestTick();
    }

    public getStartGroup(): InstructionGroup | undefined {
        return this.startGroup;
    }

    public serialize(): EditorSaveData {
        const uidGen = new UIDGenerator();
        const elms = [];
        for (const groupEditor of this.groupEditors) {
            elms.push(groupEditor.serialize(uidGen));
        }
        return {
            elms: elms,
            startGroup: this.startGroup && uidGen.getId(this.startGroup)
        };
    }

    public compile() {
        const startIndicies = new Map<InstructionGroup, number>();

        const compiled: any[] = pluginHooks.getFlowHeader();
        const groupInstructions: Instruction[][] = [];
        let index = 0;

        if (!this.startGroup) { throw new Error("No start group specified."); }

        const groupEditors = [this.startGroup];
        for (const editor of this.groupEditors) {
            if (editor !== this.startGroup) {
                groupEditors.push(editor);
            }
        }

        for (const group of groupEditors) {
            startIndicies.set(group, index);
            const instructions = [];
            for (const block of group.block.children) {
                if (block.instruction) {
                    instructions.push(block.instruction);
                    index += block.instruction.export().length;
                }
            }
            groupInstructions.push(instructions);
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

    public openTextOp() {
        this.textOpDialogue.setEditablesFromGroups(this.undoLog, this.groupEditors);
        appHooks.showModal(this.textOpDialogue);
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

export class AddGroupAction implements UndoableAction {
    public static key = Symbol();
    public key = AddGroupAction.key;

    constructor(public group: InstructionGroup, public editor: Editor) { }

    public getTarget(): ActionBusDispatchable {
        return this.editor.actionBus;
    }

    public inverse(): RemoveGroupAction {
        return new RemoveGroupAction(this.group, this.editor);
    }
}

export class RemoveGroupAction implements UndoableAction {
    public static key = Symbol();
    public key = RemoveGroupAction.key;

    constructor(public group: InstructionGroup, public editor: Editor) { }

    public getTarget(): ActionBusDispatchable {
        return this.editor.actionBus;
    }

    public inverse(): AddGroupAction {
        return new AddGroupAction(this.group, this.editor);
    }
}


export class MarkGroupAsStartAction implements UndoableAction {
    public static key = Symbol();
    public key = MarkGroupAsStartAction.key;

    constructor(
        public group: InstructionGroup | undefined,
        public previousStartGroup: InstructionGroup | undefined,
        public editor: Editor
    ) { }

    public getTarget(): ActionBusDispatchable {
        return this.editor.actionBus;
    }

    public inverse(): MarkGroupAsStartAction {
        return new MarkGroupAsStartAction(this.previousStartGroup, this.group, this.editor);
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
        if (!this.visible) { this.engine.ticker.requestTick(); }
        this.visible = true;
    }

    public release() {
        if (!this.visible) { return; }
        this.visible = false;
        this.startSet = false;
        this.engine.ticker.requestTick();
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
        this.engine.ticker.requestTick();
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
