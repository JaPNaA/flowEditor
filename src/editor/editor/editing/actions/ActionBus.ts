import { removeElmFromArray } from "../../../../japnaaEngine2d/util/removeElmFromArray";

type EventHandler<T extends ActionInstance> = (action: T) => void;

/**
 * ActionBus propagates Actions through the system.
 */
export class ActionBusDispatchable implements ActionBus {
    /**
     * The parent bus will recieve all events from this bus.
     */
    // todo: evaluate if we actually need this
    // we might need this for plugins, but there is currently no
    // valid usecase in the editor
    public getParentBus?: () => ActionBusDispatchable | undefined;

    private actionHandlers = new Map<symbol, EventHandler<any>[]>();
    private allHandlers: EventHandler<any>[] = [];

    public subscribe<T extends ActionInstance>(action: ActionClass<T>, handler: EventHandler<T>) {
        const existing = this.actionHandlers.get(action.key);
        if (existing) {
            existing.push(handler);
        } else {
            this.actionHandlers.set(action.key, [handler]);
        }
    }

    public subscribeAllActions(handler: EventHandler<ActionInstance>) {
        this.allHandlers.push(handler);
    }

    public unsubscribe<T extends ActionInstance>(action: ActionClass<T>, handler: EventHandler<T>) {
        const existing = this.actionHandlers.get(action.key);
        if (!existing) { throw new Error("Trying to unsubscribe a handler that's not subscribed (never had handler for action)"); }
        removeElmFromArray(handler, existing);
    }

    public unsubscribeAllActions(handler: EventHandler<ActionInstance>) {
        removeElmFromArray(handler, this.allHandlers);
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

        const parentBus = this.getParentBus?.();
        if (parentBus) {
            parentBus.dispatch(action);
        }
    }
}

export interface ActionClass<T extends ActionInstance> {
    new(...args: any[]): T;
    key: symbol;
}

export interface ActionInstance {
    key: symbol;

    /**
     * Gets the action bus to recieve this action.
     */
    getTarget(): ActionBusDispatchable;
}

export interface ActionBus {
    subscribe<T extends ActionInstance>(action: ActionClass<T>, handler: (action: T) => void): void;
    unsubscribe<T extends ActionInstance>(action: ActionClass<T>, handler: (action: T) => void): void;
}
