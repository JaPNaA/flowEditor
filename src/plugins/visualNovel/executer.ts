import { PluginExecuter } from "../../editor/EditorPlugin";
import { Executer } from "../../executer/Executer";
import { FileStructureRead } from "../../filesystem/FileStructure";
import { EventBus, JaPNaAEngine2d, SubscriptionsComponent, WorldElm, WorldElmWithComponents } from "../../japnaaEngine2d/JaPNaAEngine2d";
import { Elm } from "../../japnaaEngine2d/elements";
import { ControlBackground, ControlSpeechBubbleSettings, isVisualNovelControlItem } from "./controls";
import { visualNovelExecuterCSS } from "./visualNovelExecuterCSS";
import { replaceVariables, visualNovelMdToHTML } from "./visualNovelMd";

export class VisualNovelExecuter implements PluginExecuter {
    private elm = new Elm().class("visualNovelExecuter")
        .attribute("tabindex", "0")
        .append(new Elm("style").withSelf(s => {
            s.getHTMLElement().innerHTML = visualNovelExecuterCSS;
        }));
    private game?: VisualNovelGame;
    private executer!: Executer;

    private stringVariables: string[] = [];

    constructor() {
        const style = this.elm.getHTMLElement().style;
        if (CSS.supports('aspect-ratio', '16 / 9')) {
            style.aspectRatio = "16 / 9";
            style.width = "100%";
            style.maxHeight = "67vh";
        } else {
            style.height = "50vh";
        }
        style.fontFamily = "serif";
        style.userSelect = "none";

        this.elm.on("keydown", key => {
            if (key.key === "f") {
                this.elm.getHTMLElement().requestFullscreen();
            }
        });

        this.getVariable = this.getVariable.bind(this);
    }

    public start(executer: Executer): Promise<void> {
        this.executer = executer;
        this.executer.addOutputDisplay(this.elm);
        this.game = new VisualNovelGame(this.elm.getHTMLElement());
        this.game.setProject(executer.files);
        this.game.getChooserChosenEventBus()
            .subscribe(choice => this.executer.input(choice));
        this.game.onContinue.subscribe(() => this.executer.resume());
        this.stringVariables.length = 0;

        return Promise.resolve();
    }

    public run(data: any): boolean {
        if (!this.game) { throw new Error("Game not started"); }
        if (!isVisualNovelControlItem(data)) { return false; }

        switch (data.visualNovelCtrl) {
            case "say":
                this.executer.log.log(`${data.char}: "${data.text}"`);
                this.game.characterSay(
                    visualNovelMdToHTML(data.char, this.getVariable),
                    visualNovelMdToHTML(data.text, this.getVariable)
                );
                this.executer.pause();
                return true;
            case "say-add":
                this.executer.log.log('"' + data.text + '"');
                this.game.characterSayAdd(visualNovelMdToHTML(data.text, this.getVariable));
                this.executer.pause();
                return true;
            case "show":
                this.executer.log.log(`Show ${data.src}`);
                this.game.showImage(replaceVariables(data.src, this.getVariable));
                return true;
            case "background":
                this.executer.log.log(`Background set to ${JSON.stringify(data)}`);
                this.game.setBackground({
                    ...data,
                    src: data.src && replaceVariables(data.src, this.getVariable)
                });
                return true;
            case "choose":
                if (data.options) {
                    this.game.showChoices(data.options.map(v => visualNovelMdToHTML(v, this.getVariable)));
                } else {
                    this.game.hideChoices();
                }
                return true;
            case "speechBubbleSettings":
                this.game.setSpeechBubbleSettings(data);
                return true;
            case "wait":
                this.executer.pause();
                setTimeout(() => this.executer.resume(), data.time);
                return true;
            case "bgm":
                this.game.setBackgroundMusic(replaceVariables(data.src, this.getVariable));
                this.executer.log.logSecondary("Set background music: " + data.src);
                return true;
            case "bgmSettings":
                this.game.setBackgroundMusicSettings(data);
                return true;
            case "sfx":
                this.game.playSFX(replaceVariables(data.src, this.getVariable));
                return true;
            case "sfxSettings":
                this.game.setSFXSettings(data);
                return true;
            case "strset":
                this.executer.writeVariable(data.v, this.stringVariables.push(data.str));
                return true;
            default:
                return false;
        }
    }

    public stop(): Promise<void> {
        this.game?.dispose();
        return Promise.resolve();
    }

    public getState() {
        return {
            stringVariables: this.stringVariables.slice(),
            game: this.game?.getState()
        };
    }

    public setState(state: any): void {
        this.stringVariables = state.stringVariables;
        if (state.game && this.game) {
            this.game.setState(state.game);
        }
    }

