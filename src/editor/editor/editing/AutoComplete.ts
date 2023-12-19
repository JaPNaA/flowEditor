import { JaPNaAEngine2d, Vec2M } from "../../../japnaaEngine2d/JaPNaAEngine2d";
import { Component, Elm } from "../../../japnaaEngine2d/elements";
import { looseStartsWith } from "../../utils";
import { SingleInstructionBlock } from "../instruction/InstructionBlock";
import { Editable } from "./Editable";
import { EditorCursor } from "./EditorCursor";

export interface AutoCompleteSuggester {
    learn(editable: Editable): void;
    unlearn(editable: Editable): void;
    suggest(editable: Editable): AutoCompleteSuggestion[] | null;
}

export interface AutoCompleteSuggestion {
    title: string;
    fill: string | (() => string | void);
    subtitle?: string;
    description?: string;
}

export const globalAutocompleteTypes = {
    variable: Symbol()
};

export class AutoComplete extends Component {
    protected engine!: JaPNaAEngine2d;

    private map = new Map<symbol, AutoCompleteSuggester>();
    private defaultHandlerPreviousValues = new Map<symbol, Map<string, number>>();
    private lastSuggestions: [AutoCompleteSuggestion, Elm][] | null = null;
    private selectedSuggestion: number = 0;


    constructor() {
        super("autocomplete");
    }

    public acceptSuggestion(): string | undefined {
        if (!this.lastSuggestions) { return; }
        const suggestion = this.lastSuggestions[this.selectedSuggestion];
        if (!suggestion) { return; }
        if (typeof suggestion[0].fill === "function") {
            const ret = suggestion[0].fill();
            if (ret !== undefined) {
                return ret;
            } else {
                return;
            }
        } else {
            return suggestion[0].fill;
        }
    }

    public isShowingSuggestions() {
        return Boolean(this.lastSuggestions && this.lastSuggestions.length);
    }

    public setEngine(engine: JaPNaAEngine2d) {
        this.engine = engine;
    }

    public updatePosition(cursor: EditorCursor) {
        const boundingRect = cursor.getHTMLElement().getBoundingClientRect();
        const pos = this.engine.camera.canvasToWorldPos(
            this.engine.sizer.screenPosToCanvasPos(
                new Vec2M(boundingRect.x, boundingRect.y + boundingRect.height)
            )
        );
        const style = this.elm.getHTMLElement().style;
        style.left = pos.x + "px";
        style.top = pos.y + "px";
    }

    public showSuggestions(editable: Editable) {
        const suggestions = this.getSuggestions(editable);
        this.lastSuggestions = [];
        this.elm.clear();
        if (!suggestions) { return; }
        for (const suggestion of suggestions) {
            this.lastSuggestions.push([
                suggestion,
                new SuggestionElm(suggestion).appendTo(this.elm)
            ]);
        }

        if (this.lastSuggestions.length === 0) {
            this.lastSuggestions = null;
            return;
        }
        this.selectedSuggestion = 0;
        this.lastSuggestions[0][1].class("selected");
    }

    public clearSuggestions() {
        this.lastSuggestions = null;
        this.elm.clear();
    }

    public navNextSuggestion() {
        if (!this.lastSuggestions) { return; }
        this.lastSuggestions[this.selectedSuggestion]?.[1].removeClass("selected");
        this.selectedSuggestion = (this.selectedSuggestion + 1) % this.lastSuggestions.length;
        this.lastSuggestions[this.selectedSuggestion][1].class("selected");
    }

    public navPrevSuggestion() {
        if (!this.lastSuggestions) { return; }
        this.lastSuggestions[this.selectedSuggestion]?.[1].removeClass("selected");
        this.selectedSuggestion = (this.selectedSuggestion + this.lastSuggestions.length - 1) % this.lastSuggestions.length;
        this.lastSuggestions[this.selectedSuggestion][1].class("selected");
    }

