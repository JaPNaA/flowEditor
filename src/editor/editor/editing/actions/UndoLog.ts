import { EventBus } from "../../../../japnaaEngine2d/JaPNaAEngine2d";
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

    public constructor() { }

    public undo() {
        this.flushLogGroup();
        const logs = this.log.pop();
        if (!logs) { return; }
        let log;
        while (log = logs.pop()) {
            const action = log.inverse();
            const result = action.getTarget().dispatch(action);
            if (result.rejected) {
                console.warn("Undo action was rejected", action);
            }
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
        const result = action.getTarget().dispatch(action);
        if (!this.frozen && !result.rejected) {
            this.currLogGroup.push(action);
        }
        this.onAfterAllActionsPerformed.send();
        return result;
    }

    private flushLogGroup() {
        if (this.currLogGroup.length) {
            this.log.push(this.currLogGroup);
            this.currLogGroup = [];
        }
    }
}