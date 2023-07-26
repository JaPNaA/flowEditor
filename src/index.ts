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

    getExecutionStates() {
        return { [visualNovelPlugin.name]: visualNovelPlugin.executer.getState() };
    },

    setExecutionStates(states: { [x: string]: any }) {
        visualNovelPlugin.executer.setState(states[visualNovelPlugin.name]);
    }
};

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

// load plugins
const defaultPlugin = new DefaultPlugin();
const visualNovelPlugin = new VisualNovelPlugin();

editorContainer.registerPlugin(defaultPlugin);
editorContainer.registerPlugin(visualNovelPlugin);

document.body.removeChild(document.getElementById("noLoadError")!);