    public getSuggestions(editable: Editable): AutoCompleteSuggestion[] | null {
        const type = editable.autoCompleteType;
        if (!type) { return null; }
        const suggester = this.map.get(type);
        if (suggester) {
            return suggester.suggest(editable);
        } else {
            return this.defaultSuggester(editable, type);
        }
    }

    public registerSuggester(type: symbol, suggster: AutoCompleteSuggester) {
        this.map.set(type, suggster);
    }

    public enteredValue(editable: Editable) {
        if (!editable.autoCompleteType) { return; }
        const suggester = this.map.get(editable.autoCompleteType);
        if (suggester) {
            suggester.learn(editable);
        } else {
            const value = editable.getValue();
            if (value) { // ignore empty values
                let counts = this.defaultHandlerPreviousValues.get(editable.autoCompleteType);
                if (!counts) {
                    counts = new Map();
                    this.defaultHandlerPreviousValues.set(editable.autoCompleteType, counts);
                }
                const count = counts.get(value);
                if (count) {
                    counts.set(value, count + 1);
                } else {
                    counts.set(value, 1);
                }
            }
        }
    }

    public removedValue(editable: Editable) {
        if (!editable.autoCompleteType) { return; }
        const suggester = this.map.get(editable.autoCompleteType);
        if (suggester) {
            suggester.unlearn(editable);
        } else {
            const value = editable.getValue();
            if (!value) { return; } // ignore empty values
            let counts = this.defaultHandlerPreviousValues.get(editable.autoCompleteType);
            if (!counts) { return; }
            const count = counts.get(value);
            if (count) {
                if (count <= 1) {
                    counts.delete(value);
                } else {
                    counts.set(value, count - 1);
                }
            }
        }
    }

    private getLastUsed(currEditable: Editable, type: symbol): string | undefined {
        const instructionParent = currEditable.parentLine.parentBlock.parent;
        if (!instructionParent) { return; }
        const currInstructionIndex = instructionParent.children.indexOf(currEditable.parentLine.parentBlock);
        if (currInstructionIndex > 0) {
            instructionParent.children[
                currInstructionIndex - 1
            ]?.getLine(0).getEditables().find(editable => editable.autoCompleteType === type)?.getValue()
        }
    }

    private defaultSuggester(editable: Editable, type: symbol): AutoCompleteSuggestion[] | null {
        const value = editable.placeholder ? "" : editable.getValue();
        const map = this.defaultHandlerPreviousValues.get(type);
        const lastUsed = this.getLastUsed(editable, type);
        if (!map) { return null; }

        const suggestions: [AutoCompleteSuggestion, number][] = [];

        if (value) {
            // sort by best match
            for (const [key, times_] of map) {
                // uncount the editable's current value
                const times = key === value ? times_ - 1 : times_;
                const score = looseStartsWith(value, key);
                if (score >= 0 && times > 0) {
                    suggestions.push([{
                        title: key,
                        fill: key,
                        subtitle: "(" + times + ")"
                    }, score]);
                }
            }
        } else {
            // sort by popularity
            for (const [key, times_] of map) {
                // uncount the editable's current value
                const times = key === value ? times_ - 1 : times_;
                if (times > 0) {
                    if (key === lastUsed) {
                        suggestions.push([{
                            title: key,
                            fill: key,
                            subtitle: "repeat (" + times + ")"
                        }, -Infinity]);
                    } else {
                        suggestions.push([{
                            title: key,
                            fill: key,
                            subtitle: "(" + times + ")"
                        }, -times]);
                    }
                }
            }
        }
        return suggestions.sort((a, b) => a[1] - b[1]).map(x => x[0]);
    }
}

class SuggestionElm extends Elm {
    constructor(suggestion: AutoCompleteSuggestion) {
        super();
        this.class("suggestion");

        this.append(
            new Elm().class("headingLine").append(
                new Elm("span").class("title").append(suggestion.title),
                new Elm("span").class("subtitle").append(suggestion.subtitle || "")
            ),
            new Elm().class("description").append(suggestion.description || "")
        );
    }
}