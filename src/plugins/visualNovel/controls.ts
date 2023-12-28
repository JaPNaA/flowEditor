export type VisualNovelControlItem =
    /** Visuals controls */
    ControlShow | ControlHide |
    // Visual controls -- object generation
    ControlGraphic |
    // Visual controls -- positioning
    ControlArrange | ControlArrangeSettings | ControlAnimate |
    ControlSetParent |

    /** Text controls */
    ControlText | ControlSay | ControlSayAdd |
    ControlSpeechBubbleSettings |
    /** Interactivity controls */
    ControlChoose |
    /** Sound controls */
    ControlBackgroundMusic | ControlSFX |
    ControlBackgroundMusicSettings | ControlSFXSettings |
    /** String controls */
    ControlSetVariableString |
    /** Misc controls */
    ControlWait;

export function isVisualNovelControlItem(item: any): item is VisualNovelControlItem {
    return typeof item.visualNovelCtrl === "string";
}

export interface ControlShow {
    visualNovelCtrl: "show";
    id: number;
}

export interface ControlHide {
    visualNovelCtrl: "hide";
    id: number;
}

export interface ControlGraphic {
    visualNovelCtrl: "graphic";
    id: number;
    /**
     * Points that make up the shape. (One point is made up of two numbers.)
     * If only one point is provided, the shape is a rectangle from (0, 0) to
     * (points[0], points[1]).
     * If two points are provided, the shape is a rectangle from
     * (points[0], points[1]) to (points[2], points[3]).
     * If not provided, but...
     *   - src is provided: the shape is a rectangle from (0, 0) to
     *     (100, 100), cropped to fit the texture (so one of width or
     *     height is 100, and the other is smaller)
     *   - fill is provided: the shape is a square from (0, 0) to
     *     (100, 100)
     *   - nothing is provided: the shape has no points.
     * 
     * Points are percentages relative to the texture. (ex. (100, 100) is 
     * the pixel point at x and y max(textureWidth, textureHeight))
     * If there is no texture, the percentages are relative to the screen.
     * (ex. (100, 100) is the point at x and y max(screenWidth, screenHeight))
     */
    points?: number[];
    /**
     * URL or path of an image to use for the graphic.
     */
    src?: string;
    /**
     * The background color of the graphic.
     * Usually not seen unless the texture is transparent or doesn't cover the
     * entire screen.
     * Default: transparent
     */
    fill?: string;
    /**
     * The border color of the graphic.
     * Default: transparent
     */
    stroke?: string;
    /**
     * The border width of the graphic.
     * Default: 1
     */
    strokeWidth?: number;
    /**
     * If defined, is a shortcut to add a `parent` instruction to parent this
     * graphic to the graphic with id `parent`.
     */
    parent?: number;
}

export interface ControlArrange {
    visualNovelCtrl: "arrange";
    id: number;
    add?: number[];
    remove?: number[];
}

export interface ControlArrangeSettings {
    visualNovelCtrl: "arrangeSettings";
    id: number;
    direction: "horizontal" | "vertical";
    width?: number;
    height?: number;
    margin?: number;
    /**
     * start: place elements at start (left or top)
     * middle (default): place elements centered
     * end: place elements at end (right or bottom)
     */
    alignment?: "start" | "middle" | "end";
    /**
     * minimum: keep elements as close as possible (margin apart)
     * maximum (default): keep elements as far as possible (spanning entire width/height)
     */
    spacing?: "minimum" | "maximum";
    transitionTime?: number;
    transitionEasing?: BezierEasingCurve;
}

export interface ControlAnimate {
    visualNovelCtrl: "animate";
    /** id of graphic */
    id: number;
    length: number;
    /**
     * If number provided: number of times to loop.
     * If true: loop infinitely
     * If false or undefined: don't loop (= 1)
     */
    loop?: number | boolean;
    /**
     * [start time, VisualNovelAnimationEvent][]
     */
    events: [number, VisualNovelAnimationEvent][];
    /** Default easing: linear */
    easing?: BezierEasingCurve;
}

export type VisualNovelAnimationEvent =
    AnimationEventPosition |
    AnimationEventPositionAnchor |
    AnimationEventTransformAnchor |
    AnimationEventRotation |
    AnimationEventScale |
    AnimationEventFilter;

interface BaseVisualNovelAnimationEvent<T> {
    key: string;
    /** Default: matches parent animation length */
    length?: number;
    /** Default: graphic original value, before animation */
    from?: T;
    to: T;
    easing?: BezierEasingCurve;
}

export interface AnimationEventPosition extends BaseVisualNovelAnimationEvent<[number, number]> {
    key: "pos";
}

