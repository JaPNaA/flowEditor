import { JaPNaAEngine2d, Vec2M } from "../japnaaEngine2d/JaPNaAEngine2d.js";
import { Component, Elm } from "../japnaaEngine2d/elements.js";
import { looseStartsWith } from "../utils.js";
import { Editable } from "./Editable.js";
import { EditorCursor } from "./EditorCursor.js";

export interface AutoCompleteSuggester {
    learn(editable: Editable): void;
    unlearn(editable: Editable): void;
    suggest(editable: Editable): string[] | null;
}

export const globalAutocompleteTypes = {
    variable: Symbol()
};

export class AutoComplete extends Component {
    protected engine!: JaPNaAEngine2d;

    private map = new Map<symbol, AutoCompleteSuggester>();
    private defaultHandlerPreviousValues = new Map<symbol, Map<string, number>>();
    private lastSuggestions: [string, Elm][] | null = null;
    private selectedSuggestion: number = 0;


    constructor() {
        super("autocomplete");
    }

    public getSelectedSuggestion() {
        if (!this.lastSuggestions) { return; }
        return this.lastSuggestions[this.selectedSuggestion]?.[0];
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
                new Elm().class("suggestion").append(suggestion).appendTo(this.elm)
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

    public getSuggestions(editable: Editable): string[] | null {
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

    private defaultSuggester(editable: Editable, type: symbol) {
        const value = editable.getValue();
        const suggestions: [string, number][] = [];
        const map = this.defaultHandlerPreviousValues.get(type);
        if (!map) { return null; }
        for (const [previousValue, _] of map) {
            const score = looseStartsWith(value, previousValue);
            if (score >= 0) {
                suggestions.push([previousValue, score]);
            }
        }
        return suggestions.sort((a, b) => a[1] - b[1]).map(x => x[0]);
    }
}
