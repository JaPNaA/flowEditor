import { WorldElmWithComponents, EventBus, SubscriptionsComponent, JaPNaAEngine2d, Rectangle } from "../../../japnaaEngine2d/JaPNaAEngine2d";
import { Elm } from "../../../japnaaEngine2d/elements";
import { VNGraphic } from "./GraphicDisplayer";

export class TextBox extends WorldElmWithComponents {
    public onNextRequested = new EventBus();

    public timePassed = 0;
    public charsShowing = 0;

    private attachedGraphic?: VNGraphic;

    private subs = new SubscriptionsComponent();

    private elm = new SpeechBubbleElm();
    private fullHTML: string = "";
    private numChars: number = 0;
    private characterNameHTML: string = "";
    private isDone = true;

    private charsPerSecond = 50;
    private secondsPerChar = 1 / this.charsPerSecond;

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

    /** Trigger update to rect to match with attached graphic */
    public updateRect() {
        if (this.attachedGraphic) {
            this.elm.setRect(this.attachedGraphic.renderedBoundingBox);
        }
    }

    public setGraphic(graphic: VNGraphic) {
        this.attachedGraphic = graphic;
        // console.log(graphic.renderedY);
        this.elm.setRect(graphic.renderedBoundingBox);
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
        this.elm.style.boxSizing = "border-box";
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

    public setRect(rect: Rectangle) {
        // screen height - height - margin - padding - border
        // const margin = 720 - 180 - 16 * 2 * 2 - 2 * 2;
        this.elm.style.left = rect.x + "px";
        this.elm.style.top = rect.y + "px";
        this.elm.style.width = rect.width + "px";
        this.elm.style.height = rect.height + "px";
        this.elm.style.bottom = "";
    }

    public setVisible() {
        this.elm.style.display = "block";
    }

    public setInvisible() {
        this.elm.style.display = "none";
    }
}
