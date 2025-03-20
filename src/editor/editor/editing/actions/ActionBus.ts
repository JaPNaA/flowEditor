import { removeElmFromArray } from "../../../../japnaaEngine2d/util/removeElmFromArray";

type EventHandler<T extends ActionInstance> = (action: T, controls: ActionControls) => void;

/**
 * ActionBus propagates Actions through the system.
 */
export class ActionBusDispatchable implements ActionBus {
    /**
     * If an event has not been handled after running all handles for this bus,
     * the event will be propagated to the parent action bus.
     */
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

    public dispatch(action: ActionInstance): ActionControls {
        const handlers = this.actionHandlers.get(action.key);
        const eventControls: ActionControls = { accepted: false, rejected: false };

        if (handlers) {
            for (const handler of handlers) {
                handler(action, eventControls);
            }
        }
        for (const allHandler of this.allHandlers) {
            allHandler(action, eventControls);
        }

        if (!eventControls.accepted) {
            const parentBus = this.getParentBus?.();
            if (parentBus) {
                return parentBus.dispatch(action)
            }
        }

        return eventControls;
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

/**
 * Object passed around to event handlers, containing information
 * about the event.
 */
export interface ActionControls {
    /**
     * Mark the action as 'accepted', so future handlers do not
     * perform a second action.
     */
    accepted: boolean;
    /**
     * Mark the action as 'rejected' (nothing happened), so the action 
     * will not be added to the undo log.
     */
    rejected: boolean;
}

export interface ActionBus {
    subscribe<T extends ActionInstance>(action: ActionClass<T>, handler: (action: T) => void): void;
    unsubscribe<T extends ActionInstance>(action: ActionClass<T>, handler: (action: T) => void): void;
}
