import { FileStructureRead } from "../../../filesystem/FileStructure";
import { WorldElm, WorldElmWithComponents, Vec2, Vec2M, ParentComponent, RectangleM } from "../../../japnaaEngine2d/JaPNaAEngine2d";
import { AnimationFilter, ControlGraphic, ControlText } from "../controls";
import { VNAnimation } from "./AnimationPlayer";
import { SpeechBubble, TextBox } from "./TextBox";
import { VisualNovelGame } from "./VisualNovelGame";

export class GraphicDisplayer extends WorldElmWithComponents {
    public project!: FileStructureRead;

    private children = this.addComponent(new ParentComponent());

    constructor(private game: VisualNovelGame) { super(); }

    public graphic(graphic: ControlGraphic) {
        const previousGraphic = this.game.graphics[graphic.id];
        if (previousGraphic && previousGraphic.visible) {
            this.children.removeChild(previousGraphic);
            if (previousGraphic.attachedText) {
                this.children.removeChild(previousGraphic.attachedText);
            }
        }
        const newGraphic = new VNGraphic(graphic, this.project);
        this.game.graphics[graphic.id] = newGraphic;
    }

    public showGraphic(graphic: VNGraphic) {
        this.children.addChild(graphic);
        if (graphic.attachedText) {
            this.children.addChild(graphic.attachedText);
        }
        graphic.visible = true;
        this.engine.ticker.requestTick();
    }

    public hideGraphic(graphic: VNGraphic) {
        this.children.removeChild(graphic);
        if (graphic.attachedText) {
            this.children.removeChild(graphic.attachedText);
        }
        graphic.visible = false;
        this.engine.ticker.requestTick();
    }

    public text(text: ControlText) {
        const graphic = this.game.graphics[text.id];
        if (!graphic) { throw new Error("No graphic exists with id"); }
        if (graphic.attachedText) {
            graphic.attachedText.write(text.text);
        } else {
            const textBox = TextBox.create();
            textBox.setGraphic(graphic);
            graphic.attachedText = textBox;
            if (graphic.visible) {
                this.children.addChild(textBox);
            }
            textBox.write(text.text);
        }
    }

    public say(graphic: VNGraphic, charHTML: string, text: string) {
        if (graphic.attachedText) {
            if (graphic.attachedText instanceof SpeechBubble) {
                graphic.attachedText.write(text, charHTML);
                return;
            }
            if (graphic.visible) {
                this.children.removeChild(graphic.attachedText);
            }
        }

        const textBox = SpeechBubble.create();
        textBox.setGraphic(graphic);
        graphic.attachedText = textBox;
        if (graphic.visible) {
            this.children.addChild(textBox);
        }
        textBox.write(text, charHTML);
    }

    public sayAdd(graphic: VNGraphic, text: string) {
        if (!(graphic.attachedText instanceof SpeechBubble)) { return; }
        graphic.attachedText.writeAdd(text);
    }

    public getGraphic(id: number) {
        const graphic = this.game.graphics[id];
        if (!graphic) { throw new Error("No graphic with id " + id); }
        return graphic;
    }
}

export class VNGraphic extends WorldElm {
    public id: number;

    public animations: VNAnimation[] = [];
    public visible = false;

    /* What the graphic looks like */
    private textureSrc?: string;
    public points?: number[];
    public fill?: string; // hex color
    public stroke?: string; // hex color
    public strokeWidth?: number;
    public filters: AnimationFilter[] = [];

    /* Text */
    public attachedText?: TextBox;

    /* Position */
    public parent: number; // graphic id; note: the child is subject to the parent's transforms.
    public position: Vec2M;
    public positionAnchor?: Vec2M;

    /* Transforms */
    public transformAnchor?: Vec2M;
    public scaleBase: "fit" | "cover";
    public scale: number; // 1: image fits or covers the screen (determined by scaleBase)
    public rotation: number; // 0 to 2pi

    /* Caches */
    private texture?: HTMLImageElement;
    private textureLoaded = false;
    private pointsMinX = 0;
    private pointsWidth = 0;
    private pointsMinY = 0;
    private pointsHeight = 0;

