import { ControlItem, FlowData, isControlItem } from "../../../FlowRunner.js";

export interface InstructionData {
    x: number;
    y: number;
    instructions: any[];
    branches: BranchInstructionData[];
}

export interface BranchInstructionData {
    instruction: ControlItem;
    targets?: (InstructionData | undefined)[];
}

export function constructInstructionData(flowData: FlowData): InstructionData[] {
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
    const groups: InstructionData[] = [];
    const indexToGroupMap = new Map<number, InstructionData>();
    const jumpChildrenParentMap = new Map<number, BranchInstructionData[]>();
    let currGroup: InstructionData = newInstructionData();
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
            currGroup.instructions.push(instruction.instruction);
            lastInstructionWasGroupEnd = false;
            if (isControlItem(instruction.instruction) && instruction.instruction.ctrl === "end") {
                lastInstructionWasGroupEnd = true;
                endGroup(i + 1);
            }
        } else if (instruction.parents.length === 0 && isControlItem(instruction.instruction)) {
            // branch or jump
            const branchInstructionData = {
                instruction: instruction.instruction,
                target: undefined
            };
            currGroup.branches.push(branchInstructionData);

            const existing = jumpChildrenParentMap.get(instruction.child!);
            if (existing) {
                existing.push(branchInstructionData);
            } else {
                jumpChildrenParentMap.set(instruction.child!, [branchInstructionData])
            }

            lastInstructionWasGroupEnd = false;
            if (instruction.instruction.ctrl === "jump") {
                lastInstructionWasGroupEnd = true;
                endGroup(i + 1);
            }
        } else {
            endGroup(i);

            // add jump instruction so the destination is editable
            if (!lastInstructionWasGroupEnd) {
                const lastGroup = groups[groups.length - 1];

                lastGroup.branches.push({
                    instruction: { ctrl: "jump", offset: 1 },
                    targets: [currGroup]
                });
            }

            currGroup.instructions.push(instruction.instruction);
            lastInstructionWasGroupEnd = false;
        }
    }

    endGroup(i);

    // link groups
    for (const [index, parents] of jumpChildrenParentMap) {
        if (parents) {
            for (const parent of parents) {
                parent.targets = [indexToGroupMap.get(index)];
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

export function newInstructionData(): InstructionData {
    return {
        branches: [],
        instructions: [],
        x: 8,
        y: 0
    }
}
