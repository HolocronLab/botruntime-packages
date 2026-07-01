export interface ParticipantRemoved {
    type: "participant_removed";
    data: {
        conversationId: string;
        participantId: string;
    };
}
