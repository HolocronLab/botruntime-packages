import { z } from "zod";
declare const _default: z.ZodObject<{
    type: z.ZodLiteral<"participant_added">;
    data: z.ZodObject<{
        conversationId: z.ZodString;
        participantId: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        conversationId: string;
        participantId: string;
    }, {
        conversationId: string;
        participantId: string;
    }>;
}, "strip", z.ZodTypeAny, {
    type: "participant_added";
    data: {
        conversationId: string;
        participantId: string;
    };
}, {
    type: "participant_added";
    data: {
        conversationId: string;
        participantId: string;
    };
}>;
export default _default;
