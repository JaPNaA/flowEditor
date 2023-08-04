import { Editor } from "./editor/Editor";
import { InstructionGroupEditor } from "./editor/InstructionGroupEditor";
import { AutoCompleteSuggester } from "./editor/editing/AutoComplete";
import { UndoableAction } from "./editor/editing/actions";
import { InstructionBlueprintMin } from "./editor/instruction/InstructionBlueprintRegistery";
import { Instruction } from "./editor/instruction/instructionTypes";
import { Project } from "./project/Project";
import { JaPNaAEngine2d } from "../japnaaEngine2d/JaPNaAEngine2d";
import { Executer } from "../executer/Executer";


export interface EditorPlugin {
    name: string;
    instructionBlueprints: InstructionBlueprintMin[];
    parse(data: any): Instruction | undefined;
    setProject?(project: Project): void;
    setEngine?(project: JaPNaAEngine2d): void;
    executer?: PluginExecuter;
    renderer?: PluginRenderer;
    analyser?: PluginAnalyser;
    autocomplete?: [symbol, AutoCompleteSuggester][];
}

export interface PluginExecuter {
    start(executerContainer: Executer): Promise<void>;
    run(data: any): boolean;
    stop(): Promise<void>;
    setState(state: any): void;
    getState(): any;
}

export interface PluginRenderer {
    renderGroup(group: InstructionGroupEditor, engine: JaPNaAEngine2d): void;
}

export interface PluginAnalyser {
    onFlowLoad(editor: Editor): void;
    onActionPerformed(action: UndoableAction): void;
    dispose(): void;
}
