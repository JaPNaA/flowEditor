import { Vec2, Vec2M, WorldElm } from "../../../japnaaEngine2d/JaPNaAEngine2d";
import { ControlAnimate, VisualNovelAnimationEvent } from "../controls";
import { BezierEasingCurve } from "./BezierEasingCurve";
import { VNGraphic } from "./GraphicDisplayer";

export class AnimationPlayer extends WorldElm {
    private animations: Animation[] = [];

    constructor() { super(); }

    public addAnimation(graphic: VNGraphic, control: ControlAnimate) {
        this.animations.push(new Animation(graphic, control));
        console.log("add", control);
        this.engine.ticker.requestTick();
    }

    public tick() {
        const milliseconds = this.engine.ticker.timeElapsed;
        for (const animation of this.animations) {
            animation.step(milliseconds);
        }
        for (let i = this.animations.length - 1; i >= 0; i--) {
            if (this.animations[i].done) {
                console.log("done", this.animations[i]);
                this.animations.splice(i, 1);
            }
        }

        if (this.animations.length > 0) {
            this.engine.ticker.requestTick();
        }
    }
}

class Animation {
    public done = false;

    private length: number;
    private loop?: number | boolean;
    private events: [number, VisualNovelAnimationEvent][];
    /** Default easing: linear */
    private easing?: BezierEasingCurve;

    /** [startTime, length, Animater] */
    private activeEvents: {
        start: number,
        length: number,
        easing?: BezierEasingCurve,
        animater: Animater
    }[] = [];
    private realTime = 0;
    private adjustedTime = 0;
    private nextEventIndex = 0;

    constructor(private graphic: VNGraphic, private control: ControlAnimate) {
        this.length = control.length;
        this.loop = control.loop;
        this.events = control.events;
        this.easing = control.easing && new BezierEasingCurve(control.easing);
        this.events = control.events;
    }

    public step(deltaTime: number) {
        this.realTime += deltaTime;
        if (this.realTime > this.length) {
            this.done = true;
            this.realTime = this.length;
        }
        this.adjustedTime = this.easing ? this.easing.at(this.realTime / this.length) * this.length : this.realTime

        let i;
        for (i = this.nextEventIndex; i < this.events.length; i++) {
            const [startTime, event] = this.events[i];
            if (startTime < this.adjustedTime) {
                switch (event.key) {
                    case "pos":
                        this.activeEvents.push({
                            start: startTime,
                            length: event.length === undefined ? this.length - startTime : event.length,
                            easing: event.easing && new BezierEasingCurve(event.easing),
                            animater: new PositionAnimater(
                                event.from ?
                                    new Vec2M(event.from[0], event.from[1]) :
                                    this.graphic.position.clone(),
                                new Vec2M(event.to[0], event.to[1])
                            )
                        });
                        break;
                }
            } else {
                break;
            }
        }
        this.nextEventIndex = i;

        for (let i = this.activeEvents.length - 1; i >= 0; i--) {
            const event = this.activeEvents[i];
            const endTime = event.start + event.length;
            if (this.adjustedTime >= endTime) {
                event.animater.setAt(this.graphic, 1);
                this.activeEvents.splice(i, 1);
            } else {
                const progress = (this.adjustedTime - event.start) / event.length;
                event.animater.setAt(
                    this.graphic,
                    event.easing ? event.easing.at(progress) : progress
                );
            }
        }
    }
}

interface Animater {
    /**
     * Update the graphic at progress
     * @param graphic the graphic to update
     * @param progress number 0 to 1
     */
    setAt(graphic: VNGraphic, progress: number): void;
}

class PositionAnimater implements Animater {
    constructor(private from: Vec2, private to: Vec2) { }

    public setAt(graphic: VNGraphic, progress: number): void {
        graphic.position.copy(this.from.clone().lerp(progress, this.to).scale(0.01));
        console.log(this.from, this.to, progress, this.from.clone().lerp(progress, this.to));
    }
}