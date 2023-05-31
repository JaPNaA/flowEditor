import { EditorCursor } from "./EditorCursor.js";
import { UserInputEvent } from "./events.js";
import { Elm, EventBus } from "./japnaaEngine2d/JaPNaAEngine2d.js";

export class Editable extends Elm<"span"> {
    private value: string;
    public onChange = new EventBus<UserInputEvent>();

    constructor(initialText: string) {
        super("span");
        this.class("editable");
        this.append(initialText);
        this.value = initialText;
    }

    public getValue(): string {
        return this.value;
    }

    public setValue(value: string) {
        this.value = value;
    }

    public checkInput(event: UserInputEvent) {
        this.onChange.send(event);
        if (event.added.includes("\n")) {
            event.reject();
        }
    }

    public getCharacterOffset(selection: Selection) {
        let curr: ChildNode | undefined | null = this.elm.firstChild;
        let count = 0;
        while (curr && curr !== selection.anchorNode) {
            if (curr instanceof Text) {
                count += curr.textContent ? curr.textContent.length : 0;
            }
            curr = curr?.nextSibling;
        }

        count += selection.focusOffset;
        if (count > this.value.length) {
            return this.value.length;
        }
        return count;
    }

    public setActive(offset: number, cursor: EditorCursor) {
        const before = this.value.slice(0, offset);
        const after = this.value.slice(offset);

        this.replaceContents(before, cursor, after);
    }
}
