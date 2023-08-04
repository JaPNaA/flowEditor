import { JaPNaAEngine2d } from "../japnaaEngine2d/JaPNaAEngine2d";
import { Component } from "../japnaaEngine2d/elements";
import { DefaultPlugin } from "../plugins/default/default";
import VisualNovelPlugin from "../plugins/visualNovel/visualNovel";
import { UILayout } from "./UILayout";
import { Editor } from "./editor/Editor";
import { EditorContainer } from "./editor/EditorContainer";
import { InstructionGroupEditor } from "./editor/InstructionGroupEditor";
import { UndoableAction } from "./editor/editing/actions";
import { ExecuterContainer } from "./executer/ExecuterContainer";
import { ModalContainer } from "./modals/ModalContainer";
import { NullProject } from "./project/NullProject";
import { Project } from "./project/Project";
import { ProjectFilesDisplay } from "./project/ProjectFilesDisplay";

export const appHooks = {
    focusEditor() {
        return editorContainer.focus();
    },

    runFlow() {
        return executerContainer.execute();
    },

    getCompiledFlowFromEditor() {
        return editorContainer.compile();
    },

    getEditorSaveData() {
        return editorContainer.getSaveData();
    },

    requestEditorTextOp() {
        return editorContainer.openTextOp();
    },

    saveEditor() {
        return editorContainer.save();
    },

    setEditorSaveData(data: any) {
        editorContainer.preventSaveOnExit = true;
        editorContainer.setSaveData(data);
        location.reload();
    },

    openProject(newProject: Project) {
        projectFilesDisplay.setProject(newProject);
        editorContainer.setProject(newProject);
        executerContainer.setProject(newProject);
        pluginHooks.setProject(newProject);
        project = newProject;
    },

    showModal(modal: Component) {
        modalContainer.addModal(modal);
    }
};

export const pluginHooks = {
    startExecution(): Promise<void> {
        return visualNovelPlugin.executer.start(executerContainer.executer);
    },

    runInstruction(instruction: any) {
        return visualNovelPlugin.executer.run(instruction);
    },

    stopExecution() {
        return visualNovelPlugin.executer.stop();
    },

    renderGroup(group: InstructionGroupEditor) {
        return visualNovelPlugin.renderer.renderGroup(group);
    },

    getExecutionStates() {
        return { [visualNovelPlugin.name]: visualNovelPlugin.executer.getState() };
    },

    setExecutionStates(states: { [x: string]: any }) {
        visualNovelPlugin.executer.setState(states[visualNovelPlugin.name]);
    },

    onEditorLoad(editor: Editor) {
        visualNovelPlugin.analyser.onFlowLoad(editor);
    },

    onAction(action: UndoableAction) {
        visualNovelPlugin.analyser.onActionPerformed(action);
    },

    setProject(project: Project) {
        visualNovelPlugin.setProject(project);
    },

    setEngine(engine: JaPNaAEngine2d) {
        visualNovelPlugin.setEngine(engine);
    }
};

// load plugins
const defaultPlugin = new DefaultPlugin();
const visualNovelPlugin = new VisualNovelPlugin();

let project: Project = new NullProject();
const projectFilesDisplay = new ProjectFilesDisplay(project);
const executerContainer = new ExecuterContainer(project);
const editorContainer = new EditorContainer(project);
const modalContainer = new ModalContainer();

new UILayout(
    editorContainer,
    executerContainer,
    projectFilesDisplay,
    modalContainer
).appendTo(document.body);

editorContainer.registerPlugin(defaultPlugin);
editorContainer.registerPlugin(visualNovelPlugin);

document.body.removeChild(document.getElementById("noLoadError")!);
