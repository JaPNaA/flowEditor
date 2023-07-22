export class FlowRunner {
    private instructionPointer = 0;

    private active = true;
    private variables: Map<string, number> = new Map();
    private output: FlowRunnerOutput | null = null;

    constructor(private data: FlowData) { }

    /** Get the instruction pointer's location */
    public getIndex() {
        return this.instructionPointer;
    }

    /** Set the instruction pointer's location */
    public setIndex(index: number) {
        this.instructionPointer = index;
        this.active = true;
    }

    /** Get a variable's value */
    public getVariable(key: string): number | undefined {
        return this.variables.get(key);
    }

    /** Sets a variable's value */
    public setVariable(key: string, value: number) {
        this.variables.set(key, value);
    }

    /** Get the state of the flow runner. Used for restoration later. */
    public getState(): FlowRunnerState {
        const obj: { [x: string]: number } = {};
        for (const [key, value] of this.variables) {
            obj[key] = value;
        }
        return {
            instructionPtr: this.instructionPointer,
            variables: obj
        };
    }

    /** Restore the state of the flow runner. */
    public setState(state: FlowRunnerState) {
        const keys = Object.keys(state.variables);
        this.variables.clear();
        for (const key of keys) {
            this.variables.set(key, state.variables[key]);
        }
        this.instructionPointer = state.instructionPtr;
    }

    /** Gets the output of the flow runner */
    public getOutput(): FlowRunnerOutput | null {
        return this.output;
    }

    /** If active, the flow runner has not reached the end. */
    public isActive() {
        return this.active;
    }

    /** If at an input instruction, inputs into the flowRunner. */
    public input(choice: number) {
        const item = this.data.flow[this.instructionPointer];
        if (!isControlItem(item) || item.ctrl !== "input") {
            throw new Error("Cannot input choice at non-choice instruction");
        }
        this.variables.set(item.variable, choice);
        this.instructionPointer++;
    }

    public runOne() {
        const item = this.data.flow[this.instructionPointer];
        this.output = null;

        if (isControlItem(item)) {
            this.handleControl(item);
        } else {
            this.output = {
                type: "default",
                data: item
            };
            this.instructionPointer++;
        }
    }

    private handleControl(item: ControlItem) {
        switch (item.ctrl) {
            case "input":
                this.output = { type: "input", choices: item.options };
                break;
            case "jump":
                this.instructionPointer += item.offset;
                break;
            case "end":
                this.active = false;
                this.output = { type: "end" };
                break;
            case "variable":
                switch (item.op) {
                    case "=":
                        this.variables.set(item.v1, this.resolveVariable(item.v2));
                        break;
                    case "+":
                        this.variables.set(item.v1, this.resolveVariable(item.v1) + this.resolveVariable(item.v2));
                        break;
                    case "*":
                        this.variables.set(item.v1, this.resolveVariable(item.v1) * this.resolveVariable(item.v2));
                        break;
                }
                this.instructionPointer++;
                break;
            case "branch":
                let v1 = this.resolveVariable(item.v1);
                let v2 = this.resolveVariable(item.v2);
                let takeBranch = false;
                switch (item.op) {
                    case "=": takeBranch = v1 == v2; break;
                    case "<": takeBranch = v1 < v2; break;
                    case "<=": takeBranch = v1 <= v2; break;
                }
                if (takeBranch) {
                    this.instructionPointer += item.offset;
                } else {
                    this.instructionPointer++;
                }
                break;
            case "nop":
                this.instructionPointer++;
                break;
        }
    }

    private resolveVariable(v: string | number) {
        if (typeof v === "number") {
            return v;
        } else {
            return this.variables.get(v) || 0;
        }
    }
}

export interface FlowRunnerState {
    instructionPtr: number;
    variables: { [x: string]: number };
}

export type FlowRunnerOutput = FlowRunnerOutputDefault | FlowRunnerOutputChoice | FlowRunnerOutputEnd;

interface FlowRunnerOutputDefault {
    type: "default";
    data: any;
}

interface FlowRunnerOutputChoice {
    type: "input";
    choices: any[];
}

interface FlowRunnerOutputEnd {
    type: "end";
}

// Flow data
export class FlowRunException extends Error { };

export interface FlowData {
    meta?: any;
    editorData?: any;
    flow: (ControlItem | any)[];
}

export type ControlItem = ControlBranch | ControlInput | ControlJump | ControlEnd | ControlVariable | ControlNop;
export function isControlItem(item: any): item is ControlItem {
    return typeof item.ctrl === "string";
}

export interface ControlBranch {
    ctrl: "branch";
    op: "=" | "<" | "<=";
    v1: string | number;
    v2: string | number;
    offset: number;
}

export interface ControlInput {
    ctrl: "input";
    options: any[];
    variable: string;
}

export interface ControlJump {
    ctrl: "jump";
    offset: number;
}

export interface ControlEnd {
    ctrl: "end";
}

export interface ControlVariable {
    ctrl: "variable";
    op: "=" | "+" | "*";
    v1: string;
    v2: string | number;
}

export interface ControlNop {
    ctrl: "nop";
}
