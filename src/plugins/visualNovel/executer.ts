import { ExecuterContainer } from "../../executer/ExecuterContainer.js";
import { EventBus, JaPNaAEngine2d, SubscriptionsComponent, WorldElmWithComponents } from "../../japnaaEngine2d/JaPNaAEngine2d.js";
import { Elm } from "../../japnaaEngine2d/elements.js";
import { Executer } from "../EditorPlugin.js";

export class VisualNovelExecuter implements Executer {
    private elm = new Elm().class("visualNovelExecuter").attribute("style", "height: 50vh");
    private game?: VisualNovelGame;

    public start(executerContainer: ExecuterContainer): Promise<void> {
        executerContainer.addOutputDisplay(this.elm);
        this.game = new VisualNovelGame(this.elm.getHTMLElement());

        return Promise.resolve();
    }

    public run(data: any): Promise<void> | null {
        if (!this.game) { return Promise.reject("Game not started"); }

        if (data.visualNovelCtrl === "say") {
            return this.game.characterSay(data.char, data.text);
        } else {
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

    private speechBubble = new SpeechBubble();

    constructor(parentElm: HTMLElement) {
        this.engine = new JaPNaAEngine2d({
            sizing: { width: 1280, height: 720 },
            parentElement: parentElm
        });
        this.engine.world.addElm(this.speechBubble);
    }

    public async characterSay(charName: string, text: string) {
        console.log(charName, text);
        this.speechBubble.write(charName, text);
        await this.speechBubble.onNextRequested.promise();
    }

    public dispose() {
        this.engine.dispose();
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
        this.elm.style.color = "#aaa";
        this.elm.style.backgroundColor = "#0008";
    }

    public write(character: string, text: string) {
        this.replaceContents(
            new Elm().append(character).attribute("style", "font-weight: bold"),
            text
        );
    }
}
