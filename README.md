# Flow Editor

## Flows

A flow is a small program / script encoded in JSON. Designed for character dialogue or scripting game events.

### Specifications

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

## Project organization

All source code is under `src`

In `src`, there are a few items:

  - `editor` is the flow editor program. It depends on everything in `src` (including the `executer` program).
    - entry: `editor/index.ts`
  - `executer` is the flow executing program. It does not depend on `editor`. A version of `executer` is included in executable flow exports.
    - entry: `executer/index.ts`
  - `exporter` is a library depending on `filesystem`
    - to export, will request for compiled `.js` files from `executer` and dependencies
    - entry: `exporter/Exporter.ts`, `new Exporter(project)`
  - `filesystem`, `japnaaEngine2d`, and `FlowRunner.ts` are all standalone shared library files
    - `japnaaEngine2d` is a renamed copy of the `src` directory in [JaPNaA/japnaaEngine2d](https://github.com/JaPNaA/japnaaEngine2d)
  - `plugins` contain plugins that can modify the editor and executer.

<small>Note: executer is _not_ spelt incorrectly -- it's a style choice. Yup.</small>
