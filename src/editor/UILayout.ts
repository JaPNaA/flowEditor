import { Component, Elm } from "../japnaaEngine2d/elements";
import { Vec2, Vec2M } from "../japnaaEngine2d/JaPNaAEngine2d";
import { removeElmFromArray } from "../japnaaEngine2d/util/removeElmFromArray";
import { Editor } from "./editor/Editor";
import { EditorContainer } from "./editor/EditorContainer";
import { ExecuterContainer } from "./executer/ExecuterContainer";
import { ModalContainer } from "./modals/ModalContainer";
import { ProjectFilesDisplay } from "./project/ProjectFilesDisplay";
import { TwoWayMap } from "./utils";

export class UILayout extends Component {
    private rightPanel: Elm;
    private rightBottomPanel: Elm;

    constructor(editor: EditorContainer, executer: ExecuterContainer, project: ProjectFilesDisplay, modal: ModalContainer) {
        super("main");

        this.rightPanel = new Elm().class("rightPanel");
        this.rightBottomPanel = new Elm().class("rightBottomPanel")
        this.elm.append(
            new Elm().class("leftPanel").append(
                new EditorTabs(editor),
                editor
            ),
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

class EditorTabs extends Component {
    private tabIdMap = new TwoWayMap<Elm<"button">, number>();
    private tabElms: Elm<"button">[] = [];
    private activeTabElm: Elm<"button"> | null = null;

    constructor(private editor: EditorContainer) {
        super("editorTabs");
        this.elm.class("tabs");

        editor.onTabInsert.subscribe(({ tabId, index, tabState }) => {
            const tabElm = this.createTabElm(tabState.fileName, tabId);
            this.tabIdMap.set(tabElm, tabId);

            if (index === this.tabElms.length) {
                this.tabElms.push(tabElm);
                this.elm.append(tabElm);
            } else {
                const nextTab = this.tabElms[index - 1];
                this.tabElms.splice(index, 0, tabElm);
                this.elm.getHTMLElement().insertBefore(tabElm.getHTMLElement(), nextTab.getHTMLElement());
            }
        });

        editor.onTabClose.subscribe(tab => {
            const tabElm = this.tabIdMap.getK(tab);
            if (!tabElm) { throw new Error("Unknown tab"); }
            this.tabIdMap.deleteV(tab);
            removeElmFromArray(tabElm, this.tabElms);
            tabElm.remove();

            if (this.activeTabElm === tabElm) {
                this.activeTabElm = null;
            }
        });

        editor.onTabActiveChange.subscribe(tab => {
            const tabElm = this.tabIdMap.getK(tab);
            if (!tabElm) { throw new Error("Unknown tab"); }

            if (this.activeTabElm) {
                this.activeTabElm.removeClass("active");
            }
            tabElm.class("active");
            this.activeTabElm = tabElm;
        });
    }

    private createTabElm(title: string, tabId: number) {
        return new Elm("button").class("tab").append(title).onActivate(() => {
            this.editor.showTab(tabId);
        });
    }
}

abstract class ResizeHandle extends Component {
    private dragging = false;
    private lastSize = 0.33;
    private currSize = 0.33;
    private collapsed = false;

    private activeTouchId?: number;

    constructor(protected parent: Elm) {
        super("resizeHandle");

        this.mouseupHandler = this.mouseupHandler.bind(this);
        this.mousemoveHandler = this.mousemoveHandler.bind(this);
        this.touchendHandler = this.touchendHandler.bind(this);
        this.touchmoveHandler = this.touchmoveHandler.bind(this);

        this.elm.on("mousedown", ev => {
            ev.preventDefault();
            if (this.dragging) { return; }
            this.dragging = true;
            this.elm.class("dragging");
            addEventListener("mouseup", this.mouseupHandler);
            addEventListener("mousemove", this.mousemoveHandler);
        });

        this.elm.on("touchstart", ev => {
            if (ev.cancelable) { ev.preventDefault(); }
            if (this.dragging) { return; }
            if (ev.changedTouches.length !== 1) { return; }
            this.dragging = true;
            this.elm.class("dragging");
            this.activeTouchId = ev.changedTouches[0].identifier;

            addEventListener("touchend", this.touchendHandler);
            addEventListener("touchmove", this.touchmoveHandler);
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
    protected abstract dragHandler(pos: Vec2): void;

    private mouseupHandler() {
        removeEventListener("mouseup", this.mouseupHandler);
        removeEventListener("mousemove", this.mousemoveHandler);
        this.dragging = false;
        this.elm.removeClass("dragging");
        if (!this.collapsed) {
            this.lastSize = this.currSize;
        }
    }

    private mousemoveHandler(ev: MouseEvent) {
        this.dragHandler(new Vec2M(ev.clientX, ev.clientY));
    }

    private touchendHandler(ev: TouchEvent) {
        for (const touch of ev.changedTouches) {
            if (touch.identifier === this.activeTouchId) {
                this.activeTouchId = undefined;
                this.dragging = false;
                this.elm.removeClass("dragging");
                removeEventListener("touchend", this.touchendHandler);
                removeEventListener("touchmove", this.touchmoveHandler);
                return;
            }
        }
    }

    private touchmoveHandler(ev: TouchEvent) {
        for (const touch of ev.changedTouches) {
            if (touch.identifier === this.activeTouchId) {
                this.dragHandler(new Vec2M(touch.clientX, touch.clientY));
            }
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

    protected dragHandler(ev: Vec2) {
        // "1 -" because executer is on the right
        const newWidth = 1 - ev.x / innerWidth;
        this.userInputSize(newWidth);
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

    protected dragHandler(ev: Vec2) {
        // "1 -" because the container is on the bottom
        const newHeight = 1 - ev.y / innerHeight;
        this.userInputSize(newHeight);
    }
}
