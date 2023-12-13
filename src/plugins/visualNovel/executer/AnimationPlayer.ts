import { Vec2, Vec2M, WorldElm } from "../../../japnaaEngine2d/JaPNaAEngine2d";
import { ControlAnimate, VisualNovelAnimationEvent } from "../controls";
import { BezierEasingCurve } from "./BezierEasingCurve";
import { VNGraphic } from "./GraphicDisplayer";

export class AnimationPlayer extends WorldElm {
    private animations: Animation[] = [];

    constructor() { super(); }

    public addAnimation(graphic: VNGraphic, control: ControlAnimate) {
        this.animations.push(new Animation(graphic, control));
        this.engine.ticker.requestTick();
    }

    public tick() {
        const milliseconds = this.engine.ticker.timeElapsed;
        for (const animation of this.animations) {
            animation.step(milliseconds);
        }
        for (let i = this.animations.length - 1; i >= 0; i--) {
            if (this.animations[i].done) {
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
    private loopedTimes = 0;
    private nextEventIndex = 0;

    constructor(private graphic: VNGraphic, control: ControlAnimate) {
        this.length = control.length;
        this.loop = control.loop;
        this.events = control.events;
        this.easing = control.easing && new BezierEasingCurve(control.easing);
        this.events = control.events;
    }

    public step(deltaTime: number) {
        this.realTime += deltaTime;
        if (this.length > 0) {
            const loops = Math.floor(this.realTime / this.length);
            this.adjustedTime = this.realTime % this.length;
            if (loops > this.loopedTimes) {
                this.loopedTimes = loops;
                this.nextEventIndex = 0;
                this.activeEvents.length = 0;
            }
            if (typeof this.loop === "number") {
                if (loops >= this.loop) {
                    this.done = true;
                }
            } else {
                if (this.loop !== true && loops >= 1) {
                    this.done = true;
                }
            }
        } else {
            this.done = true;
        }
        if (this.done) {
            this.adjustedTime = this.length;
        }
        if (this.length > 0) {
            this.adjustedTime = this.easing ? this.easing.at(this.adjustedTime / this.length) * this.length : this.adjustedTime;
        } else {
            this.adjustedTime = 0;
        }

        let i;
        for (i = this.nextEventIndex; i < this.events.length; i++) {
            const [startTime, event] = this.events[i];
            if (startTime <= this.adjustedTime) {
                this.activateEvent(startTime, event);
            } else {
                break;
            }
        }
        this.nextEventIndex = i;

        for (let i = 0; i < this.activeEvents.length; i++) {
            const event = this.activeEvents[i];
            const endTime = event.start + event.length;
            if (this.adjustedTime >= endTime) {
                event.animater.setAt(this.graphic, 1);
                this.activeEvents.splice(i, 1);
                i--;
            } else {
                const progress = (this.adjustedTime - event.start) / event.length;
                event.animater.setAt(
                    this.graphic,
                    event.easing ? event.easing.at(progress) : progress
                );
            }
        }
    }

    private activateEvent(startTime: number, event: VisualNovelAnimationEvent) {
        const activeEventBase = {
            start: startTime,
            length: event.length === undefined ? this.length - startTime : event.length,
            easing: event.easing && new BezierEasingCurve(event.easing)
        };
        switch (event.key) {
            case "pos":
                this.activeEvents.push({
                    ...activeEventBase,
                    animater: new PositionAnimater(
                        event.from ?
                            new Vec2M(event.from[0], event.from[1]).scale(0.01) :
                            this.graphic.position.clone(),
                        new Vec2M(event.to[0], event.to[1]).scale(0.01)
                    )
                });
                break;
            case "posAnchor":
                this.activeEvents.push({
                    ...activeEventBase,
                    animater: new PositionAnchorAnimater(
                        event.from ?
                            new Vec2M(event.from[0], event.from[1]).scale(0.01) :
                            this.graphic.positionAnchor ?
                                this.graphic.positionAnchor.clone() :
                                this.graphic.position.clone(),
                        new Vec2M(event.to[0], event.to[1]).scale(0.01)
                    )
                });
                break;
            case "transformAnchor":
                this.activeEvents.push({
                    ...activeEventBase,
                    animater: new TransformAnchorAnimater(
                        event.from ?
                            new Vec2M(event.from[0], event.from[1]).scale(0.01) :
                            this.graphic.transformAnchor ?
                                this.graphic.transformAnchor.clone() :
                                this.graphic.positionAnchor ?
                                    this.graphic.positionAnchor.clone() :
                                    this.graphic.position.clone(),
                        new Vec2M(event.to[0], event.to[1]).scale(0.01)
                    )
                });
                break;
            case "scale":
                this.activeEvents.push({
                    ...activeEventBase,
                    animater: new ScaleAnimater(
                        event.from ? { base: "fit", scale: 1, ...event.from } :
                            { base: this.graphic.scaleBase, scale: this.graphic.scale },
                        { base: "fit", scale: 1, ...event.to }
                    )
                });
                break;
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
        graphic.position.copy(this.from.clone().lerp(progress, this.to));
    }
}

class PositionAnchorAnimater implements Animater {
    constructor(private from: Vec2, private to: Vec2) { }

    public setAt(graphic: VNGraphic, progress: number): void {
        if (!graphic.positionAnchor) {
            graphic.positionAnchor = this.from.clone();
        }
        graphic.positionAnchor.copy(this.from.clone().lerp(progress, this.to));
    }
}

class TransformAnchorAnimater implements Animater {
    constructor(private from: Vec2, private to: Vec2) { }

    public setAt(graphic: VNGraphic, progress: number): void {
        if (!graphic.transformAnchor) {
            graphic.transformAnchor = this.from.clone();
        }
        graphic.transformAnchor.copy(this.from.clone().lerp(progress, this.to));
    }
}

interface ScaleSettings {
    base: "fit" | "cover";
    scale: number;
}

class ScaleAnimater implements Animater {
    constructor(private from: ScaleSettings, private to: ScaleSettings) { }

    public setAt(graphic: VNGraphic, progress: number): void {
        if (progress < 1) {
            graphic.scaleBase = "fit";
            const fitScaleFrom = this.from.base === "fit" ?
                this.from.scale : this.from.scale * graphic.getFitToCoverFactor();
            const fitScaleTo = this.to.base === "fit" ?
                this.to.scale : this.to.scale * graphic.getFitToCoverFactor();

            graphic.scale = fitScaleFrom ** (1 - progress) * fitScaleTo ** progress;
        } else {
            graphic.scaleBase = this.to.base;
            graphic.scale = this.to.scale;
        }
    }
}