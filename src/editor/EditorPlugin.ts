import { Executer } from "../executer/Executer";
import { JaPNaAEngine2d } from "../japnaaEngine2d/JaPNaAEngine2d";
import { Editor } from "./editor/Editor";
import { InstructionGroup } from "./editor/InstructionGroup";
import { AutoCompleteSuggester } from "./editor/editing/AutoComplete";
import { ActionInstance } from "./editor/editing/actions/ActionBus";
import { InstructionBlueprintMin } from "./editor/instruction/InstructionBlueprintRegistery";
import { Instruction } from "./editor/instruction/baseInstructions/Instruction";
import { CompositeInstructionBlock } from "./editor/instruction/block/CompositeInstructionBlock";
import { Project } from "./project/Project";


export interface EditorPlugin {
    name: string;
    instructionBlueprints: InstructionBlueprintMin[];
    parse(data: any, parentBlock: CompositeInstructionBlock): Instruction | undefined;
    setProject?(project: Project): void;
    setEngine?(project: JaPNaAEngine2d): void;
    /** Get instructions to append to the start of the flow */
    getFlowHeader?(): any[];
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
    renderGroup(group: InstructionGroup, engine: JaPNaAEngine2d): void;
}

export interface PluginAnalyser {
    onFlowLoad(editor: Editor): void;
    onActionPerformed(action: ActionInstance): void;
    dispose(): void;
}
