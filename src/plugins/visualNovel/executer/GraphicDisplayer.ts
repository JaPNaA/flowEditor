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
        const newGraphic = new VNGraphic(graphic)
        this.graphics[graphic.id] = newGraphic;
        this.children.addChild(newGraphic);
        this.engine.ticker.requestTick();
    }
}

export class VNGraphic extends WorldElm {
    /* What the graphic looks like */
    private textureSrc?: string;
    private points: number[];
    private fill?: string; // hex color
    private stroke?: string; // hex color
    private strokeWidth?: number;
    private filters: AnimationFilter[] = [];

    /* Position */
    private parent: number; // graphic id; note: the child is subject to the parent's transforms.
    private position: Vec2;
    private positionAnchor: Vec2;

    /* Transforms */
    private transformAnchor: Vec2;
    private scaleBase: "fit" | "cover";
    private scale: number; // 1: image fits or covers the screen (determined by scaleBase)
    private rotation: number; // 0 to 2pi

    private texture?: HTMLImageElement;
    private textureLoaded = false;

    constructor(graphic: ControlGraphic) {
        super();
        this.textureSrc = graphic.src;
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

        if (graphic.points) {
            if (graphic.points.length === 2) {
                // rectangle shorthand
                this.points = [
                    0, 0,
                    graphic.points[0], 0,
                    graphic.points[0], graphic.points[1],
                    0, graphic.points[1]
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
    }

    public draw() {
        const X = this.engine.canvas.X;

        X.beginPath();
        X.moveTo(this.points[0], this.points[1]);
        for (let i = 2; i < this.points.length; i += 2) {
            X.lineTo(this.points[i], this.points[i + 1]);
        }
        if (this.fill) {
            X.fillStyle = this.fill;
            X.fill();
        }
        if (this.stroke) {
            X.strokeStyle = this.stroke;
            X.lineWidth = this.strokeWidth || 1;
            X.stroke();
        }

        // if (this.texture && this.textureLoaded) {
        //     const screenRatio = this.engine.sizer.width / this.engine.sizer.height;
        //     const imageRatio = this.texture.width / this.texture.height;
        //     let scale;
        //     if (screenRatio > imageRatio === (this.scaleBase === "fit")) {
        //         // match height
        //         scale = this.engine.sizer.height / this.texture.height;
        //     } else {
        //         // match width
        //         scale = this.engine.sizer.width / this.texture.width;
        //     }
        //     scale *= this.zoom;

        //     let x = (this.engine.sizer.width - this.texture.width * scale) * this.focusX;
        //     let y = (this.engine.sizer.height - this.texture.height * scale) * this.focusY;
        //     X.drawImage(this.texture, x, y, this.texture.width * scale, this.texture.height * scale);
        // }
    }

    public async showImage(src: string) {
        // this.src = src;
        // if (this.texture) { URL.revokeObjectURL(this.texture.src); }
        // if (src) {
        //     this.texture = new Image();
        //     this.texture.src = URL.createObjectURL(
        //         await this.project.getAsset(src)
        //     );
        //     this.imageLoaded = false;
        //     this.texture.onload = () => {
        //         this.imageLoaded = true;
        //         this.engine.ticker.requestTick();
        //     };
        // } else {
        //     this.texture = undefined;
        // }

        // // this.zoom = background.zoom === undefined ? 1 : background.zoom;
        // // this.focusX = background.x === undefined ? 0.5 : background.x / 100;
        // // this.focusY = background.y === undefined ? 0.5 : background.y / 100;
    }

    // public async set(background: ControlBackground) {
    //     this.background = background;
    //     if (this.texture) { URL.revokeObjectURL(this.texture.src); }
    //     if (background.src) {
    //         this.texture = new Image();
    //         this.texture.src = URL.createObjectURL(
    //             await this.project.getAsset(background.src)
    //         );
    //         this.imageLoaded = false;
    //         this.texture.onload = () => {
    //             this.imageLoaded = true;
    //             this.engine.ticker.requestTick();
    //         };
    //     } else {
    //         this.texture = undefined;
    //     }

    //     this.color = background.color ? "#" + background.color : "#fff";
    //     this.zoom = background.zoom === undefined ? 1 : background.zoom;
    //     this.focusX = background.x === undefined ? 0.5 : background.x / 100;
    //     this.focusY = background.y === undefined ? 0.5 : background.y / 100;
    // }

    public getState() {
        // return this.src;
    }

    public setState(state: any) {
        if (state) {
            this.showImage(state);
        } else {
            this.showImage("");
        }
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
