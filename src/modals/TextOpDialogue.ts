import { Component, Elm } from "../japnaaEngine2d/JaPNaAEngine2d.js";
import { InstructionGroupEditor } from "../editor/InstructionGroupEditor.js";
import { Editable } from "../editor/editing/Editable.js";
import { UndoLog } from "../editor/editing/actions.js";

export class TextOpDialogue extends Component {
    private textarea = new Elm("textarea")
        .on("keydown", ev => ev.stopPropagation()); // prevent editor from recieving keystrokes
    private acceptButton = new Elm("button").append("Done");
    private cancelButton = new Elm("button").append("Cancel");
    private editables?: Editable[][];
    private undoLog?: UndoLog;

    constructor() {
        super("textOpDialogue");
        this.elm.append(
            new Elm("h2").append("TextOp"),
            new Elm().append("Copy the text below into a different editor (Word, Google Docs, Grammarly, etc.) to perform spellcheck, find-and-replace, etc. Then paste it back here to apply changes. MAKE SURE YOU DO NOT ADD OR REMOVE LINES!!"),
            this.textarea,
            new Elm().append(
                this.acceptButton.onActivate(() => this.acceptChanges()),
                this.cancelButton.onActivate(() => this.elm.remove())
            )
        );
    }

    public setEditablesFromGroups(undoLog: UndoLog, groups: InstructionGroupEditor[]) {
        const valueEditableMap = new Map<string, Editable[]>();
        this.undoLog = undoLog;

        for (const group of groups) {
            for (const instruction of group.getInstructions()) {
                for (const line of instruction.getLines()) {
                    for (const editable of line.getEditables()) {
                        // editables with autocomplete usually aren't sentences
                        if (editable.autoCompleteType) { continue; }
                        const value = editable.getValue();
                        const existing = valueEditableMap.get(value);
                        if (existing) {
                            existing.push(editable);
                        } else {
                            valueEditableMap.set(value, [editable]);
                        }
                    }
                }
            }
        }

        this.editables = [];
        const lines = [];
        for (const [value, editables] of valueEditableMap) {
            if (value.includes("\n")) { throw new Error("Multiline editable values unsupported."); }
            if (!value) { continue; } // ignore empty lines/editables
            this.editables.push(editables);
            lines.push(value);
        }

        this.textarea.getHTMLElement().value = lines.join("\n");
    }

    public acceptChanges() {
        if (!this.editables) { throw new Error("No editables set."); }

        const lines = this.textarea.getHTMLElement().value.split("\n").filter(x => x);
        if (lines.length !== this.editables.length) { throw new Error("Line count mismatch."); }

        this.undoLog?.startGroup();
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const editables = this.editables[i];
            for (const editable of editables) {
                editable.setValue(line);
            }
        }
        this.undoLog?.endGroup();

        this.elm.remove();
    }
}
