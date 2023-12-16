import { Editable } from "../editing/Editable";
import { InstructionLine, OneLineInstruction, InstructionOneLine } from "./instructionTypes";
import { TextareaUserInputCaptureAreas, UserInputEvent } from "../editing/TextareaUserInputCapture";
import { SingleInstructionBlock } from "./InstructionBlock";

export class JSONInstruction extends InstructionOneLine<JSONLine> {
    constructor(data: any) {
        super(new JSONLine(data));
    }
}

class JSONLine extends InstructionLine implements OneLineInstruction {
    private editable: JSONLineEditable;
    public preferredStartingCharOffset = 1;
    public isBranch: boolean = false;

    constructor(data: any) {
        super();
        this.elm.append(this.editable = this.registerEditable(
            new JSONLineEditable(JSON.stringify(data), this)
        ));
        this.editable.setParentLine(this);
    }


    public serialize(): any {
        return JSON.parse(this.editable.getValue());
    }

    public getAreas(): TextareaUserInputCaptureAreas {
        return [this.editable];
    }
}

class JSONLineEditable extends Editable {
    private newlineDetected = false;

    public setParentLine(parentLine: InstructionLine) {
        this.parentLine = parentLine;
    }

    public checkInput(event: UserInputEvent): void {
        if (event.added.includes("\n")) {
            const value = this.getValue();
            // support for multiline paste only if JSONLine is a string + is not newline at end of line
            if (value[0] === '"' && value[value.length - 1] === '"' && event.newContent[event.newContent.length - 1] !== "\n") {
                this.newlineDetected = true;
            } else {
                event.reject();
            }
        }
    }

    public afterChangeApply(): void {
        if (!this.newlineDetected) { return; }
        this.newlineDetected = false;

        const lines = this.getValue()
            .slice(1, -1)
            .split("\n");
        const parentGroup = this.parentLine.parentInstruction.block.getGroupEditor();

        parentGroup.parentEditor.undoLog.startGroup();
        this.setValue(JSON.stringify(lines[0]));

        const currentPosition = (this.parentLine.parentInstruction.block as SingleInstructionBlock).locateInstructionIndex();
        let i;
        for (i = 1; i < lines.length; i++) {
            parentGroup.insertInstruction(
                new InstructionOneLine(
                    new JSONLine(lines[i])
                ),
                currentPosition + i
            );
        }

        this.replaceContents(this.getValue());
        parentGroup.parentEditor.cursor.setPosition({
            group: parentGroup,
            line: this.parentLine.getCurrentLine() + i - 1,
            editable: 0,
            char: lines[i - 1].length + 1 // +1 for left quote only
        });
        parentGroup.parentEditor.undoLog.endGroup();
    }
}
