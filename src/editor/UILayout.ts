import { Component, Elm } from "../japnaaEngine2d/elements";
import { EditorContainer } from "./editor/EditorContainer";
import { ExecuterContainer } from "./executer/ExecuterContainer";
import { ModalContainer } from "./modals/ModalContainer";
import { ProjectFilesDisplay } from "./project/ProjectFilesDisplay";

export class UILayout extends Component {
    private rightPanel: Elm;
    private rightBottomPanel: Elm;

    constructor(editor: EditorContainer, executer: ExecuterContainer, project: ProjectFilesDisplay, modal: ModalContainer) {
        super("main");

        this.rightPanel = new Elm().class("rightPanel");
        this.rightBottomPanel = new Elm().class("rightBottomPanel")
        this.elm.append(
            editor,
            this.rightPanel.append(
                new HorizontalResizeHandle(this.rightPanel),
                executer,
                this.rightBottomPanel.append(
                    new VerticalResizeHandle(this.rightBottomPanel),
                    project
                )
            ),
            modal
        );
    }
}

abstract class ResizeHandle extends Component {
    private dragging = false;
    private lastSize = 0.33;
    private currSize = 0.33;
    private collapsed = false;

    constructor(protected parent: Elm) {
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
        this.setSize(0);
        this.parent.class("collapsed");
    }

    public uncollapse(size?: number) {
        this.collapsed = false;
        this.parent.removeClass("collapsed");
        this.setSize(size || this.lastSize);
    }

    /** Set new size; if size === 0, is collapsed */
    protected abstract setSize(size: number): void;
    protected abstract mousemoveHandler(ev: MouseEvent): void;

    private mouseupHandler() {
        removeEventListener("mouseup", this.mouseupHandler);
        removeEventListener("mousemove", this.mousemoveHandler);
        this.dragging = false;
        if (!this.collapsed) {
            this.lastSize = this.currSize;
        }
    }

    protected userInputSize(size: number) {
        if (size < 0.05) {
            if (!this.collapsed) {
                this.collapse();
            }
        } else if (size > 0.95) {
            this.uncollapse(0.95);
            this.currSize = 0.95;
        } else {
            this.uncollapse(size);
            this.currSize = size;
        }
    }
}

class HorizontalResizeHandle extends ResizeHandle {
    constructor(parent: Elm) {
        super(parent);
        this.elm.class("horizontalResizeHandle");
    }

    protected setSize(size: number): void {
        if (size === 0) {
            this.parent.getHTMLElement().style.width = "8px";
        } else {
            this.parent.getHTMLElement().style.width = size * 100 + "%";
        }
    }

    protected mousemoveHandler(ev: MouseEvent) {
        // "1 -" because executer is on the right
        const newWidth = 1 - ev.clientX / innerWidth;
        this.userInputSize(newWidth)
    }
}

class VerticalResizeHandle extends ResizeHandle {
    constructor(parent: Elm) {
        super(parent);
        this.elm.class("verticalResizeHandle");
    }

    protected setSize(size: number): void {
        if (size === 0) {
            this.parent.getHTMLElement().style.height = "8px";
        } else {
            this.parent.getHTMLElement().style.height = size * 100 + "%";
        }
    }

    protected mousemoveHandler(ev: MouseEvent) {
        // "1 -" because the container is on the bottom
        const newHeight = 1 - ev.clientY / innerHeight;
        this.userInputSize(newHeight)
    }
}