    constructor(graphic: ControlGraphic, private project: FileStructureRead) {
        super();
        this.id = graphic.id;

        this.fill = graphic.fill ? "#" + graphic.fill : undefined;
        this.stroke = graphic.stroke ? "#" + graphic.stroke : undefined;
        this.strokeWidth = graphic.strokeWidth;
        this.parent = graphic.parent === undefined ? 1 : graphic.parent;
        this.position = new Vec2M(0.5, 0.5);
        this.scaleBase = "fit";
        this.scale = 1;
        this.rotation = 0;

        if (graphic.src) {
            this.setTexture(graphic.src);
        }

        if (graphic.points) {
            if (graphic.points.length === 2) {
                // rectangle shorthand
                this.points = [
                    0, 0,
                    graphic.points[0], 0,
                    graphic.points[0], graphic.points[1],
                    0, graphic.points[1]
                ];
            } else if (graphic.points.length === 4) {
                // rectangle shorthand (2)
                this.points = [
                    graphic.points[0], graphic.points[1],
                    graphic.points[2], graphic.points[1],
                    graphic.points[2], graphic.points[3],
                    graphic.points[0], graphic.points[3]
                ];
            } else {
                this.points = graphic.points;
            }
        } else {
            if (graphic.src || graphic.fill) {
                // this.points = auto;
            } else {
                this.points = [];
            }
        }

        this.updatePointLimits();
    }

    private stepAnimations() {
        const milliseconds = this.engine.ticker.timeElapsed;
        for (const animation of this.animations) {
            animation.step(milliseconds);
        }
        for (let i = this.animations.length - 1; i >= 0; i--) {
            if (this.animations[i].done) {
                this.animations.splice(i, 1);
            }
        }

        if (this.animations.length > 0) {
            this.engine.ticker.requestTick();
        }
    }

    public tick(): void {
        this.stepAnimations();

        // scale graphic
        let scale;
        if (this.pointsWidth !== 0 && this.pointsHeight !== 0) {
            const screenRatio = this.engine.sizer.width / this.engine.sizer.height;
            const imageRatio = this.pointsWidth / this.pointsHeight;
            if (screenRatio > imageRatio === (this.scaleBase === "fit")) {
                // match height
                scale = this.engine.sizer.height / this.pointsHeight;
            } else {
                // match width
                scale = this.engine.sizer.width / this.pointsWidth;
            }
        } else {
            scale = 1;
        }

        // translate graphic
        const positionAnchor = this.positionAnchor || this.position;
        const transformAnchor = this.transformAnchor || positionAnchor;
        const xScreen = this.position.x * this.engine.sizer.width - (positionAnchor.x * this.pointsWidth + this.pointsMinX) * scale;
        const yScreen = this.position.y * this.engine.sizer.height - (positionAnchor.y * this.pointsHeight + this.pointsMinY) * scale;

        // apply transformations
        const xObjTransformAnchor = transformAnchor.x * this.pointsWidth;
        const yObjTransformAnchor = transformAnchor.y * this.pointsHeight;
        scale *= this.scale;

        this.rect.x = xScreen - (scale - scale / this.scale) * xObjTransformAnchor;
        this.rect.y = yScreen - (scale - scale / this.scale) * yObjTransformAnchor;
        this.rect.width = this.pointsWidth * scale;
        this.rect.height = this.pointsHeight * scale;

        this.attachedText?.updateRect();
    }

