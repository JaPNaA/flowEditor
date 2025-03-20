import { ActionInstance } from "./ActionBus";

export interface UndoableAction extends ActionInstance {
    // perform(): void;
    inverse(): UndoableAction;
}
