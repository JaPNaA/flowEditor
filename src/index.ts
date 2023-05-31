import { ExecuterContainer } from "./executer/ExecuterContainer.js";
import { EditorContainer } from "./editor/EditorContainer.js";

const executer = new ExecuterContainer();
executer.appendTo(document.body);

const editor = new EditorContainer();
editor.appendTo(document.body);
