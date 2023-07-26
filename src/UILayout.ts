import { EditorContainer } from "./editor/EditorContainer.js";
import { ExecuterContainer } from "./executer/ExecuterContainer.js";
import { Component, Elm } from "./japnaaEngine2d/elements.js";
import { ModalContainer } from "./modals/ModalContainer.js";
import { ProjectFilesDisplay } from "./project/ProjectFilesDisplay.js";

export class UILayout extends Component {
    private rightPanel: Elm;

    constructor(editor: EditorContainer, executer: ExecuterContainer, project: ProjectFilesDisplay, modal: ModalContainer) {
        super("main");

        this.rightPanel = new Elm().class("rightPanel");
        this.elm.append(
            editor,
            this.rightPanel.append(
                executer,
                project,
                new ResizeHandle(this.rightPanel)
            ),
            modal
        );
    }
}

class ResizeHandle extends Component {
    private dragging = false;
    private lastWidth = 33;
    private currWidth = 33;
    private collapsed = false;

    constructor(private parent: Elm) {
        super("resizeHandle");

        this.mouseupHandler = this.mouseupHandler.bind(this);
        this.mousemoveHandler = this.mousemoveHandler.bind(this);

        this.elm.on("mousedown", ev => {
            ev.preventDefault();
            if (this.dragging) { return; }
            this.dragging = true;
            addEventListener("mouseup", this.mouseupHandler);
            addEventListener("mousemove", this.mousemoveHandler);
        });

        this.elm.on("dblclick", () => {
            if (this.collapsed) {
                this.uncollapse();
            } else {
                this.collapse();
            }
        });
    }

    public collapse() {
        this.collapsed = true;
        this.parent.getHTMLElement().style.width = "8px";
        this.parent.class("collapsed");
    }

    public uncollapse(width?: number) {
        this.collapsed = false;
        this.parent.removeClass("collapsed");
        this.parent.getHTMLElement().style.width = (width || this.lastWidth) + "%";
    }

    private mouseupHandler() {
        removeEventListener("mouseup", this.mouseupHandler);
        removeEventListener("mousemove", this.mousemoveHandler);
        this.dragging = false;
        if (!this.collapsed) {
            this.lastWidth = this.currWidth;
        }
    }

    private mousemoveHandler(ev: MouseEvent) {
        ev.preventDefault();
        // "1 -" because executer is on the right
        const newWidth = Math.min((1 - ev.clientX / innerWidth) * 100, 95);

        if (newWidth < 5) {
            if (!this.collapsed) {
                this.collapse();
            }
        } else {
            this.uncollapse(newWidth);
            this.currWidth = newWidth;
        }
    }
}