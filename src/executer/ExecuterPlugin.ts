export interface PluginHooks {
    getExecutionStates(): { [x: string]: any };
    setExecutionStates(states: { [x: string]: any }): void;
    stopExecution(): void;
    startExecution(): void;
    runInstruction(instruction: any): boolean;
}