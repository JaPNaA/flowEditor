import { Editor } from "./editor/Editor.js";
import { InstructionGroupEditor } from "./editor/InstructionGroupEditor.js";
import { AutoCompleteSuggester } from "./editor/editing/AutoComplete.js";
import { UndoableAction } from "./editor/editing/actions.js";
import { InstructionBlueprintMin } from "./editor/instruction/InstructionBlueprintRegistery.js";
import { Instruction } from "./editor/instruction/instructionTypes.js";
import { ExecuterContainer } from "./executer/ExecuterContainer.js";
import { Project } from "./project/Project.js";
import { JaPNaAEngine2d } from "../japnaaEngine2d/JaPNaAEngine2d.js";


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
    onFlowLoad(editor: Editor): void;
    onActionPerformed(action: UndoableAction): void;
    dispose(): void;
}