    /** Function used to map flow variable to string */
    private getVariable(str: string): string | undefined {
        const pointer = this.executer.getVariable(str);
        if (pointer === undefined) { return; }
        return this.stringVariables[pointer - 1] === undefined ?
            pointer.toString() : this.stringVariables[pointer - 1];
    }
}

class VisualNovelGame {
    public onContinue = new EventBus();
    private engine: JaPNaAEngine2d;

    private chooser = new Chooser();
    private speechBubble = new SpeechBubble();
    private background = new Background();
    private imageDisplayer = new ImageDisplayer();
    private audio = new AudioPlayer();
    private project!: FileStructureRead;

    constructor(parentElm: HTMLElement) {
        this.engine = new JaPNaAEngine2d({
            sizing: { width: 1280, height: 720 },
            ticks: { enableDirtySystem: true, fixedTick: false },
            parentElement: parentElm
        });
        this.engine.world.addElm(this.background);
        this.engine.world.addElm(this.imageDisplayer);
        this.engine.world.addElm(this.speechBubble);
        this.engine.world.addElm(this.chooser);
        this.speechBubble.onNextRequested.subscribe(this.onContinue);
    }

    public setProject(project: FileStructureRead) {
        this.project = project;
        this.background.project = project;
        this.imageDisplayer.project = project;
        this.audio.project = project;
    }

    public characterSay(charHTML: string, text: string) {
        this.speechBubble.write(charHTML, text);

        if (this.engine.mouse.rightDown) {
            // skip
            this.speechBubble.showAllChars();
            setTimeout(() => this.onContinue.send(), 50);
        }
    }

    public characterSayAdd(text: string) {
        this.speechBubble.writeAdd(text);

        if (this.engine.mouse.rightDown) {
            // skip
            this.speechBubble.showAllChars();
            setTimeout(() => this.onContinue.send(), 50);
        }
    }

    public showChoices(choices: string[]) {
        this.chooser.showChoices(choices);
    }

    public hideChoices() {
        this.chooser.clear();
    }

    public getChooserChosenEventBus() {
        return this.chooser.onChosen;
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

    public getState() {
        return {
            chooser: this.chooser.getState(),
            speechBubble: this.speechBubble.getState(),
            background: this.background.getState(),
            imageDisplayer: this.imageDisplayer.getState(),
            bgm: this.audio.getState()
        }
    }

    public setState(state: any) {
        this.chooser.setState(state.chooser);
        this.speechBubble.setState(state.speechBubble);
        this.background.setState(state.background);
        this.imageDisplayer.setState(state.imageDisplayer);
        this.audio.setState(state.bgm);
    }

    public async setBackgroundMusic(src: string) {
        await this.audio.setBackgroundMusic(src);
    }

    public setBackgroundMusicSettings(settings: any) {
        if (settings.volume !== undefined) {
            this.audio.setBackgroundVolume(settings.volume);
        }
    }

    public async playSFX(src: string) {
        await this.audio.playSFX(src);
    }

    public setSFXSettings(settings: any) {
        if (settings.volume !== undefined) {
            this.audio.setSFXVolume(settings.volume);
        }
    }

    public dispose() {
        this.background.remove();
        this.imageDisplayer.remove();
        this.audio.dispose();
        this.engine.dispose();
    }
}

class Chooser extends WorldElmWithComponents {
    private elm = new Elm();
    public onChosen = new EventBus<number>();
    public choices?: string[];

    constructor() {
        super();
        const style = this.elm.getHTMLElement().style;
        style.display = "flex";
        style.flexDirection = "column";
        style.flexWrap = "wrap";
        style.margin = "0 auto";
        style.maxHeight = "450px";
        style.textAlign = "center";
        style.columnGap = "32px";
    }

    public _setEngine(engine: JaPNaAEngine2d): void {
        super._setEngine(engine);
        this.engine.htmlOverlay.elm.append(this.elm);
    }

    public showChoices(choices: string[]) {
        const style = this.elm.getHTMLElement().style;
        this.choices = choices;
        if (choices.length <= 4) {
            style.paddingTop = "64px";
            style.rowGap = "16px";
            style.width = "500px";
        } else if (choices.length <= 5) {
            style.paddingTop = "24px";
            style.rowGap = "12px";
            style.width = "500px";
        } else {
            style.paddingTop = "64px";
            style.rowGap = "16px";
            style.width = "1000px";
        }

        let i = 0;
        for (const choice of choices) {
            const cc = new ChooserChoice(choice, i, this);
            this.elm.append(cc);
            i++;
        }
    }

    public clear() {
        this.choices = undefined;
        this.elm.clear();
    }

    public getState() {
        return this.choices && this.choices.slice();
    }

    public setState(choices: string[] | undefined) {
        this.clear();
        if (choices) {
            this.showChoices(choices);
        }
    }

