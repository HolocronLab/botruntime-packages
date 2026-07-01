import { z } from "zod";
declare const _default: z.ZodObject<{
    type: z.ZodLiteral<"message_deleted">;
    data: z.ZodObject<{
        id: z.ZodString;
        conversationId: z.ZodString;
        userId: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        id: string;
        conversationId: string;
        userId: string;
    }, {
        id: string;
        conversationId: string;
        userId: string;
    }>;
}, "strip", z.ZodTypeAny, {
    type: "message_deleted";
    data: {
        id: string;
        conversationId: string;
        userId: string;
    };
}, {
    type: "message_deleted";
    data: {
        id: string;
        conversationId: string;
        userId: string;
    };
}>;
export default _default;
