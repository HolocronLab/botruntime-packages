export type CompilationDiagnosticLabel = {
    message: string;
    primary: boolean;
    span: [number, number];
};
export type CompilationDiagnosticNote = {
    message: string;
    note_type: string;
};
export type CompilationDiagnostic = {
    message: string;
    code: number;
    severity: string;
    labels: CompilationDiagnosticLabel[];
    notes: CompilationDiagnosticNote[];
};
export type CheckResult = {
    warnings: CompilationDiagnostic[];
    errors: CompilationDiagnostic[];
};
export declare const check: (program: string) => CheckResult;
export type ExecutionResult = {
    event: any;
    result: any;
};
export declare const execute: (program: string, event: any) => ExecutionResult;
export declare const formatDiagnostic: (diagnostic: CompilationDiagnostic) => string;