export interface AnimationEventPositionAnchor extends BaseVisualNovelAnimationEvent<[number, number]> {
    key: "posAnchor";
}

export interface AnimationEventTransformAnchor extends BaseVisualNovelAnimationEvent<[number, number]> {
    key: "transformAnchor";
}

export interface AnimationEventRotation extends BaseVisualNovelAnimationEvent<number> {
    key: "rotation";
}

export interface AnimationEventScale extends BaseVisualNovelAnimationEvent<{
    /**
     * Fit (default) - when scale: 1, the entire graphic fits in the screen.
     * Cover - when scale: 1, the graphic covers the entire screen.
     */
    base?: "fit" | "cover",
    /**
     * Default: 1.
     */
    scale?: number
}> {
    key: "scale";
}

interface AnimationEventFilter extends BaseVisualNovelAnimationEvent<AnimationFilter> {
    key: "filter";
}

export type AnimationFilter =
    AnimationFilterOpacity |
    AnimationFilterHSV |
    AnimationFilterInvert |
    AnimationFilterSepia;

interface AnimationFilterOpacity extends Array<any> {
    0: "opacity";
    1: number;
}

interface AnimationFilterHSV extends Array<any> {
    0: "hsv";
    1: number;
    2: number;
    3: number;
}

interface AnimationFilterInvert extends Array<any> {
    0: "invert";
    1: number;
}

interface AnimationFilterSepia extends Array<any> {
    0: "sepia";
    1: number;
}

interface ControlSetParent {
    visualNovelCtrl: "parent";
    parent: number;
    child: number;
}

/** Write text onto an object */
export interface ControlText {
    visualNovelCtrl: "text";
    /** Formatted text */
    text: string;
    id: number;
}

/** Write text onto the current speech bubble with gradual reveal */
export interface ControlSay {
    visualNovelCtrl: "say";
    char: string;
    /** Formatted text */
    text: string;
}

/** Add text onto the current speech bubble with gradual reveal */
export interface ControlSayAdd {
    visualNovelCtrl: "say-add";
    /** Formatted text */
    text: string;
}

/**
 * ControlChoose shows a select option on the screen. When the user clicks on
 * an option, the flow runner must be on an input instruction and will recieve
 * an input.
 * (ControlChoose does not set variables.)
 */
export interface ControlChoose {
    visualNovelCtrl: "choose";
    /** List of graphics as options. If undefined, means unset choose. */
    options?: number[];
}

export interface ControlSpeechBubbleSettings {
    visualNovelCtrl: "speechBubbleSettings";
    /**
     * Set graphic as the current speech bubble. `say` and `say-add` will write
     * text to this graphic.
     */
    id?: number;
    /** Bubble visible or hidden */
    visible?: boolean;
    /** 0 to 100 -- Bubble position X */
    positionX?: number;
    /** 0 to 100 -- Bubble position Y */
    positionY?: number;
    /** Bubble width */
    width?: number;
    /** Bubble height */
    height?: number;
    /**
     * How fast to reveal the text in the speech bubble in characters per second.
     * Set to 0 for 'immediate'
     */
    revealSpeed?: number;
    /**
     * Capture a click to skip reveal?
     * true: If the text is not fully revealed, a click will reveal all text;
     * false: On click, 'wait' may capture the click and the next instruction will run
     */
    clickSkipReveal?: boolean;
    /**
     * How much of the text must be revealed until moving onto the text instruction.
     * Default: 1.
     */
    block?: number;
    /**
     * CSS styles applying to the speech bubble.
     */
    style?: string;
    /**
     * CSS styles applying to tags inside the speech bubble.
     */
    tagStyles?: { [x: string]: string };
}

export interface ControlWait {
    visualNovelCtrl: "wait";
    /**
     * The amount of time to wait. If `click` is true, a click can cancel the wait.
     * Default: infinity.
     */
    time?: number;
    /**
     * Should be cancelable by click?
     * Default: true
     */
    click?: boolean;
}

export interface ControlBackgroundMusic {
    visualNovelCtrl: "bgm";
    src: string;
}

export interface ControlSFX {
    visualNovelCtrl: "sfx";
    src: string;
}

export interface ControlBackgroundMusicSettings {
    visualNovelCtrl: "bgmSettings";
    volume: number;
}

export interface ControlSFXSettings {
    visualNovelCtrl: "sfxSettings";
    volume: number;
}

export interface ControlSetVariableString {
    visualNovelCtrl: "strset";
    v: string;
    str: string;
}

export interface BezierEasingCurve extends Array<number> {
    /* x1 */
    0: number;
    /* y1 */
    1: number;
    /* x2 */
    2: number;
    /* y2 */
    3: number;
    length: 4;
}