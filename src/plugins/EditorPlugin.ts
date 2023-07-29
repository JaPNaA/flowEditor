import { InstructionGroupEditor } from "../editor/InstructionGroupEditor";
import { AutoCompleteSuggester } from "../editor/editing/AutoComplete";
import { InstructionBlueprintMin } from "../editor/instruction/InstructionBlueprintRegistery";
import { Instruction } from "../editor/instruction/instructionTypes";
import { ExecuterContainer } from "../executer/ExecuterContainer";
import { JaPNaAEngine2d } from "../japnaaEngine2d/JaPNaAEngine2d";

export interface EditorPlugin {
    name: string;
    instructionBlueprints: InstructionBlueprintMin[];
    parse(data: any): Instruction | undefined;
    executer?: PluginExecuter;
    renderer?: PluginRenderer;
    analyser?: PluginAnalyser;
    autocomplete?: [symbol, AutoCompleteSuggester][];
}

export interface PluginExecuter {
    start(executerContainer: ExecuterContainer): Promise<void>;
    run(data: any): boolean;
    stop(): Promise<void>;
    setState(state: any): void;
    getState(): any;
}

export interface PluginRenderer {
    renderGroup(group: InstructionGroupEditor, engine: JaPNaAEngine2d): void;
}

export interface PluginAnalyser {
    onFlowLoad(): void;
    onEdit(): void;
    dispose(): void;
}
