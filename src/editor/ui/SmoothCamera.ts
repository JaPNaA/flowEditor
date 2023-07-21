import { Rectangle, Vec2, Vec2M, WorldElm } from "../../japnaaEngine2d/JaPNaAEngine2d.js";

export class SmoothCamera extends WorldElm {
    private targetPos?: Vec2;

    constructor() {
        super();
    }

    public tick() {
        if (!this.targetPos) { return; }
        this.engine.camera.goto(
            new Vec2M(this.engine.camera.rect.x, this.engine.camera.rect.y)
                .lerp(0.3, this.targetPos)
        );
        this.engine.ticker.requestTick();

        if (new Vec2M(this.engine.camera.rect.x - this.targetPos.x, this.engine.camera.rect.y - this.targetPos.y).getLength() < 1) {
            this.targetPos = undefined;
        }
    }

    public moveToCenterOn(rect: Rectangle) {
        this.targetPos = new Vec2M(rect.centerX(), rect.centerY())
            .translate(
                new Vec2M(-this.engine.camera.rect.width / 2, -this.engine.camera.rect.height / 2)
            );
    }
}
