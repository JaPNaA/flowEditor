import { InstructionGroupEditor } from "../../editor/InstructionGroupEditor.js";
import { JaPNaAEngine2d } from "../../japnaaEngine2d/JaPNaAEngine2d.js";
import { PluginRenderer } from "../EditorPlugin.js";
import { VNContentInstrOneLine } from "./visualNovel.js";

export class VisualNovelRenderer implements PluginRenderer {
    public renderGroup(group: InstructionGroupEditor, engine: JaPNaAEngine2d): void {
        const X = engine.canvas.X;
        X.globalAlpha = 0.4;

        let startY = 0;
        let endY = 0;
        let lastContext: VNContentInstrOneLine | undefined;

        for (const instruction of group._instructions) {
            const elm = instruction.getLines()[0].elm.getHTMLElement();
            if (instruction instanceof VNContentInstrOneLine) {
                if (lastContext) {
                    if (this.equalContext(lastContext, instruction)) {
                        endY = elm.offsetTop + elm.offsetHeight;
                    } else {
                        this.flush(lastContext, startY, endY, group, X);
                        lastContext = instruction;
                        startY = elm.offsetTop;
                        endY = elm.offsetTop + elm.offsetHeight;
                    }
                } else {
                    startY = elm.offsetTop;
                    endY = elm.offsetTop + elm.offsetHeight;
                    lastContext = instruction;
                }
            } else if (lastContext) {
                this.flush(lastContext, startY, endY, group, X);
                lastContext = undefined;
            }
        }

        if (lastContext) {
            this.flush(lastContext, startY, endY, group, X);
        }

        X.globalAlpha = 1;
    }

    private equalContext(a: VNContentInstrOneLine, b: VNContentInstrOneLine) {
        if (a.backgroundSrc && b.backgroundSrc) {
            return a.backgroundSrc === b.backgroundSrc;
        } else if (a.backgroundSrc || b.backgroundSrc) {
            return false;
        } else {
            return a.backgroundColor === b.backgroundColor;
        }
    }

    private flush(
        context: VNContentInstrOneLine,
        startY: number,
        endY: number,
        group: InstructionGroupEditor,
        X: CanvasRenderingContext2D
    ) {
        const backgroundColor = context.backgroundColor;
        if (!backgroundColor) { return; }
        X.fillStyle = backgroundColor;
        X.fillRect(group.rect.x, group.rect.y + startY, group.rect.width, endY - startY);
    }
}