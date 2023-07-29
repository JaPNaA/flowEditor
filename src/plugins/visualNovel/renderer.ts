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
        let lastBackgroundColor: string | undefined;

        for (const instruction of group._instructions) {
            const elm = instruction.getLines()[0].elm.getHTMLElement();
            if (instruction instanceof VNContentInstrOneLine) {
                if (lastBackgroundColor) {
                    if (lastBackgroundColor === instruction.backgroundColor) {
                        endY = elm.offsetTop + elm.offsetHeight;
                    } else {
                        this.flush(lastBackgroundColor, startY, endY, group, X);
                        lastBackgroundColor = instruction.backgroundColor;
                        startY = elm.offsetTop;
                        endY = elm.offsetTop + elm.offsetHeight;
                    }
                } else {
                    startY = elm.offsetTop;
                    endY = elm.offsetTop + elm.offsetHeight;
                    lastBackgroundColor = instruction.backgroundColor;
                }
            } else if (lastBackgroundColor) {
                this.flush(lastBackgroundColor, startY, endY, group, X);
                lastBackgroundColor = undefined;
            }
        }

        if (lastBackgroundColor) {
            this.flush(lastBackgroundColor, startY, endY, group, X);
        }

        X.globalAlpha = 1;
    }

    private flush(
        backgroundColor: string,
        startY: number,
        endY: number,
        group: InstructionGroupEditor,
        X: CanvasRenderingContext2D
    ) {
        X.fillStyle = backgroundColor;
        X.fillRect(group.rect.x, group.rect.y + startY, group.rect.width, endY - startY);
    }
}