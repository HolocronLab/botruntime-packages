export interface GetMessageRequestHeaders {
    "x-user-key": string;
}
export interface GetMessageRequestQuery {
}
export interface GetMessageRequestParams {
    id: string;
}
export interface GetMessageRequestBody {
}
export type GetMessageInput = GetMessageRequestBody & GetMessageRequestHeaders & GetMessageRequestQuery & GetMessageRequestParams;
export type GetMessageRequest = {
    headers: GetMessageRequestHeaders;
    query: GetMessageRequestQuery;
    params: GetMessageRequestParams;
    body: GetMessageRequestBody;
};
export declare const parseReq: (input: GetMessageInput) => GetMessageRequest & {
    path: string;
};
export interface GetMessageResponse {
    /**
     * The Message object represents a message in a [Conversation](#schema_conversation) for a specific [User](#schema_user).
     */
    message: {
        /**
         * Identifier of the [Message](#schema_message)
         */
        id: string;
        /**
         * Creation date of the [Message](#schema_message) in ISO 8601 format
         */
        createdAt: string;
        /**
         * Payload is the content type of the message.
         */
        payload: {
            type: "audio";
            audioUrl: string;
            [k: string]: any;
        } | {
            type: "card";
            title: string;
            subtitle?: string;
            imageUrl?: string;
            actions: {
                action: "postback" | "url" | "say";
                label: string;
                value: string;
                [k: string]: any;
            }[];
            [k: string]: any;
        } | {
            type: "carousel";
            items: {
                type: "card";
                title: string;
                subtitle?: string;
                imageUrl?: string;
                actions: {
                    action: "postback" | "url" | "say";
                    label: string;
                    value: string;
                    [k: string]: any;
                }[];
                [k: string]: any;
            }[];
            [k: string]: any;
        } | {
            text: string;
            options: {
                label: string;
                value: string;
                [k: string]: any;
            }[];
            type: "choice";
            [k: string]: any;
        } | {
            text: string;
            options: {
                label: string;
                value: string;
                [k: string]: any;
            }[];
            type: "dropdown";
            [k: string]: any;
        } | {
            type: "file";
            fileUrl: string;
            title?: string;
            [k: string]: any;
        } | {
            type: "image";
            imageUrl: string;
            [k: string]: any;
        } | {
            type: "location";
            latitude: number;
            longitude: number;
            address?: string;
            title?: string;
            [k: string]: any;
        } | {
            type: "text";
            text: string;
            [k: string]: any;
        } | {
            type: "video";
            videoUrl: string;
            [k: string]: any;
        } | {
            type: "markdown";
            markdown: string;
            [k: string]: any;
        } | {
            type: "bloc";
            items: ({
                type: "text";
                text: string;
                [k: string]: any;
            } | {
                type: "markdown";
                markdown: string;
                [k: string]: any;
            } | {
                type: "image";
                imageUrl: string;
                [k: string]: any;
            } | {
                type: "audio";
                audioUrl: string;
                [k: string]: any;
            } | {
                type: "video";
                videoUrl: string;
                [k: string]: any;
            } | {
                type: "file";
                fileUrl: string;
                title?: string;
                [k: string]: any;
            } | {
                type: "location";
                latitude: number;
                longitude: number;
                address?: string;
                title?: string;
                [k: string]: any;
            })[];
            [k: string]: any;
        };
        /**
         * ID of the [User](#schema_user)
         */
        userId: string;
        /**
         * ID of the [Conversation](#schema_conversation)
         */
        conversationId: string;
        /**
         * Metadata of the message
         */
        metadata?: {
            [k: string]: any;
        };
    };
}
