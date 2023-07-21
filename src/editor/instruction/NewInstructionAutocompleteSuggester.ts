import { looseStartsWith } from "../../utils.js";
import { Editable } from "../editing/Editable.js";
import { AutoCompleteSuggester } from "../editing/AutoComplete.js";
import { InstructionBlueprint, InstructionBlueprintRegistery } from "./InstructionBlueprintRegistery.js";

export class NewInstructionAutocompleteSuggester implements AutoCompleteSuggester {
    public static symbol = Symbol();

    constructor(public blueprintRegistery: InstructionBlueprintRegistery) { }

    public learn() { }
    public unlearn() { }
    public suggest(editable: Editable) {
        const value = editable.getValue();
        const instructions = this.blueprintRegistery.getAllBlueprints();
        const suggestions: [number, InstructionBlueprint][] = [];

        for (const instruction of instructions) {
            let matchText = instruction.instructionName;
            if (instruction.plugin) {
                matchText += " (" + instruction.plugin + ")";
            }
            const score = looseStartsWith(value, matchText);
            if (score >= 0) {
                suggestions.push([score, instruction]);
            }
        }

        suggestions.sort((a, b) => a[0] - b[0]);

        return suggestions.map(x => ({
            title: x[1].instructionName,
            subtitle: x[1].plugin,
            description: (x[1].shortcutKey ? "[" + x[1].shortcutKey + "] " : "") +
                x[1].description,
            fill: x[1].instructionName
        }));
    }
}
