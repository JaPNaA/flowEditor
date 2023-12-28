import { Executer } from "../../../executer/Executer";
import { FileStructureRead } from "../../../filesystem/FileStructure";
import { EventBus, JaPNaAEngine2d } from "../../../japnaaEngine2d/JaPNaAEngine2d";
import { ControlAnimate, ControlGraphic, ControlHide, ControlShow, ControlSpeechBubbleSettings, ControlText } from "../controls";
import { AnimationPlayer } from "./AnimationPlayer";
import { AudioPlayer } from "./AudioPlayer";
import { Chooser } from "./Chooser";
import { GraphicDisplayer, VNGraphic } from "./GraphicDisplayer";

type VNArrangement = undefined;

export class VisualNovelGame {
    public onContinue = new EventBus<MouseEvent>();
    private engine: JaPNaAEngine2d;

    private graphicDisplayer = new GraphicDisplayer(this);
    private animationPlayer = new AnimationPlayer();
    private chooser = new Chooser();
    private audio = new AudioPlayer();
    private project!: FileStructureRead;

    public strings: (string | undefined)[] = [undefined];
    public graphics: (VNGraphic | undefined)[] = [undefined];
    public arrangements: (VNArrangement | undefined)[] = [undefined];
    public speechBubbleGraphicId?: number;

    constructor(parentElm: HTMLElement, private executer: Executer) {
        this.engine = new JaPNaAEngine2d({
            sizing: { width: 1280, height: 720 },
            ticks: { enableDirtySystem: true, fixedTick: false },
            parentElement: parentElm
        });
        this.engine.world.addElm(this.graphicDisplayer);
        this.engine.world.addElm(this.chooser);
        this.engine.world.addElm(this.animationPlayer);
        this.engine.mouse.onMousedown.subscribe(this.onContinue);
    }

    public setProject(project: FileStructureRead) {
        this.project = project;
        // this.background.project = project;
        this.graphicDisplayer.project = project;
        this.audio.project = project;
    }

    public playAnimation(control: ControlAnimate) {
        this.animationPlayer.addAnimation(this.graphicDisplayer.getGraphic(control.id), control);
    }

    public characterSay(charHTML: string, text: string) {
        if (!this.speechBubbleGraphicId) { throw new Error("No speech bubble set"); }
        const graphic = this.graphics[this.speechBubbleGraphicId];
        if (!graphic) { throw new Error("Speech bubble graphic doesn't exist"); }
        return this.graphicDisplayer.say(graphic, charHTML, text);
        // this.speechBubble.write(charHTML, text);

        // if (this.engine.mouse.rightDown) {
        //     // skip
        //     this.speechBubble.showAllChars();
        //     setTimeout(() => this.onContinue.send(), 50);
        // }
    }

    public characterSayAdd(text: string) {
        // this.speechBubble.writeAdd(text);

        // if (this.engine.mouse.rightDown) {
        //     // skip
        //     this.speechBubble.showAllChars();
        //     setTimeout(() => this.onContinue.send(), 50);
        // }
    }

    public setChoices(choices: number[]) {
        this.chooser.showChoices(choices.map(i => this.graphics[i]));
    }

    public unsetChoices() {
        this.chooser.clear();
    }

    public getChooserChosenEventBus() {
        return this.chooser.onChosen;
    }

    public graphic(graphic: ControlGraphic) {
        return this.graphicDisplayer.graphic(graphic);
    }

    public show(graphic: ControlShow) {
        const graphicObj = this.graphics[graphic.id];
        if (graphicObj) {
            return this.graphicDisplayer.showGraphic(graphicObj);
        }
    }

    public hide(graphic: ControlHide) {
        const graphicObj = this.graphics[graphic.id];
        if (graphicObj) {
            return this.graphicDisplayer.hideGraphic(graphicObj);
        }
    }

    public text(text: ControlText) {
        return this.graphicDisplayer.text(text);
    }

    public setSpeechBubbleSettings(settings: ControlSpeechBubbleSettings) {
        if (settings.id !== undefined) {
            this.speechBubbleGraphicId = settings.id;
        }
        // if (settings.visible !== undefined) {
        //     this.speechBubble.setVisible(settings.visible);
        // }
        // if (settings.positionX !== undefined) { }
        // if (settings.positionY !== undefined) {
        //     this.speechBubble.setPositionY(settings.positionY);
        // }
        // if (settings.width !== undefined) { }
        // if (settings.height !== undefined) { }
        // if (settings.revealSpeed !== undefined) {
        //     this.speechBubble.setSpeed(settings.revealSpeed);
        // }
        // if (settings.advanceType) { }
        // if (settings.autoAdvanceDelay) { }
        // if (settings.style) { }
        // if (settings.tagStyles) { }
    }

    public getState() {
        return {
            // chooser: this.chooser.getState(),
            // speechBubble: this.speechBubble.getState(),
            // background: this.background.getState(),
            // imageDisplayer: this.graphicDisplayer.getState(),
            // bgm: this.audio.getState()
        }
    }

    public setState(state: any) {
        // this.chooser.setState(state.chooser);
        // this.speechBubble.setState(state.speechBubble);
        // this.background.setState(state.background);
        // this.graphicDisplayer.setState(state.imageDisplayer);
        // this.audio.setState(state.bgm);
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
        // this.background.remove();
        this.chooser.remove();
        this.graphicDisplayer.remove();
        this.audio.dispose();
        this.engine.dispose();
    }

    /** Function used to map flow variable to string */
    private getVariable(str: string): string | undefined {
        const pointer = this.executer.getVariable(str);
        if (pointer === undefined) { return; }
        return this.strings[pointer - 1] === undefined ?
            pointer.toString() : this.strings[pointer - 1];
    }
}
