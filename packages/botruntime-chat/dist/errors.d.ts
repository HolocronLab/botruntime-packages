import { AxiosError } from 'axios';
import { VError } from 'verror';
export * from './gen/client/errors';
export declare class ChatClientError extends VError {
    static wrap(thrown: unknown, message: string): ChatClientError;
    static map(thrown: unknown): ChatClientError;
    constructor(error: ChatClientError, message: string);
    constructor(message: string);
}
export declare class ChatHTTPError extends ChatClientError {
    readonly status: number | undefined;
    constructor(status: number | undefined, message: string);
    static fromAxios(e: AxiosError<{
        message?: string;
    }>): ChatHTTPError;
    private static _axiosMsg;
}
export declare class ChatConfigError extends ChatClientError {
    constructor(message: string);
}
