import { ExecuterContainer } from "./executer/ExecuterContainer.js";
import { EditorContainer } from "./editor/EditorContainer.js";
import VisualNovelPlugin from "./plugins/visualNovel/visualNovel.js";
import { Component, Elm } from "./japnaaEngine2d/elements.js";
import { DefaultPlugin } from "./plugins/default/default.js";
import { Project } from "./project/Project.js";
import { NullProject } from "./project/NullProject.js";
import { ModalContainer } from "./modals/ModalContainer.js";
import { ProjectFilesDisplay } from "./project/ProjectFilesDisplay.js";
import { UILayout } from "./UILayout.js";
import { InstructionGroupEditor } from "./editor/InstructionGroupEditor.js";
import { JaPNaAEngine2d } from "./japnaaEngine2d/JaPNaAEngine2d.js";
import { Editor } from "./editor/Editor.js";
import { UndoableAction } from "./editor/editing/actions.js";

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
        return visualNovelPlugin.executer.start(executerContainer);
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

let project = new NullProject();
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
