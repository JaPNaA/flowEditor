export type VisualNovelControlItem = ControlBackground | ControlShow | ControlSay | ControlSayAdd | ControlChoose | ControlSpeechBubbleSettings | ControlWait | ControlBackgroundMusic | ControlSetVariableString;

export function isVisualNovelControlItem(item: any): item is VisualNovelControlItem {
    return typeof item.visualNovelCtrl === "string";
}

export interface ControlBackground {
    visualNovelCtrl: "background";
    /**
     * Specify background color with #.
     * Will be ignored by executer.
     * @deprecated
     */
    background?: string;
    /**
     * URL or path of an image to use for the background.
     */
    src?: string;
    /**
     * The background color of the background.
     * Usually not seen unless the background image is transparent or doesn't
     * cover the entire screen.
     * Default: #fff
     */
    color?: string;
    /**
     * How zoomed-in is the background? Default: 1.
     * Values 1 and over are guaranteed to cover the entire screen.
     */
    zoom?: number;
    /** 0 to 100 -- x position of the zoom center? Default: 50 */
    x?: number;
    /** 0 to 100 -- y position of is the zoom center? Default: 50 */
    y?: number;
}

export interface ControlShow {
    visualNovelCtrl: "show";
    src: string;
}

export interface ControlSay {
    visualNovelCtrl: "say";
    char: string;
    text: string;
}

export interface ControlSayAdd {
    visualNovelCtrl: "say-add";
    text: string;
}

export interface ControlChoose {
    visualNovelCtrl: "choose";
    variable: string;
    options: string[];
}

export interface ControlSpeechBubbleSettings {
    visualNovelCtrl: "speechBubbleSettings";
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
     * How a say or say-add command can complete.
     * - manual: the user must click to continue.
     * - auto: finishes `autoAdvanceDelay` after all text is revealed.
     *   The user can click to skip.
     * - auto-only: only finishes `autoAdvanceDelay` after all text is revealed.
     *   The user cannot click to skip.
     */
    advanceType?: "manual" | "auto" | "auto-only";
    /**
     * How long to wait after all text is revealed to progress the dialogue.
     * Only applies for `advanceType` 'auto' and 'auto-only'
     */
    autoAdvanceDelay?: number;
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
    time: number;
}

export interface ControlBackgroundMusic {
    visualNovelCtrl: "bgm";
    src: string;
}

export interface ControlSetVariableString {
    visualNovelCtrl: "strset";
    v: string;
    str: string;
}
