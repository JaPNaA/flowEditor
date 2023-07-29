import { InstructionGroupEditor } from "../../editor/InstructionGroupEditor.js";
import { JaPNaAEngine2d } from "../../japnaaEngine2d/JaPNaAEngine2d.js";
import { PluginRenderer } from "../EditorPlugin.js";

export class VisualNovelRenderer implements PluginRenderer {
    public renderGroup(group: InstructionGroupEditor, engine: JaPNaAEngine2d): void {
        const X = engine.canvas.X;
        X.fillStyle = "#f00";
        X.fillRect(group.rect.x, group.rect.y, 10, 10);
    }
}