import { FileStructureRead } from "../../../filesystem/FileStructure";
import { WorldElm, WorldElmWithComponents, EventBus, SubscriptionsComponent, JaPNaAEngine2d, Vec2, Vec2M, ParentComponent } from "../../../japnaaEngine2d/JaPNaAEngine2d";
import { Elm } from "../../../japnaaEngine2d/elements";
import { AnimationFilter, ControlGraphic } from "../controls";

export class GraphicDisplayer extends WorldElmWithComponents {
    public project!: FileStructureRead;

    private children = this.addComponent(new ParentComponent());
    private graphics: (VNGraphic | undefined)[] = [undefined];

    public graphic(graphic: ControlGraphic) {
        const previousGraphic = this.graphics[graphic.id];
        if (previousGraphic) {
            this.children.removeChild(previousGraphic);
        }
        const newGraphic = new VNGraphic(graphic, this.project);
        this.graphics[graphic.id] = newGraphic;
        this.children.addChild(newGraphic);
        this.engine.ticker.requestTick();
    }

    public getGraphic(id: number) {
        const graphic = this.graphics[id];
        if (!graphic) { throw new Error("No graphic with id " + id); }
        return graphic;
    }
}

export class VNGraphic extends WorldElm {
    /* What the graphic looks like */
    private textureSrc?: string;
    public points: number[];
    public fill?: string; // hex color
    public stroke?: string; // hex color
    public strokeWidth?: number;
    public filters: AnimationFilter[] = [];

    /* Position */
    public parent: number; // graphic id; note: the child is subject to the parent's transforms.
    public position: Vec2M;
    public positionAnchor: Vec2M;

