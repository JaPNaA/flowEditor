type RequestHandler<T> = (request: T, controls: EventControls) => void;

/**
 * RequestAccepter accepts a request, or passes the reqeuest on to to a parent.
 * 
 * Request accepters should only perform actions to handle requests.
 */
export class RequestAccepter<T> {
    private getNextAccepter?: () => RequestAccepter<T> | undefined;

    /**
     * @param handler A handler that performs the appropriate actions for the request.
     */
    constructor(private handler?: RequestHandler<T>, nextAccepter?: RequestAccepter<T>) {
        this.handler = handler;
        if (nextAccepter) {
            this.getNextAccepter = () => nextAccepter;
        }
    }

    public setHandler(handler: RequestHandler<T>) {
        this.handler = handler;
    }

    public setGetNextAccepter(accepter: () => RequestAccepter<T> | undefined) {
        this.getNextAccepter = accepter;
    }

    public accept(data: T): EventControls {
        const eventControls: EventControls = { accepted: false };
        this.handler?.(data, eventControls);

        if (!eventControls.accepted) {
            return this.getNextAccepter?.()?.accept(data) || eventControls;
        }

        return eventControls;
    }
}

/**
 * Object passed around to event handlers, containing information
 * about the event.
 */
export interface EventControls {
    /**
     * Mark the action as 'accepted', so the event doesn't cause
     * any additional actions.
     */
    accepted: boolean;
}
