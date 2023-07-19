import { Instruction } from "./instructionLines";

export type InstructionBlueprintMin = Omit<InstructionBlueprint, "plugin">;

export interface InstructionBlueprint {
    instructionName: string;
    description?: string;
    plugin?: string;
    shortcutKey?: string;
    create(): Instruction;
}

export class InstructionBlueprintRegistery {
    private static probeableShortcutChars = "abcdefghijklmnopqrstuvwxyz1234567890-=[]'\\,./!@#$%^&*()_+{}\"|<>?";

    private allInstructions: InstructionBlueprint[] = [];
    private shortcutsMap = new Map<string, InstructionBlueprint>();

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
        return this.shortcutsMap.get(shortcut.toLowerCase()[0]);
    }

    private assignShortcutKey(blueprint: InstructionBlueprint, shortcutKey: string) {
        let char = shortcutKey.toLowerCase()[0];
        if (this.shortcutsMap.get(char)) {
            // taken, begin probing
            let index = InstructionBlueprintRegistery.probeableShortcutChars.indexOf(char);
            if (index < 0) { index = 0; }
            for (let offset = 0; offset < InstructionBlueprintRegistery.probeableShortcutChars.length; offset++) {
                const newChar =
                    InstructionBlueprintRegistery.probeableShortcutChars[
                    (index + offset) % InstructionBlueprintRegistery.probeableShortcutChars.length];
                if (!this.shortcutsMap.get(newChar)) {
                    console.warn(`'${char}' shortcut was not available. Reassigned to '${newChar}'`);
                    this.shortcutsMap.set(newChar, blueprint);
                    break;
                }

            }
        } else {
            this.shortcutsMap.set(char, blueprint);
        }
    }
}
