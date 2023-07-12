export type VisualNovelControlItem = ControlBackground | ControlDisplay | ControlSay | ControlChoose;

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

export interface ControlDisplay {
    visualNovelCtrl: "display";
    text: string;
}

export interface ControlSay {
    visualNovelCtrl: "say";
    char: string;
    text: string;
}

export interface ControlChoose {
    visualNovelCtrl: "choose";
    options: string[];
}