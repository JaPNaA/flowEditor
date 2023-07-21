import { ExecuterContainer } from "../../executer/ExecuterContainer.js";
import { EventBus, JaPNaAEngine2d, SubscriptionsComponent, WorldElm, WorldElmWithComponents } from "../../japnaaEngine2d/JaPNaAEngine2d.js";
import { Elm } from "../../japnaaEngine2d/elements.js";
import { Project } from "../../project/Project.js";
import { Executer } from "../EditorPlugin.js";
import { ControlBackground, ControlSpeechBubbleSettings, isVisualNovelControlItem } from "./controls.js";
import { replaceVariables, visualNovelMdToHTML } from "./visualNovelMd.js";

export class VisualNovelExecuter implements Executer {
    private elm = new Elm().class("visualNovelExecuter")
        .attribute("style", "height: 50vh; font-family: serif; user-select: none;")
        .attribute("tabindex", "0")
        .append(new Elm("style").withSelf(s => {
            s.getHTMLElement().innerHTML = `
            .visualNovelMD .volume[level='#'] {
                font-size: 0.6em;
                opacity: 0.4;
                font-style: italic;
            }

            .visualNovelMD .volume[level='##'] {
                font-size: 0.7em;
                opacity: 0.8;
                font-style: italic;
            }

            .visualNovelMD .volume[level='###'] {
                font-size: 0.8em;
            }

            .visualNovelMD .volume[level='####'] {
                font-size: 1.2em;
                font-weight: 600;
                color: #fff;
            }

            .visualNovelMD .volume[level='#####'] {
                font-size: 2em;
                font-weight: 600;
                color: #fff;
            }

            .visualNovelMD .volume[level='######'] {
                font-size: 6em;
                font-weight: 1000;
                color: #fff;
                line-height: 0.92;
            }
            `;
        }));
    private game?: VisualNovelGame;
    private executerContainer!: ExecuterContainer;

    private stringVariables = new Map();

    constructor() {
        this.elm.on("keydown", key => {
            if (key.key === "f") {
                this.elm.getHTMLElement().requestFullscreen();
            }
        });

        this.getVariable = this.getVariable.bind(this);
    }

    public start(executerContainer: ExecuterContainer): Promise<void> {
        this.executerContainer = executerContainer;
        this.executerContainer.addOutputDisplay(this.elm);
        this.game = new VisualNovelGame(this.elm.getHTMLElement());
        this.game.setProject(executerContainer.getProject());
        this.stringVariables.clear();

        return Promise.resolve();
    }

    public run(data: any): Promise<void> | null {
        if (!this.game) { return Promise.reject("Game not started"); }
        if (!isVisualNovelControlItem(data)) { return null; }

        switch (data.visualNovelCtrl) {
            case "say":
                this.executerContainer.log.log(`${data.char}: "${data.text}"`);
                return this.game.characterSay(data.char, visualNovelMdToHTML(data.text, this.getVariable));
            case "say-add":
                this.executerContainer.log.log('"' + data.text + '"');
                return this.game.characterSayAdd(visualNovelMdToHTML(data.text, this.getVariable));
            case "show":
                this.executerContainer.log.log(`Show ${data.src}`);
                return this.game.showImage(replaceVariables(data.src, this.getVariable));
            case "background":
                this.executerContainer.log.log(`Background set to ${JSON.stringify(data)}`);
                return this.game.setBackground({
                    ...data,
                    src: data.src && replaceVariables(data.src, this.getVariable)
                });
            case "choose":
                return this.game.requestChoice(
                    data.options.map(v => visualNovelMdToHTML(v, this.getVariable))
                ).then(val => {
                    this.executerContainer.log.logSecondary(`<- ${data.options[val]}`);
                    this.executerContainer.writeVariable(data.variable, val);
                });
            case "speechBubbleSettings":
                this.game.setSpeechBubbleSettings(data);
                return Promise.resolve();
            case "wait":
                return new Promise(res => setTimeout(() => res(), data.time));
            case "bgm":
                this.game.setBackgroundMusic(replaceVariables(data.src, this.getVariable));
                return Promise.resolve();
            default:
                return null;
        }
    }

    public stop(): Promise<void> {
        this.game?.dispose();
        return Promise.resolve();
    }

    /** Function used to map flow variable to string */
    private getVariable(str: string): string | undefined {
        const pointer = this.executerContainer.getVariable(str);
        if (pointer === undefined) { return; }
        return this.stringVariables.get(pointer) || pointer.toString();
    }
}

class VisualNovelGame {
    private engine: JaPNaAEngine2d;

    private chooser = new Chooser();
    private speechBubble = new SpeechBubble();
    private background = new Background();
    private imageDisplayer = new ImageDisplayer();
    private bgm?: HTMLAudioElement;
    private project!: Project;

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

