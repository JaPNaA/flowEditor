import { EventBus } from "../../../../japnaaEngine2d/JaPNaAEngine2d";
import { ActionBusDispatchable } from "./ActionBus";
import { UndoableAction } from "./UndoableAction";

export class UndoLog {
    private currLogGroup: UndoableAction[] = [];
    private log: UndoableAction[][] = [];

    private groupDepth = 0;
    private frozen = false;

    /**
     * Event triggered after an action is performed by the user,
     * or many grouped actions are performed when undone
     */
    public onAfterAllActionsPerformed = new EventBus();

    public constructor(
        /** Action bus that recieves all actions */
        private actionBus: ActionBusDispatchable
    ) { }

    public undo() {
        this.flushLogGroup();
        const logs = this.log.pop();
        if (!logs) { return; }
        let log;
        while (log = logs.pop()) {
            const action = log.inverse();
            action.getTarget().dispatch(action);
            this.actionBus.dispatch(action);
        }
        this.onAfterAllActionsPerformed.send();
    }

    public freeze() {
        this.frozen = true;
    }

    public thaw() {
        this.frozen = false;
    }

    public startGroup() {
        this.groupDepth++;
    }

    public endGroup() {
        this.groupDepth--;
        if (this.groupDepth == 0) {
            this.flushLogGroup();
        } else if (this.groupDepth < 0) {
            throw new Error("Undo group depths not matching");
        }
    }

    public perform(action: UndoableAction) {
        if (!this.frozen) { this.currLogGroup.push(action); }
        action.getTarget().dispatch(action);
        this.actionBus.dispatch(action);
        this.onAfterAllActionsPerformed.send();
    }

    private flushLogGroup() {
        if (this.currLogGroup.length) {
            this.log.push(this.currLogGroup);
            this.currLogGroup = [];
        }
    }
}