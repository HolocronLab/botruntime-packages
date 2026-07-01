export type PageLister<R> = (t: {
    nextToken?: string;
}) => Promise<{
    items: R[];
    meta: {
        nextToken?: string;
    };
}>;
export declare class AsyncCollection<T> {
    private _list;
    constructor(_list: PageLister<T>);
    [Symbol.asyncIterator](): AsyncGenerator<Awaited<T>, void, unknown>;
    collect(props?: {
        limit?: number;
    }): Promise<T[]>;
}
