import { JaPNaAEngine2d, SubscriptionsComponent } from "../japnaaEngine2d/JaPNaAEngine2d";
import { Editor } from "./Editor";
import { InstructionGroupEditor } from "./InstructionGroupEditor";

/*

NAVIGATION CONTROLS
home:
  follow parents until top
  repeat -> go to next home
end:
  follow children until bottom
  repeat -> go to next end
arrow keys
  up: parent
  down: child
  left: next parent/child
  right: previous parent/child
modifiers
  ctrl: global modifier (can change groups while in edit mode)
  alt: move modifier (shift block in direction)
  shift: add to selection
  alt+shift:
    select all (up: all ancestors; down: all decendents; left/right: all siblings)

 */

export class EditorGroupNavigator {
    private engine!: JaPNaAEngine2d;

    private focusGroup?: InstructionGroupEditor;
    private siblings?: InstructionGroupEditor[];

    constructor(private subscriptions: SubscriptionsComponent, private parent: Editor) { }

    public _setEngine(engine: JaPNaAEngine2d) {
        this.engine = engine;
        this.subscriptions.subscribe(this.engine.keyboard.getKeydownBus("ArrowDown"), ev => this.arrowDownHandler(ev));
        this.subscriptions.subscribe(this.engine.keyboard.getKeydownBus("ArrowUp"), ev => this.arrowUpHandler(ev));
        this.subscriptions.subscribe(this.engine.keyboard.getKeydownBus("ArrowLeft"), ev => this.arrowLeftHandler(ev));
        this.subscriptions.subscribe(this.engine.keyboard.getKeydownBus("ArrowRight"), ev => this.arrowRightHandler(ev));
        this.subscriptions.subscribe(this.engine.keyboard.getKeydownBus("Home"), ev => this.homeHandler(ev));
        this.subscriptions.subscribe(this.engine.keyboard.getKeydownBus("End"), ev => this.endHandler(ev));
    }

    private arrowDownHandler(event: KeyboardEvent) {
        this.ensureFocusGroup();
        if (!this.focusGroup) { return; }

        const instructions = this.focusGroup.getInstructions();
        const children: InstructionGroupEditor[] = [];
        for (const instruction of instructions) {
            const branchTargets = instruction.getBranchTargets();
            if (branchTargets) {
                for (const target of branchTargets) {
                    if (target && !children.includes(target)) {
                        children.push(target);
                    }
                }
            }
        }

        if (children.length) {
            this.siblings = children;
            this.focus(this.siblings[0]);
        }
        this.parent.ensureCursorInSelectedGroup();
    }

    private arrowUpHandler(event: KeyboardEvent) {
        this.ensureFocusGroup();
        if (!this.focusGroup) { return; }

        const parents = new Set<InstructionGroupEditor>();

        editorsLoop: for (const editor of this.parent.getGroups()) {
            for (const instruction of editor._instructions) {
                if (!instruction.isBranch()) { continue; }
                const targets = instruction.getBranchTargets();
                if (targets) {
                    for (const target of targets) {
                        if (target === this.focusGroup) {
                            parents.add(editor);
                            continue editorsLoop;
                        }
                    }
                }
            }
        }

        const parentsArr = Array.from(parents);

        if (parentsArr.length) {
            this.siblings = parentsArr;
            this.focus(this.siblings[0]);
        }
        this.parent.ensureCursorInSelectedGroup();
    }

    private arrowLeftHandler(event: KeyboardEvent) {
        this.ensureFocusGroup();
        if (!this.focusGroup) { return; }
        if (!this.siblings) { return; }

        const index = (this.siblings.indexOf(this.focusGroup) + this.siblings.length - 1) % this.siblings.length;
        this.focus(this.siblings[index]);
        this.parent.ensureCursorInSelectedGroup();
    }

    private arrowRightHandler(event: KeyboardEvent) {
        this.ensureFocusGroup();
        if (!this.focusGroup) { return; }
        if (!this.siblings) { return; }

        const index = (this.siblings.indexOf(this.focusGroup) + 1) % this.siblings.length;
        this.focus(this.siblings[index]);
        this.parent.ensureCursorInSelectedGroup();
    }

    private homeHandler(event: KeyboardEvent) {
        this.focus(this.parent._startGroup);
    }

    private endHandler(event: KeyboardEvent) {
        const groups = this.parent.getGroups();
        this.focus(groups[groups.length - 1]);
    }

    private ensureFocusGroup() {
        const selection = this.parent.getSelectedGroups();
        if (!this.focusGroup || !selection.has(this.focusGroup)) {
            this.siblings = undefined;
            for (const group of selection) {
                this.focusGroup = group;
                break;
            }
        }

        if (!this.focusGroup) {
            const position = this.parent.cursor.getPosition();
            if (position) {
                this.focusGroup = position.group;
            }
        }
    }

    private focus(group?: InstructionGroupEditor) {
        this.focusGroup = group;
        if (!this.focusGroup) { return; }
        this.parent.clearSelection();
        this.parent.selectGroup(this.focusGroup);
        this.parent.moveCameraToGroup(this.focusGroup);
    }
}