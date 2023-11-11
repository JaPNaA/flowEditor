import { FlowData, isControlItem } from "../../../FlowRunner";
import { InstructionElmData } from "../EditorSaveData";

export function constructInstructionData(flowData: FlowData): InstructionElmData[] {
    // find all to/froms of instructions
    const instructions: GraphInstructionNode[] = [];

    const jumpers: [number, number][] = [];

    for (let i = 0; i < flowData.flow.length; i++) {
        const instruction = flowData.flow[i];

        const obj: GraphInstructionNode = {
            child: undefined,
            parents: [],
            instruction: instruction
        };
        if (isControlItem(instruction)) {
            switch (instruction.ctrl) {
                case "branch":
                case "jump":
                    jumpers.push([
                        i, i + instruction.offset
                    ]);
                    obj.child = i + instruction.offset;
                    break;
            }
        }
        instructions.push(obj);
    }

    for (const [from, destination] of jumpers) {
        instructions[destination].parents.push(from);
    }

    // group instructions, separated by in/out-going
    let y = 24;
    const groups: InstructionElmData[] = [];
    const indexToGroupMap = new Map<number, InstructionElmData>();
    // A map from child instruction index to [branch index in instruction elm, instruction elm]
    const jumpChildrenParentMap = new Map<number, [number, InstructionElmData][]>();
    let currGroup: InstructionElmData = newInstructionData();
    currGroup.y = y;
    indexToGroupMap.set(0, currGroup);

    function endGroup(nextGroupStartIndex: number) {
        if (currGroup.instructions.length === 0 && currGroup.branches.length === 0) { return; }
        groups.push(currGroup);
        // 25: line height; +1: extra goto; +16: padding; 32: margin
        y += 25 * (currGroup.instructions.length + currGroup.branches.length + 1) + 16 + 32;
        currGroup = newInstructionData();
        currGroup.y = y;
        indexToGroupMap.set(nextGroupStartIndex, currGroup);
    }

    let lastInstructionWasGroupEnd = false;
    let i;
    for (i = 0; i < instructions.length; i++) {
        const instruction = instructions[i];

        if (instruction.child === undefined && instruction.parents.length === 0 && currGroup.branches.length === 0) {
            // normal instruction
            currGroup.instructions.push(instruction.instruction);
            lastInstructionWasGroupEnd = false;
            if (isControlItem(instruction.instruction) && instruction.instruction.ctrl === "end") {
                lastInstructionWasGroupEnd = true;
                endGroup(i + 1);
            }
        } else if (instruction.parents.length === 0 && isControlItem(instruction.instruction)) {
            // branch or jump
            const branchIndex = currGroup.children.length;
            currGroup.branches.push(instruction.instruction);
            currGroup.children.push([]);

            const existing = jumpChildrenParentMap.get(instruction.child!);
            if (existing) {
                existing.push([branchIndex, currGroup]);
            } else {
                jumpChildrenParentMap.set(instruction.child!, [[branchIndex, currGroup]]);
            }

            lastInstructionWasGroupEnd = false;
            if (instruction.instruction.ctrl === "jump") {
                lastInstructionWasGroupEnd = true;
                endGroup(i + 1);
            }
        } else {
            // start of new group
            endGroup(i);

            // add jump instruction so the destination is editable
            if (!lastInstructionWasGroupEnd) {
                const lastGroup = groups[groups.length - 1];

                lastGroup.branches.push({ ctrl: "jump", offset: 1 });
                lastGroup.children.push([groups.length]);
            }

            if (instruction.child === undefined) {
                currGroup.instructions.push(instruction.instruction);
                lastInstructionWasGroupEnd = false;
            } else {
                // case of jump right at start of group
                const branchIndex = currGroup.children.length;
                currGroup.branches.push(instruction.instruction);
                currGroup.children.push([]);

                const existing = jumpChildrenParentMap.get(instruction.child!);
                if (existing) {
                    existing.push([branchIndex, currGroup]);
                } else {
                    jumpChildrenParentMap.set(instruction.child!, [[branchIndex, currGroup]])
                }
                if (instruction.instruction.ctrl === "jump") {
                    lastInstructionWasGroupEnd = true;
                } else {
                    lastInstructionWasGroupEnd = false;
                }
            }
        }
    }

    endGroup(i);

    // set group ids
    for (let i = 0; i < groups.length; i++) {
        groups[i].id = i;
    }

    // link groups
    for (const [childInstructionIndex, parents] of jumpChildrenParentMap) {
        if (parents) {
            for (const [branchIndex, parent] of parents) {
                parent.children[branchIndex] = [indexToGroupMap.get(childInstructionIndex)!.id];
            }
        }
    }

    return groups;
}

interface GraphInstructionNode {
    parents: number[];
    child?: number;
    instruction: any;
}

export function newInstructionData(): InstructionElmData {
    return {
        id: -1,
        branches: [],
        instructions: [],
        children: [],
        x: 8,
        y: 0
    };
}