    /* Transforms */
    public transformAnchor: Vec2;
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
        this.fill = graphic.fill ? "#" + graphic.fill : undefined;
        this.stroke = graphic.stroke ? "#" + graphic.stroke : undefined;
        this.strokeWidth = graphic.strokeWidth;
        this.parent = graphic.parent === undefined ? 1 : graphic.parent;
        this.position = new Vec2M(0.5, 0.5);
        this.positionAnchor = this.position;
        this.transformAnchor = this.positionAnchor;
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
            if (graphic.src) {
                // TODO rectangle matching size of texture
                this.points = [];
            } else if (graphic.fill) {
                // TODO rectangle matching size of screen
                this.points = [];
            } else {
                this.points = [];
            }
        }

        this.updatePointLimits();
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
        const screenRatio = this.engine.sizer.width / this.engine.sizer.height;
        const imageRatio = this.pointsWidth / this.pointsHeight;
        let scale;
        if (screenRatio > imageRatio === (this.scaleBase === "fit")) {
            // match height
            scale = this.engine.sizer.height / this.pointsHeight;
        } else {
            // match width
            scale = this.engine.sizer.width / this.pointsWidth;
        }

        // translate graphic
        const x = (this.engine.sizer.width - this.pointsWidth * scale) * this.positionAnchor.x - this.pointsMinX * scale;
        const y = (this.engine.sizer.height - this.pointsHeight * scale) * this.positionAnchor.y - this.pointsMinY * scale;
        X.save();
        X.translate(x, y);
        X.scale(scale / pointScale, scale / pointScale);

        // draw graphic
        X.beginPath();

        X.moveTo(this.points[0] * pointScale, this.points[1] * pointScale);
        for (let i = 2; i < this.points.length; i += 2) {
            X.lineTo(this.points[i] * pointScale, this.points[i + 1] * pointScale);
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
                this.engine.ticker.requestTick();
            };
        } else {
            this.texture = undefined;
        }

        // this.color = background.color ? "#" + background.color : "#fff";
        // this.zoom = background.zoom === undefined ? 1 : background.zoom;
        // this.focusX = background.x === undefined ? 0.5 : background.x / 100;
        // this.focusY = background.y === undefined ? 0.5 : background.y / 100;
    }

    private updatePointLimits() {
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

class SpeechBubble extends WorldElmWithComponents {
    public onNextRequested = new EventBus();

    public timePassed = 0;
    public charsShowing = 0;

    private subs = new SubscriptionsComponent();

    private elm = new SpeechBubbleElm();
    private fullHTML: string = "";
    private numChars: number = 0;
    private characterNameHTML: string = "";
    private isDone = true;

    private charsPerSecond = 50;
    private secondsPerChar = 1 / this.charsPerSecond;

    private visible = true;

    private posY: number = 100;

    constructor() {
        super();
    }

    public _setEngine(engine: JaPNaAEngine2d): void {
        super._setEngine(engine);
        this.engine.htmlOverlay.elm.append(this.elm);
        this.subs.subscribe(this.engine.mouse.onMousedown, () => {
            if (this.isDone) {
                this.onNextRequested.send();
            } else {
                this.showAllChars();
            }
        });
    }

    /** @param y 0 to 100 */
    public setPositionY(y: number) {
        this.posY = y;
        this.elm.setPositionY(y);
    }

    public setSpeed(charsPerSecond: number) {
        this.charsPerSecond = charsPerSecond;
        if (charsPerSecond > 0) {
            this.secondsPerChar = 1 / charsPerSecond;
        } else {
            this.secondsPerChar = 0;
        }
    }

    public getSpeed() {
        return this.charsPerSecond;
    }

    public setVisible(visible: boolean) {
        if (this.visible === visible) { return; }
        this.visible = visible;
        if (visible) {
            this.elm.setVisible();
        } else {
            this.elm.setInvisible();
        }
    }

    public write(characterHTML: string, html: string) {
        this.timePassed = 0;
        this.charsShowing = 0;
        this.isDone = false;
        this.characterNameHTML = characterHTML;
        this.fullHTML = html;
        this.numChars = this.elm.setFullHTML(this.characterNameHTML, html);

        if (this.charsPerSecond === 0) {
            this.showAllChars();
        }
        this.engine.ticker.requestTick();
    }

    public writeAdd(html: string) {
        this.timePassed = 0;
        this.charsShowing = this.numChars + 1;
        this.isDone = false;
        this.fullHTML = this.fullHTML + "\n" + html;
        this.numChars = this.elm.setFullHTML(this.characterNameHTML, this.fullHTML);

        if (this.charsPerSecond === 0) {
            this.showAllChars();
        }
        this.engine.ticker.requestTick();
    }

    public showAllChars() {
        this.charsShowing = this.numChars;
        this.render();
        this.isDone = true;
    }

    public getState() {
        return {
            charsShowing: this.charsShowing,
            fullHTML: this.fullHTML,
            characterNameHTML: this.characterNameHTML,
            settings: {
                visible: this.visible,
                posY: this.posY,
                speed: this.charsPerSecond
            }
        };
    }

    public setState(state: any) {
        this.setVisible(state.settings.visible);
        this.setPositionY(state.settings.posY);
        this.setSpeed(state.settings.speed);

        this.write(state.characterNameHTML, state.fullHTML);
        this.charsShowing = state.charsShowing;
        this.render();
    }

    public tick(): void {
        if (this.isDone) { return; }
        this.engine.ticker.requestTick();

        this.timePassed += this.engine.ticker.timeElapsed;
        this.charsShowing += Math.floor(this.timePassed / this.secondsPerChar);
        this.timePassed %= this.secondsPerChar;
        if (this.charsShowing >= this.numChars) {
            this.charsShowing = this.numChars;
            this.isDone = true;
        }
        this.render();
    }

    public remove(): void {
        super.remove();
        this.elm.remove();
    }

    private render() {
        this.elm.showChars(this.charsShowing);
    }
}

class SpeechBubbleElm extends Elm {
    /** [revealed text, hidden text][] */
    private revealNodes?: [Text, HTMLSpanElement][];

    constructor() {
        super();
        this.elm.style.position = "absolute";
        this.elm.style.fontSize = "32px";
        this.elm.style.left = "16px";
        this.elm.style.right = "16px";
        this.elm.style.bottom = "16px";
        this.elm.style.height = "180px";
        this.elm.style.border = "2px solid #888";
        this.elm.style.borderRadius = "8px";
        this.elm.style.padding = "16px";
        this.elm.style.color = "#fffc";
        this.elm.style.backgroundColor = "#000a";
        this.elm.style.backdropFilter = "blur(4px)";
        this.elm.style.whiteSpace = "pre-wrap";
        this.elm.style.overflow = "hidden"; // prevent very large text from expanding hitbox
    }

    /**
     * Set the full html to show.
     * Returns the number of characters that are showable.
     */
    public setFullHTML(characterHTML: string, html: string): number {
        let elm;
        this.replaceContents(
            new Elm().attribute("style", "font-weight: bold")
                .withSelf(elm => elm.getHTMLElement().innerHTML = characterHTML),
            elm = new Elm().withSelf(elm => elm.getHTMLElement().innerHTML = html)
        );

        let numChars = 0;
        const htmlElm = elm.getHTMLElement();
        const textNodes: Text[] = [];
        this.revealNodes = [];
        this.recursiveAddTextNodes(textNodes, htmlElm);

        for (const node of textNodes) {
            numChars += node.textContent ? node.textContent.length : 0;

            const hiddenText = document.createElement("span");
            hiddenText.style.opacity = "0";
            node.replaceWith(hiddenText);
            hiddenText.appendChild(node);

            const revealedText = document.createTextNode("");
            hiddenText.parentElement!.insertBefore(revealedText, hiddenText);

            this.revealNodes.push([revealedText, hiddenText]);
        }

        return numChars;
    }

    public showChars(upTo: number) {
        if (!this.revealNodes) { return; }
        let remaining = upTo;
        for (const [revealed, hidden] of this.revealNodes) {
            if (revealed.textContent) {
                remaining -= revealed.textContent.length;
            }
            if (remaining <= 0) { return; }
            if (hidden.innerText.length > 0) {
                if (hidden.innerText.length < remaining) {
                    revealed.textContent = (revealed.textContent || "") + hidden.innerText;
                    remaining -= hidden.innerText.length;
                    hidden.innerText = "";
                } else {
                    revealed.textContent = (revealed.textContent || "") + hidden.innerText.slice(0, remaining);
                    hidden.innerText = hidden.innerText.slice(remaining);
                    return;
                }
            }
        }
    }

    private recursiveAddTextNodes(nodes: Text[], node: Element) {
        for (const child of node.childNodes) {
            if (child instanceof Text) {
                nodes.push(child);
            } else if (child instanceof Element) {
                this.recursiveAddTextNodes(nodes, child);
            }
        }
    }

    public setPositionY(y: number) {
        const percent = y / 100;
        // screen height - height - margin - padding - border
        const margin = 720 - 180 - 16 * 2 * 2 - 2 * 2;
        this.elm.style.top = (16 + percent * margin) + "px";
        this.elm.style.bottom = "";
    }

    public setVisible() {
        this.elm.style.display = "block";
    }

    public setInvisible() {
        this.elm.style.display = "none";
    }
}
