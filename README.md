# Flow Editor

A flow is a small program / script encoded in JSON. Designed for character dialogue or scripting game events.

## Specifications

```ts
// This is the root of the JSON file
export interface FlowData {
    // Space for information about the flow
    meta: any;

    // Space to store information useful for editing ('symbols' in an executable)
    editorData: any;

    // These are the 'instructions' in the flow file
    // Anything that is not a control is output
    flow: (ControlItem | any)[];
}

// Controls are objects defined by having a .ctrl string attribute
type ControlItem = ControlBranch | ControlInput | ControlJump | ControlEnd | ControlVariable | ControlNop;
function isControlItem(item: any): item is ControlItem {
    return typeof item.ctrl === "string";
}

interface ControlBranch {
    ctrl: "branch";
    op: "=" | "<" | "<=";
    v1: string | number;
    v2: string | number;
    offset: number;
}

interface ControlInput {
    ctrl: "input";
    options: any[];
    variable: "string";
}

interface ControlJump {
    ctrl: "jump";
    offset: number;
}

interface ControlEnd {
    ctrl: "end";
}

interface ControlVariable {
    ctrl: "variable";
    op: "=" | "+" | "*";
    v1: string;
    v2: string | number;
}

export interface ControlNop {
    ctrl: "nop";
}
```
