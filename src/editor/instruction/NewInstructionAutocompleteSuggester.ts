import { sortAndFilterByLooseStart } from "../../utils.js";
import { Editable } from "../editing/Editable.js";
import { AutoCompleteSuggester } from "../ui/AutoComplete.js";
import { InstructionBlueprintRegistery } from "./InstructionBlueprintRegistery.js";

export class NewInstructionAutocompleteSuggester implements AutoCompleteSuggester {
    public static symbol = Symbol();

    constructor(public blueprintRegistery: InstructionBlueprintRegistery) { }

    public learn() { }
    public unlearn() { }
    public suggest(editable: Editable) {
        const value = editable.getValue();
        return sortAndFilterByLooseStart(value,
            this.blueprintRegistery.getAllBlueprints().map(x =>
                (x.shortcutKey ? "[" + x.shortcutKey + "] " : "") +
                x.instructionName +
                (x.plugin ? " (" + x.plugin + ")" : "")
            )
        );
    }
}
