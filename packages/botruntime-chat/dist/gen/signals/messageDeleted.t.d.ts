export interface MessageDeleted {
    type: "message_deleted";
    data: {
        id: string;
        conversationId: string;
        userId: string;
    };
}