    public draw() {
        const X = this.engine.canvas.X;

        let pointScale;

        // scale points
        if (this.texture && this.textureLoaded) {
            pointScale = Math.max(this.texture.width, this.texture.height) / 100;
        } else {
            pointScale = 1;
        }

        // scale graphic
        let scale;
        if (this.pointsWidth !== 0 && this.pointsHeight !== 0) {
            const screenRatio = this.engine.sizer.width / this.engine.sizer.height;
            const imageRatio = this.pointsWidth / this.pointsHeight;
            if (screenRatio > imageRatio === (this.scaleBase === "fit")) {
                // match height
                scale = this.engine.sizer.height / this.pointsHeight;
            } else {
                // match width
                scale = this.engine.sizer.width / this.pointsWidth;
            }
        } else {
            scale = 1;
        }

        // translate graphic
        const positionAnchor = this.positionAnchor || this.position;
        const transformAnchor = this.transformAnchor || positionAnchor;
        const xScreen = this.position.x * this.engine.sizer.width - (positionAnchor.x * this.pointsWidth + this.pointsMinX) * scale;
        const yScreen = this.position.y * this.engine.sizer.height - (positionAnchor.y * this.pointsHeight + this.pointsMinY) * scale;
        X.save();
        X.translate(xScreen, yScreen);
        X.scale(scale / pointScale, scale / pointScale);

        // apply transformations
        const xObjTransformAnchor = transformAnchor.x * this.pointsWidth;
        const yObjTransformAnchor = transformAnchor.y * this.pointsHeight;
        X.translate(xObjTransformAnchor, yObjTransformAnchor);
        scale *= this.scale;
        X.scale(this.scale, this.scale);
        X.translate(-xObjTransformAnchor, -yObjTransformAnchor);

        // draw graphic
        X.beginPath();

        if (this.points) {
            X.moveTo(this.points[0] * pointScale, this.points[1] * pointScale);
            for (let i = 2; i < this.points.length; i += 2) {
                X.lineTo(this.points[i] * pointScale, this.points[i + 1] * pointScale);
            }
        } else {
            X.rect(this.pointsMinX * pointScale, this.pointsMinY * pointScale, this.pointsWidth * pointScale, this.pointsHeight * pointScale);
        }

        if (this.fill) {
            X.fillStyle = this.fill;
            X.fill();
        }
        if (this.texture) {
            X.clip();
            X.drawImage(this.texture, 0, 0);
        }
        if (this.stroke) {
            X.strokeStyle = this.stroke;
            X.lineWidth = this.strokeWidth || 1;
            X.stroke();
        }

        X.restore();
    }

    private async setTexture(src: string) {
        this.textureSrc = src;
        if (this.texture) { URL.revokeObjectURL(this.texture.src); }
        if (src) {
            this.texture = new Image();
            this.texture.src = URL.createObjectURL(
                await this.project.getAsset(src)
            );
            this.textureLoaded = false;
            this.texture.onload = () => {
                this.textureLoaded = true;
                this.updatePointLimits();
                if (this.engine) {
                    this.engine.ticker.requestTick();
                }
            };
        } else {
            this.texture = undefined;
        }

        // this.color = background.color ? "#" + background.color : "#fff";
        // this.zoom = background.zoom === undefined ? 1 : background.zoom;
        // this.focusX = background.x === undefined ? 0.5 : background.x / 100;
        // this.focusY = background.y === undefined ? 0.5 : background.y / 100;
    }

    /**
     * The fit to cover factor is the number `x` such that
     * `{ baseScale: "cover", scale: 1 }` = `{ baseScale: "fit", scale: x }`
     */
    public getFitToCoverFactor() {
        if (this.pointsHeight === 0) { return 1; }
        const graphicAspect = this.pointsWidth / this.pointsHeight;
        const screenAspect = this.engine.sizer.width / this.engine.sizer.height;
        return graphicAspect > screenAspect ? graphicAspect / screenAspect : screenAspect / graphicAspect;
    }

    private updatePointLimits() {
        if (!this.points) {
            this.pointsMinX = 0;
            this.pointsMinY = 0;
            if (this.texture && this.textureLoaded) {
                const scale = Math.max(this.texture.width, this.texture.height) / 100;
                this.pointsWidth = this.texture.width / scale;
                this.pointsHeight = this.texture.height / scale;
            } else {
                this.pointsWidth = 0;
                this.pointsHeight = 0;
            }
            return;
        }

        let pointsMaxX = this.pointsMinX = this.points[0];
        let pointsMaxY = this.pointsMinY = this.points[1];

        for (let i = 2; i < this.points.length; i += 2) {
            if (this.points[i] < this.pointsMinX) {
                this.pointsMinX = this.points[i];
            }
            if (this.points[i] > pointsMaxX) {
                pointsMaxX = this.points[i];
            }
            if (this.points[i + 1] < this.pointsMinY) {
                this.pointsMinY = this.points[i + 1];
            }
            if (this.points[i + 1] > pointsMaxY) {
                pointsMaxY = this.points[i + 1];
            }
        }

        this.pointsWidth = pointsMaxX - this.pointsMinX;
        this.pointsHeight = pointsMaxY - this.pointsMinY;
    }

    public getState() {
        // return this.src;
    }

    public setState(state: any) {
        // if (state) {
        //     this.showImage(state);
        // } else {
        //     this.showImage("");
        // }
    }

    public remove(): void {
        super.remove();
        if (this.texture) { URL.revokeObjectURL(this.texture.src); }
    }
}
