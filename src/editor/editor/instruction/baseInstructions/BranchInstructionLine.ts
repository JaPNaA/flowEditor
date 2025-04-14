import { Elm } from "../../../../japnaaEngine2d/elements";
import { removeElmFromArray } from "../../../../japnaaEngine2d/util/removeElmFromArray";
import { appHooks } from "../../../index";
import { ActionBusDispatchable } from "../../editing/actions/ActionBus";
import { UndoableAction } from "../../editing/actions/UndoableAction";
import { InstructionGroup } from "../../InstructionGroup";
import { InstructionLine } from "../InstructionLine";

export abstract class BranchInstructionLine extends InstructionLine {
    public branchTarget: InstructionGroup | null = null;
    public branchOffset: number = 0;

    public actionBus = new ActionBusDispatchable();

    private branchConnectElm = new Elm()
        .class("branchConnect").attribute("contenteditable", "false")
        .on("click", () => {
            this.parentBlock.getGroup()?.group.editor.unsetEditMode();
            appHooks.focusEditor();
            this.requestUserToSetBranchTarget();
        });

    constructor() {
        super();
        this.updateElmState();

        this.actionBus.subscribe(BranchTargetChangeAction, action => {
            const groupBlock = action.branchLine.parentBlock.getGroup();
            if (!groupBlock) { throw new Error("No group editor"); }
            const group = groupBlock.group;

            // remove parent/child relation
            if (action.previousBranchTarget) {
                removeElmFromArray(
                    action.previousBranchTarget,
                    group.childGroups
                );
                removeElmFromArray(
                    group,
                    action.previousBranchTarget.parentGroups
                );
            }

            // update instruction
            action.branchLine.branchTarget = action.branchTarget;
            action.branchLine.updateElmState();

            // update parent/child relations
            if (action.branchTarget) {
                action.branchTarget.parentGroups.push(group);
                group.childGroups.push(action.branchTarget);
            }

            // update render hitboxes
            group.editor.updateAfterMove();
        });
    }

    public reset(): void {
        super.reset();
        this.elm.appendAsFirst(this.branchConnectElm);
    }

    public requestUserToSetBranchTarget() {
        this.branchConnectElm.class("active");
        this.parentBlock.instruction!.requestSelectInstructionGroup()
            .then(editor => {
                this.branchConnectElm.removeClass("active");
                if (editor) {
                    this.setBranchTarget(editor);
                }
            });
    }

    public getBranchTarget() {
        return this.branchTarget;
    }

    public setBranchOffset(branchOffset: number) {
        this.branchOffset = branchOffset;
    }

    public setBranchTarget(target: InstructionGroup | null) {
        const editor = this.parentBlock.getGroup()?.group.parentEditor;
        if (!editor) { throw new Error("No editor attached"); }
        editor.undoLog.startGroup();
        editor.undoLog.perform(
            new BranchTargetChangeAction(target, this.branchTarget, this)
        );
        editor.undoLog.endGroup();
    }

    private updateElmState() {
        if (this.branchTarget) {
            this.elm.removeClass("hanging");
        } else {
            this.elm.class("hanging");
        }
    }
}

export class BranchTargetChangeAction implements UndoableAction {
    public static key = Symbol();
    public key = BranchTargetChangeAction.key;

    constructor(
        public branchTarget: InstructionGroup | null,
        public previousBranchTarget: InstructionGroup | null,
        public branchLine: BranchInstructionLine
    ) { }

    public getTarget(): ActionBusDispatchable {
        return this.branchLine.actionBus;
    }

    public inverse(): UndoableAction {
        return new BranchTargetChangeAction(this.previousBranchTarget, this.branchTarget, this.branchLine);
    }
}
