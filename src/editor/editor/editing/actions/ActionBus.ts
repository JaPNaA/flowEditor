/**
 * ActionBus propagates Actions through the system.
 */
export class ActionBusDispatchable implements ActionBus {
    private actionHandlers = new Map<symbol, ((action: any) => void)[]>();
    private allHandlers: ((action: any) => void)[] = [];

    public subscribe<T extends ActionInstance>(action: ActionClass<T>, handler: (action: T) => void) {
        const existing = this.actionHandlers.get(action.key);
        if (existing) {
            existing.push(handler);
        } else {
            this.actionHandlers.set(action.key, [handler]);
        }
    }

    public subscribeAllActions(handler: (action: ActionInstance) => void) {
        this.allHandlers.push(handler);
    }

    public unsubscribe<T extends ActionInstance>(action: ActionClass<T>, handler: (action: T) => void) {
        const existing = this.actionHandlers.get(action.key);
        if (!existing) { throw new Error("Trying to unsubscribe a handler that's not subscribed (never had handler for action)"); }
        const index = existing.indexOf(handler);
        if (index < 0) { throw new Error("Trying to unsubscribe a handler that's not subscribed"); }
        existing.splice(index, 1);
    }

    public dispatch(action: ActionInstance) {
        const handlers = this.actionHandlers.get(action.key);
        if (handlers) {
            for (const handler of handlers) {
                handler(action);
            }
        }
        for (const allHandler of this.allHandlers) {
            allHandler(action);
        }
    }
}

export interface ActionClass<T extends ActionInstance> {
    new(...args: any[]): T;
    key: symbol;
}

export interface ActionInstance {
    key: symbol;
}

export interface ActionBus {
    subscribe<T extends ActionInstance>(action: ActionClass<T>, handler: (action: T) => void): void;
    unsubscribe<T extends ActionInstance>(action: ActionClass<T>, handler: (action: T) => void): void;
}
