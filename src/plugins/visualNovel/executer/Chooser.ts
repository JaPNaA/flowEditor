import { WorldElmWithComponents, EventBus, JaPNaAEngine2d } from "../../../japnaaEngine2d/JaPNaAEngine2d";
import { Elm } from "../../../japnaaEngine2d/elements";

export class Chooser extends WorldElmWithComponents {
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
