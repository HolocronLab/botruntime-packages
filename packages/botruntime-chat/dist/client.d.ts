import { AsyncCollection } from './listing';
import { SignalListener } from './signal-listener';
import * as types from './types';
declare const _createAuthClient: unique symbol;
type Merge<A, B> = Omit<A, keyof B> & B;
type IClient = Merge<{
    [K in types.ClientOperation]: (x: types.ClientRequests[K]) => Promise<types.ClientResponses[K]>;
}, {
    listenConversation: (args: types.ClientRequests['listenConversation']) => Promise<SignalListener>;
}>;
type IAuthenticatedClient = Merge<{
    [K in types.AuthenticatedOperation]: (x: types.AuthenticatedClientRequests[K]) => Promise<types.ClientResponses[K]>;
}, {
    listenConversation: (args: types.AuthenticatedClientRequests['listenConversation']) => Promise<SignalListener>;
}>;
export declare class Client implements IClient {
    readonly props: Readonly<types.ClientProps>;
    private _connectionTested;
    private _auto;
    constructor(props: Readonly<types.ClientProps>);
    get apiVersion(): string;
    /**
     * Gets or creates a user based on the provided props and returns an authenticated client.
     */
    static connect(props: types.ConnectProps): Promise<AuthenticatedClient>;
    readonly createConversation: IClient['createConversation'];
    readonly getConversation: IClient['getConversation'];
    readonly getOrCreateConversation: IClient['getOrCreateConversation'];
    readonly deleteConversation: IClient['deleteConversation'];
    readonly listConversations: IClient['listConversations'];
    readonly listMessages: IClient['listMessages'];
    readonly addParticipant: IClient['addParticipant'];
    readonly removeParticipant: IClient['removeParticipant'];
    readonly getParticipant: IClient['getParticipant'];
    readonly listParticipants: IClient['listParticipants'];
    readonly createMessage: IClient['createMessage'];
    readonly getMessage: IClient['getMessage'];
    readonly deleteMessage: IClient['deleteMessage'];
    readonly createUser: IClient['createUser'];
    readonly getUser: IClient['getUser'];
    readonly getOrCreateUser: IClient['getOrCreateUser'];
    readonly updateUser: IClient['updateUser'];
    readonly deleteUser: IClient['deleteUser'];
    readonly createEvent: IClient['createEvent'];
    readonly getEvent: IClient['getEvent'];
    get list(): {
        conversations: (props: types.ClientRequests["listConversations"]) => AsyncCollection<{
            id: string;
            createdAt: string;
            updatedAt: string;
        }>;
        messages: (props: types.ClientRequests["listMessages"]) => AsyncCollection<{
            id: string;
            createdAt: string;
            payload: {
                [x: string]: any;
                type: "audio";
                audioUrl: string;
            } | {
                [x: string]: any;
                type: "card";
                title: string;
                subtitle?: string | undefined;
                imageUrl?: string | undefined;
                actions: {
                    [x: string]: any;
                    action: "postback" | "url" | "say";
                    label: string;
                    value: string;
                }[];
            } | {
                [x: string]: any;
                type: "carousel";
                items: {
                    [x: string]: any;
                    type: "card";
                    title: string;
                    subtitle?: string | undefined;
                    imageUrl?: string | undefined;
                    actions: {
                        [x: string]: any;
                        action: "postback" | "url" | "say";
                        label: string;
                        value: string;
                    }[];
                }[];
            } | {
                [x: string]: any;
                text: string;
                options: {
                    [x: string]: any;
                    label: string;
                    value: string;
                }[];
                type: "choice";
            } | {
                [x: string]: any;
                text: string;
                options: {
                    [x: string]: any;
                    label: string;
                    value: string;
                }[];
                type: "dropdown";
            } | {
                [x: string]: any;
                type: "file";
                fileUrl: string;
                title?: string | undefined;
            } | {
                [x: string]: any;
                type: "image";
                imageUrl: string;
            } | {
                [x: string]: any;
                type: "location";
                latitude: number;
                longitude: number;
                address?: string | undefined;
                title?: string | undefined;
            } | {
                [x: string]: any;
                type: "text";
                text: string;
            } | {
                [x: string]: any;
                type: "video";
                videoUrl: string;
            } | {
                [x: string]: any;
                type: "markdown";
                markdown: string;
            } | {
                [x: string]: any;
                type: "bloc";
                items: ({
                    [x: string]: any;
                    type: "text";
                    text: string;
                } | {
                    [x: string]: any;
                    type: "markdown";
                    markdown: string;
                } | {
                    [x: string]: any;
                    type: "image";
                    imageUrl: string;
                } | {
                    [x: string]: any;
                    type: "audio";
                    audioUrl: string;
                } | {
                    [x: string]: any;
                    type: "video";
                    videoUrl: string;
                } | {
                    [x: string]: any;
                    type: "file";
                    fileUrl: string;
                    title?: string | undefined;
                } | {
                    [x: string]: any;
                    type: "location";
                    latitude: number;
                    longitude: number;
                    address?: string | undefined;
                    title?: string | undefined;
                })[];
            };
            userId: string;
            conversationId: string;
            metadata?: {
                [x: string]: any;
            } | undefined;
        }>;
        participants: (props: types.ClientRequests["listParticipants"]) => AsyncCollection<{
            id: string;
            name?: string | undefined;
            pictureUrl?: string | undefined;
            profile?: string | undefined;
            createdAt: string;
            updatedAt: string;
        }>;
    };
    readonly listenConversation: IClient['listenConversation'];
    private _call;
    /**
     * The Chat-API is called like any other integrations by sending requests to the bridge webhook endpoint.
     * This endpoint may return a successful status code even when the payload contains an error.
     * This method parses the payload to check for an error and throws an error if one is found.
     */
    private _checkPayloadForError;
    private static _createAxios;
    private get _apiUrl();
    private static _getApiUrl;
    private _testConnection;
}
export declare class AuthenticatedClient implements IAuthenticatedClient {
    private _client;
    readonly user: types.AuthenticatedUser;
    private constructor();
    static [_createAuthClient]: (client: Client, user: types.AuthenticatedUser) => AuthenticatedClient;
    get apiVersion(): string;
    readonly createConversation: IAuthenticatedClient['createConversation'];
    readonly getConversation: IAuthenticatedClient['getConversation'];
    readonly getOrCreateConversation: IAuthenticatedClient['getOrCreateConversation'];
    readonly deleteConversation: IAuthenticatedClient['deleteConversation'];
    readonly listConversations: IAuthenticatedClient['listConversations'];
    readonly listMessages: IAuthenticatedClient['listMessages'];
    readonly listenConversation: IAuthenticatedClient['listenConversation'];
    readonly addParticipant: IAuthenticatedClient['addParticipant'];
    readonly removeParticipant: IAuthenticatedClient['removeParticipant'];
    readonly getParticipant: IAuthenticatedClient['getParticipant'];
    readonly listParticipants: IAuthenticatedClient['listParticipants'];
    readonly createMessage: IAuthenticatedClient['createMessage'];
    readonly getMessage: IAuthenticatedClient['getMessage'];
    readonly deleteMessage: IAuthenticatedClient['deleteMessage'];
    readonly getUser: IAuthenticatedClient['getUser'];
    readonly updateUser: IAuthenticatedClient['updateUser'];
    readonly deleteUser: IAuthenticatedClient['deleteUser'];
    readonly createEvent: IAuthenticatedClient['createEvent'];
    readonly getEvent: IAuthenticatedClient['getEvent'];
    get list(): {
        conversations: (x: types.AuthenticatedClientRequests["listConversations"]) => AsyncCollection<{
            id: string;
            createdAt: string;
            updatedAt: string;
        }>;
        messages: (x: types.AuthenticatedClientRequests["listMessages"]) => AsyncCollection<{
            id: string;
            createdAt: string;
            payload: {
                [x: string]: any;
                type: "audio";
                audioUrl: string;
            } | {
                [x: string]: any;
                type: "card";
                title: string;
                subtitle?: string | undefined;
                imageUrl?: string | undefined;
                actions: {
                    [x: string]: any;
                    action: "postback" | "url" | "say";
                    label: string;
                    value: string;
                }[];
            } | {
                [x: string]: any;
                type: "carousel";
                items: {
                    [x: string]: any;
                    type: "card";
                    title: string;
                    subtitle?: string | undefined;
                    imageUrl?: string | undefined;
                    actions: {
                        [x: string]: any;
                        action: "postback" | "url" | "say";
                        label: string;
                        value: string;
                    }[];
                }[];
            } | {
                [x: string]: any;
                text: string;
                options: {
                    [x: string]: any;
                    label: string;
                    value: string;
                }[];
                type: "choice";
            } | {
                [x: string]: any;
                text: string;
                options: {
                    [x: string]: any;
                    label: string;
                    value: string;
                }[];
                type: "dropdown";
            } | {
                [x: string]: any;
                type: "file";
                fileUrl: string;
                title?: string | undefined;
            } | {
                [x: string]: any;
                type: "image";
                imageUrl: string;
            } | {
                [x: string]: any;
                type: "location";
                latitude: number;
                longitude: number;
                address?: string | undefined;
                title?: string | undefined;
            } | {
                [x: string]: any;
                type: "text";
                text: string;
            } | {
                [x: string]: any;
                type: "video";
                videoUrl: string;
            } | {
                [x: string]: any;
                type: "markdown";
                markdown: string;
            } | {
                [x: string]: any;
                type: "bloc";
                items: ({
                    [x: string]: any;
                    type: "text";
                    text: string;
                } | {
                    [x: string]: any;
                    type: "markdown";
                    markdown: string;
                } | {
                    [x: string]: any;
                    type: "image";
                    imageUrl: string;
                } | {
                    [x: string]: any;
                    type: "audio";
                    audioUrl: string;
                } | {
                    [x: string]: any;
                    type: "video";
                    videoUrl: string;
                } | {
                    [x: string]: any;
                    type: "file";
                    fileUrl: string;
                    title?: string | undefined;
                } | {
                    [x: string]: any;
                    type: "location";
                    latitude: number;
                    longitude: number;
                    address?: string | undefined;
                    title?: string | undefined;
                })[];
            };
            userId: string;
            conversationId: string;
            metadata?: {
                [x: string]: any;
            } | undefined;
        }>;
        participants: (x: types.AuthenticatedClientRequests["listParticipants"]) => AsyncCollection<{
            id: string;
            name?: string | undefined;
            pictureUrl?: string | undefined;
            profile?: string | undefined;
            createdAt: string;
            updatedAt: string;
        }>;
    };
}
export {};
