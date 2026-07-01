import { EventEmitter } from './event-emitter';
import { EventSourceEmitter } from './eventsource';
import { Types } from './gen/signals';
import { WatchDog } from './watchdog';
type _Signals = Types & {
    unknown: {
        type: 'unknown';
        data: unknown;
    };
};
type SignalListenerState = {
    status: 'disconnected';
} | {
    status: 'connecting';
    connectionPromise: Promise<EventSourceEmitter>;
} | {
    status: 'connected';
    source: EventSourceEmitter;
    watchdog: WatchDog;
};
export type Signals = {
    [K in keyof _Signals as _Signals[K]['type']]: _Signals[K]['data'];
};
type Events = Signals & {
    error: Error;
};
export type SignalListenerStatus = SignalListenerState['status'];
export type SignalListenerProps = {
    url: string;
    userKey: string;
    conversationId: string;
    debug: boolean;
};
export declare class SignalListener extends EventEmitter<Events> {
    private _props;
    private _state;
    private constructor();
    static listen: (props: SignalListenerProps) => Promise<SignalListener>;
    get status(): SignalListenerStatus;
    readonly connect: () => Promise<void>;
    readonly disconnect: () => Promise<void>;
    private _connect;
    private _disconnectSync;
    private _handleMessage;
    private _handleError;
    private _parseSignal;
    private _safeJsonParse;
    private _toError;
    private _debug;
}
export {};
