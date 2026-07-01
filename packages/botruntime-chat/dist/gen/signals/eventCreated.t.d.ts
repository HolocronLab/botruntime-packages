export interface EventCreated {
    type: "event_created";
    data: {
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
        id: string | null;
        /**
         * Whether the event was created by the bot or not
         */
        isBot: boolean;
    };
}
