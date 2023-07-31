import { InstructionGroupEditor } from "../../editor/InstructionGroupEditor.js";
import { NewInstruction } from "../../editor/instruction/NewInstruction.js";
import { JaPNaAEngine2d } from "../../japnaaEngine2d/JaPNaAEngine2d.js";
import { Project } from "../../project/Project.js";
import { PluginRenderer } from "../EditorPlugin.js";
import { VNContentInstrOneLine, VNInstructionContext } from "./visualNovel.js";

export class VisualNovelRenderer implements PluginRenderer {
    private project!: Project;
    private engine!: JaPNaAEngine2d;
    private pathURLMap = new Map<string, HTMLImageElement>();

    public setProject(project: Project) {
        this.project = project;
    }

    public setEngine(engine: JaPNaAEngine2d) {
        this.engine = engine;
    }

    public renderGroup(group: InstructionGroupEditor): void {
        const X = this.engine.canvas.X;
        X.globalAlpha = 0.1;

        let startY = 0;
        let endY = 0;
        let lastContext: VNInstructionContext | undefined;

        for (const instruction of group._instructions) {
            const elm = instruction.getLines()[0].elm.getHTMLElement();
            if (instruction instanceof VNContentInstrOneLine) {
                if (lastContext) {
                    if (instruction.context && this.equalContext(lastContext, instruction.context)) {
                        endY = elm.offsetTop + elm.offsetHeight;
                    } else {
                        this.flush(lastContext, startY, endY, group, X);
                        lastContext = instruction.context;
                        startY = elm.offsetTop;
                        endY = elm.offsetTop + elm.offsetHeight;
                    }
                } else {
                    startY = elm.offsetTop;
                    endY = elm.offsetTop + elm.offsetHeight;
                    lastContext = instruction.context;
                }
            } else if (instruction instanceof NewInstruction) {
                // do nothing
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

    private equalContext(a: VNInstructionContext, b: VNInstructionContext) {
        if (a.backgroundSrc && b.backgroundSrc) {
            return a.backgroundSrc === b.backgroundSrc;
        } else if (a.backgroundSrc || b.backgroundSrc) {
            return false;
        } else {
            return a.backgroundColor === b.backgroundColor;
        }
    }

    private flush(
        context: VNInstructionContext,
        startY: number,
        endY: number,
        group: InstructionGroupEditor,
        X: CanvasRenderingContext2D
    ) {
        if (context.backgroundSrc) {
            const fillHeight = endY - startY;
            const image = this.getImage(context.backgroundSrc);

            if (image.width > 0 && image.height > 0) {
                const scale = InstructionGroupEditor.defaultWidth / image.width;
                const imageDrawHeight = scale * image.height;
                if (fillHeight < imageDrawHeight) {
                    // draw centered
                    X.drawImage(
                        image,
                        0, (imageDrawHeight - fillHeight) / 2 / scale, image.width, fillHeight / scale,
                        group.rect.x, group.rect.y + startY,
                        InstructionGroupEditor.defaultWidth, fillHeight
                    );
                } else {
                    // tile
                    for (let y = 0; y < fillHeight; y += imageDrawHeight) {
                        const dstDrawTo = Math.min(fillHeight - y, imageDrawHeight);
                        const srcDrawTo = Math.min(image.height, (fillHeight - y) / scale);
                        X.drawImage(
                            image,
                            0, 0, image.width, srcDrawTo,
                            group.rect.x, group.rect.y + startY + y, InstructionGroupEditor.defaultWidth, dstDrawTo
                        );
                    }
                }
            }
        } else if (context.backgroundColor) {
            X.fillStyle = context.backgroundColor;
            X.fillRect(group.rect.x, group.rect.y + startY, group.rect.width, endY - startY);
        }
    }

    private getImage(src: string) {
        const cache = this.pathURLMap.get(src);
        if (cache) { return cache; }
        const image = new Image();
        image.addEventListener("load", () => this.engine.ticker.requestTick());
        this.pathURLMap.set(src, image);

        this.project.getAsset(src).then(asset => {
            const url = URL.createObjectURL(asset);
            image.src = url;
        });
        return image;
    }
}