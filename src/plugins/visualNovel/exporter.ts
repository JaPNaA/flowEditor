import { Editor } from "../../editor/editor/Editor";
import type { PluginExporter } from "../../editor/EditorPlugin";
import { CreateGraphicInstruction } from "./visualNovel";

export class VisualNovelExporter implements PluginExporter {
    beforeExport(editor: Editor) {
        this.assignIdsToGraphics(editor);
    }

    private assignIdsToGraphics(editor: Editor) {
        const nameToIdMap = new GraphicIDGenerator();

        for (const group of editor.getGroups()) {
            for (const block of group.block.children) {
                if (!block.instruction) { return; }
                if (block.instruction instanceof CreateGraphicInstruction) {

                    block.instruction.graphicId =
                        nameToIdMap.getId(block.instruction.getGraphicName());
                }
            }
        }
    }
}

/**
 * Generates a unique ID for for objects in this instance of the
 * flowEditor.
 * 
 * The same object will return the same ID in subsequent calls.
 */
class GraphicIDGenerator {
    private static readonly FIRST_USER_GRAPHIC_ID = 10;
    private nextId = GraphicIDGenerator.FIRST_USER_GRAPHIC_ID;
    private map = new Map<string, number>();

    getId(stringId: string) {
        const existing = this.map.get(stringId);
        if (existing !== undefined) {
            return existing;
        } else {
            const id = this.nextId++;
            this.map.set(stringId, id);
            return id;
        }
    }
}
