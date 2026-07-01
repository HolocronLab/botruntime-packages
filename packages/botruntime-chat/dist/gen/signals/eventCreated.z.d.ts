import { z } from "zod";
declare const _default: z.ZodObject<{
    type: z.ZodLiteral<"event_created">;
    data: z.ZodObject<{
        createdAt: z.ZodString;
        payload: z.ZodRecord<z.ZodString, z.ZodAny>;
        conversationId: z.ZodString;
        userId: z.ZodString;
        id: z.ZodUnion<[z.ZodString, z.ZodNull]>;
        isBot: z.ZodBoolean;
    }, "strip", z.ZodTypeAny, {
        id: string | null;
        conversationId: string;
        userId: string;
        payload: Record<string, any>;
        createdAt: string;
        isBot: boolean;
    }, {
        id: string | null;
        conversationId: string;
        userId: string;
        payload: Record<string, any>;
        createdAt: string;
        isBot: boolean;
    }>;
}, "strip", z.ZodTypeAny, {
    type: "event_created";
    data: {
        id: string | null;
        conversationId: string;
        userId: string;
        payload: Record<string, any>;
        createdAt: string;
        isBot: boolean;
    };
}, {
    type: "event_created";
    data: {
        id: string | null;
        conversationId: string;
        userId: string;
        payload: Record<string, any>;
        createdAt: string;
        isBot: boolean;
    };
}>;
export default _default;