    public setProject(project: Project) {
        this.project = project;
        this.background.project = project;
        this.imageDisplayer.project = project;
    }

    public async characterSay(charName: string, text: string) {
        this.speechBubble.write(charName, text);

        if (this.engine.mouse.rightDown) {
            // skip
            this.speechBubble.showAllChars();
            return new Promise<void>(res => {
                setTimeout(res, 50);
            });
        }

        await this.speechBubble.onNextRequested.promise();
    }

    public async characterSayAdd(text: string) {
        this.speechBubble.writeAdd(text);

        if (this.engine.mouse.rightDown) {
            // skip
            this.speechBubble.showAllChars();
            return new Promise<void>(res => {
                setTimeout(res, 50);
            });
        }

        await this.speechBubble.onNextRequested.promise();
    }

    public async requestChoice(choices: string[]) {
        this.chooser.requestChoice(choices);
        const val = await this.chooser.onChosen.promise();
        this.chooser.clear();
        return val;
    }

    public setBackground(background: ControlBackground) {
        return this.background.set(background);
    }

    public showImage(image: string) {
        return this.imageDisplayer.showImage(image);
    }

    public setSpeechBubbleSettings(settings: ControlSpeechBubbleSettings) {
        if (settings.visible !== undefined) {
            this.speechBubble.setVisible(settings.visible);
        }
        if (settings.positionX !== undefined) { }
        if (settings.positionY !== undefined) {
            this.speechBubble.setPositionY(settings.positionY);
        }
        if (settings.width !== undefined) { }
        if (settings.height !== undefined) { }
        if (settings.revealSpeed !== undefined) {
            this.speechBubble.setSpeed(settings.revealSpeed);
        }
        if (settings.advanceType) { }
        if (settings.autoAdvanceDelay) { }
        if (settings.style) { }
        if (settings.tagStyles) { }
    }

    public async setBackgroundMusic(src: string) {
        if (!src && this.bgm) {
            this.bgm.pause();
            return;
        }
        if (!src) { return; }
        if (!this.bgm) {
            this.bgm = new Audio(
                URL.createObjectURL(
                    await this.project.getAsset(src)
                )
            );
            this.bgm.loop = true;
            this.bgm.volume = 0.4;
            this.bgm.play();
        } else {
            if (this.bgm.src) { URL.revokeObjectURL(this.bgm.src); }
            this.bgm.src = src;
            this.bgm.play();
        }
    }

    public dispose() {
        if (this.bgm) {
            this.bgm.pause();
            this.bgm = undefined;
        }
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
    constructor(public html: string, public index: number, private parent: Chooser) {
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

        this.elm.innerHTML = html;
    }
}

class Background extends WorldElm {
    public project!: Project;

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

    public async set(background: ControlBackground) {
        if (this.image) { URL.revokeObjectURL(this.image.src); }
        if (background.src) {
            this.image = new Image();
            this.image.src = URL.createObjectURL(
                await this.project.getAsset(background.src)
            );
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
    public project!: Project;

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

    public async showImage(src: string) {
        if (this.image) { URL.revokeObjectURL(this.image.src); }
        if (src) {
            this.image = new Image();
            this.image.src = URL.createObjectURL(
                await this.project.getAsset(src)
            );
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

    public timePassed = 0;
    public charsShowing = 0;

    private subs = new SubscriptionsComponent();

    private elm = new SpeechBubbleElm();
    private fullHTML: string = "";
    private numChars: number = 0;
    private characterName: string = "";
    private isDone = true;

    private charsPerSecond = 50;
    private secondsPerChar = 1 / this.charsPerSecond;

    private visible = true;

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

    public write(character: string, html: string) {
        this.timePassed = 0;
        this.charsShowing = 0;
        this.isDone = false;
        this.characterName = character;
        this.fullHTML = html;
        this.numChars = this.elm.setFullHTML(this.characterName, html);

        if (this.charsPerSecond === 0) {
            this.showAllChars();
        }
    }

    public writeAdd(html: string) {
        this.timePassed = 0;
        this.charsShowing = this.numChars + 1;
        this.isDone = false;
        this.fullHTML = this.fullHTML + "\n" + html;
        this.numChars = this.elm.setFullHTML(this.characterName, this.fullHTML);

        if (this.charsPerSecond === 0) {
            this.showAllChars();
        }
    }

    public showAllChars() {
        this.charsShowing = this.numChars;
        this.render();
        this.isDone = true;
    }

    public tick(): void {
        if (this.isDone) { return; }

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
    public setFullHTML(character: string, html: string): number {
        let elm;
        this.replaceContents(
            new Elm().append(character).attribute("style", "font-weight: bold"),
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
