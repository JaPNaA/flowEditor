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
    exporter?: PluginExporter; // todo: consider renaming this to compiler
    autocomplete?: [symbol, AutoCompleteSuggester][];
}

/**
 * Events and behaviour the plugin can hook into during the
 * execution of a flow.
 * 
 * This must be implemented in a separate file, not using
 * any dependencies on the editor source files.
 */
export interface PluginExecuter {
    /**
     * Called when the executer starts executing some program.
     */
    start(executerContainer: Executer): Promise<void>;
    /**
     * Given data, determine if this plugin is responsible for this data,
     * and then execute the instruction if responsible.
     * @param data An instruction from the flow
     * @return True if we executed this instruction, false otherwise.
     */
    run(data: any): boolean;
    stop(): Promise<void>;
    /**
     * This method is called when the user restores from a state.
     * @param state Result of getState, the state to restore to.
     */
    setState(state: any): void;
    /**
     * Get the state of execution for everything in this plugin.
     */
    getState(): any;
}

/**
 * Behaviours the plugin can change regarding rendering of
 * instructions in the editor.
 */
export interface PluginRenderer {
    renderGroup(group: InstructionGroup, engine: JaPNaAEngine2d): void;
}

/**
 * Events the plugin can handle in the editor.
 */
export interface PluginAnalyser {
    onFlowLoad(editor: Editor): void;
    onFlowUnload(editor: Editor): void;
    onActionPerformed(action: ActionInstance): void;
    dispose(): void;
}

/**
 * Events the plugin can handle when exporting a flow
 * in the editor.
 */
export interface PluginExporter {
    beforeExport(editor: Editor): any;
}
