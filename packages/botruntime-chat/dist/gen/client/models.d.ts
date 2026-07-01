/**
 * The user object represents someone interacting with the bot within a specific integration. The same person interacting with a bot in slack and messenger will be represented with two different users.
 */
export interface User {
    /**
     * Identifier of the [User](#schema_user)
     */
    id: string;
    /**
     * Name of the [User](#schema_user)
     */
    name?: string;
    /**
     * Picture url of the [User](#schema_user)
     */
    pictureUrl?: string;
    /**
     * Custom profile data of the [User](#schema_user) encoded as a string
     */
    profile?: string;
    /**
     * Creation date of the [User](#schema_user) in ISO 8601 format
     */
    createdAt: string;
    /**
     * Updating date of the [User](#schema_user) in ISO 8601 format
     */
    updatedAt: string;
}
export interface Conversation {
    /**
     * Identifier of the [Conversation](#schema_conversation)
     */
    id: string;
    /**
     * Creation date of the [Conversation](#schema_conversation) in ISO 8601 format
     */
    createdAt: string;
    /**
     * Updating date of the [Conversation](#schema_conversation) in ISO 8601 format
     */
    updatedAt: string;
}
/**
 * The Message object represents a message in a [Conversation](#schema_conversation) for a specific [User](#schema_user).
 */
export interface Message {
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
}
export interface Event {
    /**
     * ID of the custom [Event](#schema_event).
     */
    id: string;
    /**
     * Creation date of the custom [Event](#schema_event) in ISO 8601 format
     */
    createdAt: string;
    /**
     * Payload is the content of the custom event.
     */
    payload: {
        [k: string]: any;
    };
    /**
     * ID of the [Conversation](#schema_conversation).
     */
    conversationId: string;
    /**
     * ID of the [User](#schema_user).
     */
    userId: string;
}
