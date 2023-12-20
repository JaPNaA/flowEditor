import { looseStartsWith } from "../../utils";
import { Editable } from "../editing/Editable";
import { AutoCompleteSuggester } from "../editing/AutoComplete";
import { InstructionBlueprint, InstructionBlueprintRegistery } from "./InstructionBlueprintRegistery";
import { NewInstruction, NewInstructionEditable } from "./NewInstruction";

export class NewInstructionAutocompleteSuggester implements AutoCompleteSuggester {
    public static symbol = Symbol();

    constructor(public blueprintRegistery: InstructionBlueprintRegistery) { }

    public learn() { }
    public unlearn() { }
    public suggest(editable: Editable) {
        if (!(editable instanceof NewInstructionEditable)) { return null; }

        const value = editable.getValue();
        if (!value) { return null; } // don't show suggestions when empty

        const registery = (editable.parentLine.parentBlock.instruction as NewInstruction).getBlueprintRegistery();
        if (!registery) { return null; }

        const instructions = registery.getAllBlueprints();
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
                (x[1].description || ""),
            fill: () => editable.acceptAutocomplete(x[1])
        }));
    }
}
