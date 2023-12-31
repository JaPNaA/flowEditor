import { Instruction } from "./instructionTypes";

export type InstructionBlueprintMin = Omit<InstructionBlueprint, "plugin">;

export interface InstructionBlueprint {
    instructionName: string;
    description?: string;
    plugin?: string;
    shortcutKey?: string | string[];
    create(): Instruction;
}

export class InstructionBlueprintRegistery {
    private allInstructions: InstructionBlueprint[] = [];
    private shortcutsMap = new Map<string, InstructionBlueprint>();

    public getAllBlueprints(): ReadonlyArray<InstructionBlueprint> {
        return this.allInstructions;
    }

    public registerBlueprint(blueprint: InstructionBlueprint) {
        this.allInstructions.push(blueprint);
        if (blueprint.shortcutKey) {
            this.assignShortcutKey(blueprint, blueprint.shortcutKey);
        }
    }

    /** Register several blueprints with plugin: `pluginName` */
    public registerBlueprints(blueprints: InstructionBlueprintMin[], pluginName: string) {
        for (const blueprint of blueprints) {
            this.registerBlueprint({
                ...blueprint,
                plugin: pluginName
            });
        }
    }

    public getBlueprintByShortcut(shortcut: string) {
        return this.shortcutsMap.get(shortcut);
    }

    private assignShortcutKey(blueprint: InstructionBlueprint, shortcutKeys_: string | string[]) {
        const shortcutKeys = Array.isArray(shortcutKeys_) ? shortcutKeys_ : [shortcutKeys_];

        for (const shortcutKey of shortcutKeys) {
            if (this.shortcutsMap.get(shortcutKey)) {
                console.warn("Shortcut " + shortcutKey + " was not available. Failed to assign.");
            } else {
                this.shortcutsMap.set(shortcutKey, blueprint);
            }
        }
    }
}
