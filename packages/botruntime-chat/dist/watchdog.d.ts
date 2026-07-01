export declare class WatchDog {
    private _ms;
    private _listeners;
    private _handle;
    private constructor();
    static init: (ms: number) => WatchDog;
    reset(): void;
    on(_type: 'error', listener: (error: Error) => void): void;
    close(): void;
    private _emitError;
}
