import { Component, Elm } from "../../../../japnaaEngine2d/elements";
import { Editable } from "../../editing/Editable";
import { RequestAccepter } from "../../editing/requests/RequestAccepter";
import { EditRequest } from "../../editing/requests/requests";
import { InstructionBlock } from "../block/InstructionBlock";

export abstract class InstructionLine extends Component {
    private static readonly INITIAL_PADDING_LEFT = 12;
    private static readonly INDENT_SIZE = 16;

    public preferredStartingCharOffset = 0;
    public parentBlock!: InstructionBlock;

    public editRequestAccepter = new RequestAccepter<EditRequest>();

    /**
     * Instruction areas.
     * 
     * Each instruction MUST contain at least one editable. There must be
     * no two consecutive strings or two consecutive editables.
     * 
     * Strings cannot be empty.
     */
    private areas: (Editable | string)[] = [];
    private spanToEditable = new Map<HTMLSpanElement, Editable>();
    private editables: Editable[] = [];

    constructor() {
        super("instructionLine");
        this.editRequestAccepter.setGetNextAccepter(() => this.parentBlock.getGroup()?.group.editor.editRequestAccepter);
    }

    public _setParent(instruction: InstructionBlock) {
        this.parentBlock = instruction;
        for (const editable of this.editables) {
            editable.actionBus.parentBus = instruction.actionBus;
        }
    }

    public reset() {
        this.elm.clear();
        let isLineEmpty = true;

        for (const element of this.areas) {
            this.elm.append(element);
            if (typeof element === "string" || element.getValue()) {
                isLineEmpty = false;
            }
        }

        // need a <br> for an empty line so the user can
        // move the cursor and delete the line in
        // for ContentEditableInputCapture
        if (isLineEmpty) {
            this.elm.append(new Elm("br"));
        }
    }

    public resetEditables() {
        for (const editable of this.editables) {
            editable.update();
        }
    }

    /**
     * Find the corresponding editable and offset in editable.
     * 
     * Used for identifying which editable a user is typing into.
     * 
     * @param charIndex Character index on this line
     */
    public getEditableAndOffsetFromCharIndex(charIndex: number): {
        editable: Editable,
        editableIndex: number,
        offset: number
    } | null {
        let editableIndex = 0;
        for (const area of this.areas) {
            if (typeof area === 'string') {
                charIndex -= area.length;
                // not <= to account for the possibility we have the
                // charIndex at the start (charIndex = 0) of the next Editable
                if (charIndex < 0) { return null; }
            } else {
                const value = area.getValue();
                if (charIndex <= value.length) {
                    return { editable: area, editableIndex, offset: charIndex };
                }
                charIndex -= value.length;
                editableIndex++;
            }
        }
        return null;
    }

    /**
     * Find the character index of the first character of an editable
     * relative to this line.
     * 
     * Used for getting cursor coordinates from an EditorCursorPositionAbsolute.
     */
    public getCharIndexOfEditable(editable: Editable) {
        let offset = 0;
        for (const area of this.areas) {
            if (typeof area === 'string') {
                offset += area.length;
            } else {
                if (area === editable) {
                    return offset;
                }
                offset += area.getValue().length;
            }
        }
        return -1;
    }

    /**
     * Find the editable "closest" to a character index.
     * 
     * If `backwardsFirst`, finds the closest editable to the left first, then
     * the closest to the right.
     * If not `backwardsFirst`, finds the closest editable to the right first,
     * then the closest to the left.
     * 
     * Used for repositioning the cursor after a user clicks to move the
     * cursor.
     * 
     * @param charIndex Character index on this line
     * @param backwardsFirst Check closest editable to the left first?
     */
    public getClosestEditableIndexToCharIndex(charIndex: number, backwardsFirst: boolean): number {
        let editableIndex = 0;
        for (const area of this.areas) {
            if (typeof area === 'string') {
                charIndex -= area.length;
                // not <= to account for the possibility we have the
                // charIndex at the start (charIndex = 0) of the next Editable
                if (charIndex < 0) {
                    if (backwardsFirst) {
                        return editableIndex - 1;
                    } else {
                        return editableIndex;
                    }
                }
            } else {
                const value = area.getValue();
                if (charIndex <= value.length) {
                    return editableIndex;
                }
                charIndex -= value.length;
                editableIndex++;
            }
        }

        return editableIndex - 1;
    }

    /**
     * Take a DOM Node that is a descendant of this line and find the
     * character index of the node from the start of the line.
     */
    public getNodeCharIndex(node: Node) {
        const parentList = [];
        let currNode: Node | null = node;
        while (true) {
            if (!currNode) { throw new Error("Node is not a descendant of this line"); }
            if (currNode === this.elm.getHTMLElement()) {
                break;
            }
            parentList.push(currNode);
            currNode = currNode.parentNode;
        }

        let charIndex = 0;
        currNode = this.elm.getHTMLElement().firstChild;
        let target = parentList.pop();
        while (target) {
            if (!currNode) { throw new Error("Traversal failed"); }
            if (currNode === target) {
                currNode = currNode.childNodes[0];
                target = parentList.pop();
            } else {
                charIndex += currNode.textContent ? currNode.textContent.length : 0;
                currNode = currNode.nextSibling;
            }
        }
        return charIndex;
    }

    public getEditables(): ReadonlyArray<Editable> {
        return this.editables;
    }

    public getEditableFromIndex(index: number) {
        return this.editables[index];
    }

    public getLastEditableIndex() {
        return this.editables.length - 1;
    }

    public getLastEditableCharacterIndex() {
        return this.editables[this.editables.length - 1].getValue().length;
    }

    public getAreas() {
        return this.areas;
    }

    /**
     * Set areas for the instruction.
     * 
     * Each area is either a noneditable string, or an editable.
     * 
     * Each instruction MUST contain at least one editable. There must be
     * no two consecutive strings or two consecutive editables.
     */
    protected setAreas(...elements: (string | Editable)[]) {
        this.areas = elements;
        this.reset();
    }

    protected setIndentation(indentationLevel: number) {
        this.elm.getHTMLElement().style.paddingLeft = (
            InstructionLine.INITIAL_PADDING_LEFT +
            InstructionLine.INDENT_SIZE * indentationLevel
        ) + "px";
    }

    protected createEditable(text: string | number): Editable {
        const editable = new Editable(text.toString(), this);
        this.registerEditable(editable);
        return editable;
    }

    protected registerEditable<T extends Editable>(editable: T): T {
        this.spanToEditable.set(editable.getHTMLElement(), editable);
        this.editables.push(editable);
        editable.editRequestAccepter.setGetNextAccepter(() => this.editRequestAccepter);
        return editable;
    }
}
