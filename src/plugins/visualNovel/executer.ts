import { ExecuterContainer } from "../../executer/ExecuterContainer.js";
import { EventBus, JaPNaAEngine2d, SubscriptionsComponent, WorldElm, WorldElmWithComponents } from "../../japnaaEngine2d/JaPNaAEngine2d.js";
import { Elm } from "../../japnaaEngine2d/elements.js";
import { Executer } from "../EditorPlugin.js";
import { ControlBackground, isVisualNovelControlItem } from "./controls.js";

export class VisualNovelExecuter implements Executer {
    private elm = new Elm().class("visualNovelExecuter").attribute("style", "height: 50vh");
    private game?: VisualNovelGame;
    private executerContainer!: ExecuterContainer;

    public start(executerContainer: ExecuterContainer): Promise<void> {
        this.executerContainer = executerContainer;
        this.executerContainer.addOutputDisplay(this.elm);
        this.game = new VisualNovelGame(this.elm.getHTMLElement());

        return Promise.resolve();
    }

    public run(data: any): Promise<void> | null {
        if (!this.game) { return Promise.reject("Game not started"); }
        if (!isVisualNovelControlItem(data)) { return null; }

        switch (data.visualNovelCtrl) {
            case "say":
                this.executerContainer.log.log(`${data.char}: "${data.text}"`);
                return this.game.characterSay(data.char, data.text);
            case "show":
                this.executerContainer.log.log(`Show ${data.src}`);
                this.game.showImage(data.src);
                return Promise.resolve();
            case "display":
                this.executerContainer.log.log(data.text);
                return this.game.characterSay("", data.text);
            case "background":
                this.executerContainer.log.log(`Background set to ${JSON.stringify(data)}`);
                this.game.setBackground(data);
                return Promise.resolve();
            case "choose":
                return this.game.requestChoice(data.options)
                    .then(val => {
                        this.executerContainer.log.logSecondary(`<- ${data.options[val]}`);
                        this.executerContainer.writeVariable("__choice__", val);
                    });
            default:
                return null;
        }
    }

    public stop(): Promise<void> {
        this.game?.dispose();
        return Promise.resolve();
    }
}

class VisualNovelGame {
    private engine: JaPNaAEngine2d;

    private chooser = new Chooser();
    private speechBubble = new SpeechBubble();
    private background = new Background();
    private imageDisplayer = new ImageDisplayer();

    constructor(parentElm: HTMLElement) {
        this.engine = new JaPNaAEngine2d({
            sizing: { width: 1280, height: 720 },
            parentElement: parentElm
        });
        this.engine.world.addElm(this.background);
        this.engine.world.addElm(this.imageDisplayer);
        this.engine.world.addElm(this.speechBubble);
        this.engine.world.addElm(this.chooser);
    }

    public async characterSay(charName: string, text: string) {
        console.log(charName, text);
        this.speechBubble.write(charName, text);
        await this.speechBubble.onNextRequested.promise();
    }

    public async requestChoice(choices: string[]) {
        this.chooser.requestChoice(choices);
        const val = await this.chooser.onChosen.promise();
        this.chooser.clear();
        return val;
    }

    public setBackground(background: ControlBackground) {
        this.background.set(background);
    }

    public showImage(image: string) {
        this.imageDisplayer.showImage(image);
    }

    public dispose() {
        this.engine.dispose();
    }
}

class Chooser extends WorldElmWithComponents {
    private elm = new Elm();
    public onChosen = new EventBus<number>();

    constructor() {
        super();
        const style = this.elm.getHTMLElement().style;
        style.textAlign = "center";
        style.paddingTop = "64px";
    }

    public _setEngine(engine: JaPNaAEngine2d): void {
        super._setEngine(engine);
        this.engine.htmlOverlay.elm.append(this.elm);
    }

    public requestChoice(choices: string[]) {
        let i = 0;
        for (const choice of choices) {
            const cc = new ChooserChoice(choice, i, this);
            this.elm.append(cc);
            i++;
        }
    }

    public clear() {
        this.elm.clear();
    }

    public remove(): void {
        super.remove();
        this.elm.remove();
    }
}

class ChooserChoice extends Elm {
    constructor(public text: string, public index: number, private parent: Chooser) {
        super();
        this.elm.style.width = "500px";
        this.elm.style.margin = "16px auto";
        this.elm.style.backgroundColor = "#000a";
        this.elm.style.fontSize = "32px";
        this.elm.style.color = "#fffc";
        this.elm.style.textAlign = "center";
        this.elm.style.padding = "16px";
        this.elm.style.cursor = "pointer";
        this.elm.style.pointerEvents = "all";

        this.onActivate(() => {
            this.parent.onChosen.send(index);
        });

        this.append(text);
    }
}

