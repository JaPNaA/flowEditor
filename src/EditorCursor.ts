import { TextareaUserInputCapture } from "./TextareaUserInputCapture.js";
import { Elm } from "./japnaaEngine2d/JaPNaAEngine2d.js";

export class EditorCursor extends Elm<"span"> {
    public inputCapture = new TextareaUserInputCapture(this);

    constructor() {
        super();
        this.class("cursor");
    }
}
