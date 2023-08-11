import { PluginExecuter } from "../../editor/EditorPlugin";
import { Executer } from "../../executer/Executer";
import { Elm } from "../../japnaaEngine2d/elements";
import { isVisualNovelControlItem } from "./controls";
import { VisualNovelGame } from "./executer/VisualNovelGame";
import { visualNovelExecuterCSS } from "./visualNovelExecuterCSS";
import { replaceVariables, visualNovelMdToHTML } from "./visualNovelMd";

export class VisualNovelExecuter implements PluginExecuter {
    private elm = new Elm().class("visualNovelExecuter")
        .attribute("tabindex", "0")
        .append(new Elm("style").withSelf(s => {
            s.getHTMLElement().innerHTML = visualNovelExecuterCSS;
        }));
    private game?: VisualNovelGame;
    private waitTimeout?: number;
    private executer!: Executer;

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

        // this.getVariable = this.getVariable.bind(this);
    }

    public start(executer: Executer): Promise<void> {
        this.executer = executer;
        this.executer.addOutputDisplay(this.elm);
        this.game = new VisualNovelGame(this.elm.getHTMLElement(), executer);
        this.game.setProject(executer.files);
        this.game.getChooserChosenEventBus()
            .subscribe(choice => this.executer.input(choice));
        this.game.onContinue.subscribe(() => this.executer.resume());

        return Promise.resolve();
    }

    public run(data: any): boolean {
        if (!this.game) { throw new Error("Game not started"); }
        if (!isVisualNovelControlItem(data)) { return false; }

        switch (data.visualNovelCtrl) {
            // case "say":
            //     this.executer.log.log(`${data.char}: "${data.text}"`);
            //     this.game.characterSay(
            //         visualNovelMdToHTML(data.char, this.getVariable),
            //         visualNovelMdToHTML(data.text, this.getVariable)
            //     );
            //     this.executer.pause();
            //     return true;
            // case "say-add":
            //     this.executer.log.log('"' + data.text + '"');
            //     this.game.characterSayAdd(visualNovelMdToHTML(data.text, this.getVariable));
            //     this.executer.pause();
            //     return true;
            case "graphic":
                this.executer.log.log(`Graphic ${JSON.stringify(data)}`);
                this.game.graphic(data);
                return true;
            // case "choose":
            //     if (data.options) {
            //         this.game.showChoices(data.options.map(v => visualNovelMdToHTML(v, this.getVariable)));
            //     } else {
            //         this.game.hideChoices();
            //     }
            //     return true;
            case "speechBubbleSettings":
                this.game.setSpeechBubbleSettings(data);
                return true;
            case "wait":
                this.executer.pause();
                this.waitTimeout = window.setTimeout(() => this.executer.resume(), data.time);
                return true;
            // case "bgm":
            //     this.game.setBackgroundMusic(replaceVariables(data.src, this.getVariable));
            //     this.executer.log.logSecondary("Set background music: " + data.src);
            //     return true;
            case "bgmSettings":
                this.game.setBackgroundMusicSettings(data);
                return true;
            // case "sfx":
            //     this.game.playSFX(replaceVariables(data.src, this.getVariable));
            //     return true;
            case "sfxSettings":
                this.game.setSFXSettings(data);
                return true;
            // case "strset":
            //     this.executer.writeVariable(data.v, this.stringVariables.push(data.str));
            //     return true;
            default:
                return false;
        }
    }

    public stop(): Promise<void> {
        this.game?.dispose();
        if (this.waitTimeout) {
            window.clearTimeout(this.waitTimeout);
        }
        return Promise.resolve();
    }

    public getState() {
        return this.game?.getState();
    }

    public setState(state: any): void {
        this.game?.setState(state.game);
    }
}
