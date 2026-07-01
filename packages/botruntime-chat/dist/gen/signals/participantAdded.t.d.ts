export interface ParticipantAdded {
    type: "participant_added";
    data: {
        conversationId: string;
        participantId: string;
    };
}
