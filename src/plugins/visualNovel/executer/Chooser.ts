import { WorldElmWithComponents, EventBus, JaPNaAEngine2d, Hitbox, Collidable, RectangleM } from "../../../japnaaEngine2d/JaPNaAEngine2d";
import { VNGraphic } from "./GraphicDisplayer";

export class Chooser extends WorldElmWithComponents {
    public onChosen = new EventBus<number>();
    public hitboxes: Hitbox<ChoiceCollidable>[] = [];

    constructor() {
        super();

        this.mousedownHandler = this.mousedownHandler.bind(this);
    }

    public _setEngine(engine: JaPNaAEngine2d): void {
        super._setEngine(engine);

        engine.mouse.onMousedown.subscribe(this.mousedownHandler);
    }

    public showChoices(choices: (VNGraphic | undefined)[]) {
        for (let i = 0; i < choices.length; i++) {
            const choice = choices[i];
            if (!choice) { console.warn("Graphic doesn't exist"); continue; }
            const hitbox = new Hitbox(choice.rect, new ChoiceCollidable(i));
            this.hitboxes.push(hitbox);
            this.engine.collisions.addHitbox(hitbox);
        }
    }

    public clear() {
        for (const hitbox of this.hitboxes) {
            this.engine.collisions.removeHitbox(hitbox);
        }
        this.hitboxes.length = 0;
    }

    public mousedownHandler() {
        const rect = new RectangleM(this.engine.mouse.worldPos.x, this.engine.mouse.worldPos.y, 1, 1);
        const collisions = this.engine.collisions.getCollisionsWith(rect);
        console.log("mousedown");
        for (const collision of collisions) {
            if (collision.elm instanceof ChoiceCollidable) {
                this.onChosen.send(collision.elm.index);
            }
        }
        this.engine.mouse.onMousedown.stopPropagation();
    }

    public getState() {
        return {}; // todo
        // return this.choices && this.choices.slice();
    }

    public setState(choices: string[] | undefined) {
        // todo
        // this.clear();
        // if (choices) {
        //     this.showChoices(choices);
        // }
    }
}

class ChoiceCollidable implements Collidable {
    static collisionType = Symbol();
    public collisionType: symbol = ChoiceCollidable.collisionType;

    constructor(public index: number) { }

    public onCollision(other: Collidable): void {
        console.log("collision");
    }
}