    public remove(): void {
        super.remove();
        this.elm.remove();
    }
}

class ChooserChoice extends Elm {
    constructor(public html: string, public index: number, private parent: Chooser) {
        super();
        this.elm.style.boxSizing = "border-box";
        this.elm.style.maxWidth = "500px";
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
    public project!: FileStructureRead;

    private color: string = "#000";
    private image?: HTMLImageElement;
    private zoom: number = 1;
    private focusX: number = 0;
    private focusY: number = 0;

    private imageLoaded = false;
    private background?: ControlBackground;

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
        this.background = background;
        if (this.image) { URL.revokeObjectURL(this.image.src); }
        if (background.src) {
            this.image = new Image();
            this.image.src = URL.createObjectURL(
                await this.project.getAsset(background.src)
            );
            this.imageLoaded = false;
            this.image.onload = () => {
                this.imageLoaded = true;
                this.engine.ticker.requestTick();
            };
        } else {
            this.image = undefined;
        }

        this.color = background.color ? "#" + background.color : "#fff";
        this.zoom = background.zoom === undefined ? 1 : background.zoom;
        this.focusX = background.x === undefined ? 0.5 : background.x / 100;
        this.focusY = background.y === undefined ? 0.5 : background.y / 100;
    }

    public getState() {
        return this.background;
    }

    public setState(state: any) {
        if (!state) { return this.set({ visualNovelCtrl: "background", color: "#000" }); }
        this.set(state);
    }

    public remove() {
        super.remove();
        if (this.image) { URL.revokeObjectURL(this.image.src); }
    }
}

class ImageDisplayer extends WorldElm {
    public project!: FileStructureRead;

    private image?: HTMLImageElement;
    private zoom: number = 1;
    private focusX: number = 0.5;
    private focusY: number = 0.5;

    private imageLoaded = false;
    private src?: string;

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
        this.src = src;
        if (this.image) { URL.revokeObjectURL(this.image.src); }
        if (src) {
            this.image = new Image();
            this.image.src = URL.createObjectURL(
                await this.project.getAsset(src)
            );
            this.imageLoaded = false;
            this.image.onload = () => {
                this.imageLoaded = true;
                this.engine.ticker.requestTick();
            };
        } else {
            this.image = undefined;
        }

        // this.zoom = background.zoom === undefined ? 1 : background.zoom;
        // this.focusX = background.x === undefined ? 0.5 : background.x / 100;
        // this.focusY = background.y === undefined ? 0.5 : background.y / 100;
    }

    public getState() {
        return this.src;
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
        if (this.image) { URL.revokeObjectURL(this.image.src); }
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

class AudioPlayer {
    public project!: FileStructureRead;

    private backgroundMusic: HTMLAudioElement = new Audio();
    private backgroundMusicSrc: string = "";
    private backgroundVolume = 0.4;
    private sfx: HTMLAudioElement = new Audio();
    private sfxVolume = 0.6;

    constructor() {
        this.backgroundMusic.volume = this.backgroundVolume;
        this.backgroundMusic.loop = true;
        this.sfx.volume = this.sfxVolume;
    }

    public setBackgroundVolume(volume: number) {
        this.backgroundVolume = this.backgroundMusic.volume = volume;
    }

    public setSFXVolume(volume: number) {
        this.sfxVolume = this.sfx.volume = volume;
    }

    public async setBackgroundMusic(src: string) {
        if (this.backgroundMusic.src) {
            URL.revokeObjectURL(this.backgroundMusic.src);
        }
        this.backgroundMusicSrc = src;
        if (src) {
            this.backgroundMusic.src = URL.createObjectURL(
                await this.project.getAsset(src)
            );
            this.backgroundMusic.play();
        } else {
            this.backgroundMusic.pause();
        }
    }

    public async playSFX(src: string) {
        if (this.sfx.src) {
            URL.revokeObjectURL(this.sfx.src);
        }
        if (src) {
            this.sfx.src = URL.createObjectURL(
                await this.project.getAsset(src)
            );
            this.sfx.play();
        } else {
            this.sfx.pause();
        }
    }

    public getState() {
        return {
            backgroundMusic: this.backgroundMusicSrc,
            backgroundVolume: this.backgroundVolume,
            sfxVolume: this.sfxVolume
        };
    }

    public setState(state: any) {
        this.setBackgroundMusic(state.backgroundMusic);
        this.setBackgroundVolume(state.backgroundVolume);
        this.setSFXVolume(state.sfxVolume);
    }

    public dispose() {
        this.sfx.pause();
        this.backgroundMusic.pause();
        if (this.sfx.src) { URL.revokeObjectURL(this.sfx.src); }
        if (this.backgroundMusic.src) { URL.revokeObjectURL(this.backgroundMusic.src); }
    }
}