class Background extends WorldElm {
    private color: string = "#000";
    private image?: HTMLImageElement;
    private zoom: number = 1;
    private focusX: number = 0;
    private focusY: number = 0;

    private imageLoaded = false;

    public draw() {
        const X = this.engine.canvas.X;
        X.fillStyle = this.color;
        X.fillRect(0, 0, this.engine.sizer.width, this.engine.sizer.height);

        if (this.image && this.imageLoaded) {
            const screenRatio = this.engine.sizer.width / this.engine.sizer.height;
            const imageRatio = this.image.width / this.image.height;
            let scale;
            if (screenRatio > imageRatio) {
                // match width
                scale = this.engine.sizer.width / this.image.width;
            } else {
                // match height
                scale = this.engine.sizer.height / this.image.height;
            }
            scale *= this.zoom;

            let x = (this.engine.sizer.width - this.image.width * scale) * this.focusX;
            let y = (this.engine.sizer.height - this.image.height * scale) * this.focusY;
            X.drawImage(this.image, x, y, this.image.width * scale, this.image.height * scale);
        }
    }

    public set(background: ControlBackground) {
        if (background.src) {
            this.image = new Image();
            this.image.src = background.src;
            this.imageLoaded = false;
            this.image.onload = () => this.imageLoaded = true;
        } else {
            this.image = undefined;
        }

        this.color = background.color ? "#" + background.color : "#fff";
        this.zoom = background.zoom === undefined ? 1 : background.zoom;
        this.focusX = background.x === undefined ? 0.5 : background.x / 100;
        this.focusY = background.y === undefined ? 0.5 : background.y / 100;
    }
}

class ImageDisplayer extends WorldElm {
    private image?: HTMLImageElement;
    private zoom: number = 1;
    private focusX: number = 0.5;
    private focusY: number = 0.5;

    private imageLoaded = false;

    public draw() {
        const X = this.engine.canvas.X;

        if (this.image && this.imageLoaded) {
            const screenRatio = this.engine.sizer.width / this.engine.sizer.height;
            const imageRatio = this.image.width / this.image.height;
            let scale;
            if (screenRatio > imageRatio) {
                // match height
                scale = this.engine.sizer.height / this.image.height;
            } else {
                // match width
                scale = this.engine.sizer.width / this.image.width;
            }
            scale *= this.zoom;

            let x = (this.engine.sizer.width - this.image.width * scale) * this.focusX;
            let y = (this.engine.sizer.height - this.image.height * scale) * this.focusY;
            X.drawImage(this.image, x, y, this.image.width * scale, this.image.height * scale);
        }
    }

    public showImage(src: string) {
        if (src) {
            this.image = new Image();
            this.image.src = src;
            this.imageLoaded = false;
            this.image.onload = () => this.imageLoaded = true;
        } else {
            this.image = undefined;
        }

        // this.zoom = background.zoom === undefined ? 1 : background.zoom;
        // this.focusX = background.x === undefined ? 0.5 : background.x / 100;
        // this.focusY = background.y === undefined ? 0.5 : background.y / 100;
    }
}

class SpeechBubble extends WorldElmWithComponents {
    public onNextRequested = new EventBus();

    public static secondsPerChar = 0.020;
    public timePassed = 0;
    public charsShowing = 0;

    private subs = new SubscriptionsComponent();

    private elm = new SpeechBubbleElm();
    private fullText: string = "";
    private characterName: string = "";
    private isDone = true;

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
                this.charsShowing = this.fullText.length;
            }
        });
    }

    public write(character: string, text: string) {
        this.timePassed = 0;
        this.charsShowing = 0;
        this.isDone = false;
        this.characterName = character;
        this.fullText = text;
        console.log(this);
    }

    public tick(): void {
        if (this.isDone) { return; }

        this.timePassed += this.engine.ticker.timeElapsed;
        this.charsShowing += Math.floor(this.timePassed / SpeechBubble.secondsPerChar);
        this.timePassed %= SpeechBubble.secondsPerChar;
        if (this.charsShowing >= this.fullText.length) {
            this.charsShowing = this.fullText.length;
            this.isDone = true;
        }
        this.elm.write(this.characterName, this.fullText.slice(0, this.charsShowing));
    }

    public remove(): void {
        super.remove();
        this.elm.remove();
    }
}

class SpeechBubbleElm extends Elm {
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
        this.elm.style.backgroundColor = "#0008";
    }

    public write(character: string, text: string) {
        this.replaceContents(
            new Elm().append(character).attribute("style", "font-weight: bold"),
            text
        );
    }
}
