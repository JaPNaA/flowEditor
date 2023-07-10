import { Editable } from "../../editor/Editable.js";
import { TextareaUserInputCaptureAreas } from "../../editor/TextareaUserInputCapture.js";
import { InstructionLineView } from "../../editor/instructionLines.js";
import { EditorPlugin } from "../EditorPlugin.js";

export default class VisualNovelPlugin implements EditorPlugin {
    views: InstructionLineView[] = [];
    keyMappings: { [x: string]: () => InstructionLineView; } = {
        "s": () => new SayInstructionLine("a", "b")
    };
    executer = new VisualNovelExecuter();

    parse(data: any): InstructionLineView | undefined {
        if (data.visualNovelCtrl === "say") {
            return new SayInstructionLine(data.char, data.text);
        }
    }
}


class VisualNovelExecuter {
    run(data: any): Promise<void> | null {
        console.log(data);
        if (data.visualNovelCtrl === "say") {
            alert(data.char + " says '" + data.text + "'");
            return Promise.resolve();
        } else {
            return null;
        }
    }
}

class SayInstructionLine extends InstructionLineView {
    private characterEditable: Editable;
    private textEditable: Editable;

    constructor(character: string, text: string) {
        super("sayInstructionLine");

        this.elm.append(
            this.characterEditable = this.createEditable(character),
            ' says: "',
            this.textEditable = this.createEditable(text),
            '"'
        );
    }

    public serialize() {
        return { visualNovelCtrl: "say", char: this.characterEditable.getValue(), text: this.textEditable.getValue() };
    }

    public getAreas(): TextareaUserInputCaptureAreas {
        return [this.characterEditable, 8, this.textEditable];
    }
}
