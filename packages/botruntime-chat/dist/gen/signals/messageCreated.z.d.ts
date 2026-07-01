import { z } from "zod";
declare const _default: z.ZodObject<{
    type: z.ZodLiteral<"message_created">;
    data: z.ZodObject<{
        id: z.ZodString;
        createdAt: z.ZodString;
        payload: z.ZodUnion<[z.ZodObject<{
            type: z.ZodLiteral<"audio">;
            audioUrl: z.ZodString;
        }, "strip", z.ZodTypeAny, {
            type: "audio";
            audioUrl: string;
        }, {
            type: "audio";
            audioUrl: string;
        }>, z.ZodObject<{
            type: z.ZodLiteral<"card">;
            title: z.ZodString;
            subtitle: z.ZodOptional<z.ZodString>;
            imageUrl: z.ZodOptional<z.ZodString>;
            actions: z.ZodArray<z.ZodObject<{
                action: z.ZodEnum<["postback", "url", "say"]>;
                label: z.ZodString;
                value: z.ZodString;
            }, "strip", z.ZodTypeAny, {
                action: "postback" | "url" | "say";
                label: string;
                value: string;
            }, {
                action: "postback" | "url" | "say";
                label: string;
                value: string;
            }>, "many">;
        }, "strip", z.ZodTypeAny, {
            type: "card";
            title: string;
            actions: {
                action: "postback" | "url" | "say";
                label: string;
                value: string;
            }[];
            subtitle?: string | undefined;
            imageUrl?: string | undefined;
        }, {
            type: "card";
            title: string;
            actions: {
                action: "postback" | "url" | "say";
                label: string;
                value: string;
            }[];
            subtitle?: string | undefined;
            imageUrl?: string | undefined;
        }>, z.ZodObject<{
            type: z.ZodLiteral<"carousel">;
            items: z.ZodArray<z.ZodObject<{
                type: z.ZodLiteral<"card">;
                title: z.ZodString;
                subtitle: z.ZodOptional<z.ZodString>;
                imageUrl: z.ZodOptional<z.ZodString>;
                actions: z.ZodArray<z.ZodObject<{
                    action: z.ZodEnum<["postback", "url", "say"]>;
                    label: z.ZodString;
                    value: z.ZodString;
                }, "strip", z.ZodTypeAny, {
                    action: "postback" | "url" | "say";
                    label: string;
                    value: string;
                }, {
                    action: "postback" | "url" | "say";
                    label: string;
                    value: string;
                }>, "many">;
            }, "strip", z.ZodTypeAny, {
                type: "card";
                title: string;
                actions: {
                    action: "postback" | "url" | "say";
                    label: string;
                    value: string;
                }[];
                subtitle?: string | undefined;
                imageUrl?: string | undefined;
            }, {
                type: "card";
                title: string;
                actions: {
                    action: "postback" | "url" | "say";
                    label: string;
                    value: string;
                }[];
                subtitle?: string | undefined;
                imageUrl?: string | undefined;
            }>, "many">;
        }, "strip", z.ZodTypeAny, {
            type: "carousel";
            items: {
                type: "card";
                title: string;
                actions: {
                    action: "postback" | "url" | "say";
                    label: string;
                    value: string;
                }[];
                subtitle?: string | undefined;
                imageUrl?: string | undefined;
            }[];
        }, {
            type: "carousel";
            items: {
                type: "card";
                title: string;
                actions: {
                    action: "postback" | "url" | "say";
                    label: string;
                    value: string;
                }[];
                subtitle?: string | undefined;
                imageUrl?: string | undefined;
            }[];
        }>, z.ZodObject<{
            text: z.ZodString;
            options: z.ZodArray<z.ZodObject<{
                label: z.ZodString;
                value: z.ZodString;
            }, "strip", z.ZodTypeAny, {
                label: string;
                value: string;
            }, {
                label: string;
                value: string;
            }>, "many">;
            type: z.ZodLiteral<"choice">;
        }, "strip", z.ZodTypeAny, {
            type: "choice";
            options: {
                label: string;
                value: string;
            }[];
            text: string;
        }, {
            type: "choice";
            options: {
                label: string;
                value: string;
            }[];
            text: string;
        }>, z.ZodObject<{
            text: z.ZodString;
            options: z.ZodArray<z.ZodObject<{
                label: z.ZodString;
                value: z.ZodString;
            }, "strip", z.ZodTypeAny, {
                label: string;
                value: string;
            }, {
                label: string;
                value: string;
            }>, "many">;
            type: z.ZodLiteral<"dropdown">;
        }, "strip", z.ZodTypeAny, {
            type: "dropdown";
            options: {
                label: string;
                value: string;
            }[];
            text: string;
        }, {
            type: "dropdown";
            options: {
                label: string;
                value: string;
            }[];
            text: string;
        }>, z.ZodObject<{
            type: z.ZodLiteral<"file">;
            fileUrl: z.ZodString;
            title: z.ZodOptional<z.ZodString>;
        }, "strip", z.ZodTypeAny, {
            type: "file";
            fileUrl: string;
            title?: string | undefined;
        }, {
            type: "file";
            fileUrl: string;
            title?: string | undefined;
        }>, z.ZodObject<{
            type: z.ZodLiteral<"image">;
            imageUrl: z.ZodString;
        }, "strip", z.ZodTypeAny, {
            type: "image";
            imageUrl: string;
        }, {
            type: "image";
            imageUrl: string;
        }>, z.ZodObject<{
            type: z.ZodLiteral<"location">;
            latitude: z.ZodNumber;
            longitude: z.ZodNumber;
            address: z.ZodOptional<z.ZodString>;
            title: z.ZodOptional<z.ZodString>;
        }, "strip", z.ZodTypeAny, {
            type: "location";
            latitude: number;
            longitude: number;
            address?: string | undefined;
            title?: string | undefined;
        }, {
            type: "location";
            latitude: number;
            longitude: number;
            address?: string | undefined;
            title?: string | undefined;
        }>, z.ZodObject<{
            type: z.ZodLiteral<"text">;
            text: z.ZodString;
        }, "strip", z.ZodTypeAny, {
            type: "text";
            text: string;
        }, {
            type: "text";
            text: string;
        }>, z.ZodObject<{
            type: z.ZodLiteral<"video">;
            videoUrl: z.ZodString;
        }, "strip", z.ZodTypeAny, {
            type: "video";
            videoUrl: string;
        }, {
            type: "video";
            videoUrl: string;
        }>, z.ZodObject<{
            type: z.ZodLiteral<"markdown">;
            markdown: z.ZodString;
        }, "strip", z.ZodTypeAny, {
            type: "markdown";
            markdown: string;
        }, {
            type: "markdown";
            markdown: string;
        }>, z.ZodObject<{
            type: z.ZodLiteral<"bloc">;
            items: z.ZodArray<z.ZodUnion<[z.ZodObject<{
                type: z.ZodLiteral<"text">;
                text: z.ZodString;
            }, "strip", z.ZodTypeAny, {
                type: "text";
                text: string;
            }, {
                type: "text";
                text: string;
            }>, z.ZodObject<{
                type: z.ZodLiteral<"markdown">;
                markdown: z.ZodString;
            }, "strip", z.ZodTypeAny, {
                type: "markdown";
                markdown: string;
            }, {
                type: "markdown";
                markdown: string;
            }>, z.ZodObject<{
                type: z.ZodLiteral<"image">;
                imageUrl: z.ZodString;
            }, "strip", z.ZodTypeAny, {
                type: "image";
                imageUrl: string;
            }, {
                type: "image";
                imageUrl: string;
            }>, z.ZodObject<{
                type: z.ZodLiteral<"audio">;
                audioUrl: z.ZodString;
            }, "strip", z.ZodTypeAny, {
                type: "audio";
                audioUrl: string;
            }, {
                type: "audio";
                audioUrl: string;
            }>, z.ZodObject<{
                type: z.ZodLiteral<"video">;
                videoUrl: z.ZodString;
            }, "strip", z.ZodTypeAny, {
                type: "video";
                videoUrl: string;
            }, {
                type: "video";
                videoUrl: string;
            }>, z.ZodObject<{
                type: z.ZodLiteral<"file">;
                fileUrl: z.ZodString;
                title: z.ZodOptional<z.ZodString>;
            }, "strip", z.ZodTypeAny, {
                type: "file";
                fileUrl: string;
                title?: string | undefined;
            }, {
                type: "file";
                fileUrl: string;
                title?: string | undefined;
            }>, z.ZodObject<{
                type: z.ZodLiteral<"location">;
                latitude: z.ZodNumber;
                longitude: z.ZodNumber;
                address: z.ZodOptional<z.ZodString>;
                title: z.ZodOptional<z.ZodString>;
            }, "strip", z.ZodTypeAny, {
                type: "location";
                latitude: number;
                longitude: number;
                address?: string | undefined;
                title?: string | undefined;
            }, {
                type: "location";
                latitude: number;
                longitude: number;
                address?: string | undefined;
                title?: string | undefined;
            }>]>, "many">;
        }, "strip", z.ZodTypeAny, {
            type: "bloc";
            items: ({
                type: "text";
                text: string;
            } | {
                type: "markdown";
                markdown: string;
            } | {
                type: "image";
                imageUrl: string;
            } | {
                type: "audio";
                audioUrl: string;
            } | {
                type: "video";
                videoUrl: string;
            } | {
                type: "file";
                fileUrl: string;
                title?: string | undefined;
            } | {
                type: "location";
                latitude: number;
                longitude: number;
                address?: string | undefined;
                title?: string | undefined;
            })[];
        }, {
            type: "bloc";
            items: ({
                type: "text";
                text: string;
            } | {
                type: "markdown";
                markdown: string;
            } | {
                type: "image";
                imageUrl: string;
            } | {
                type: "audio";
                audioUrl: string;
            } | {
                type: "video";
                videoUrl: string;
            } | {
                type: "file";
                fileUrl: string;
                title?: string | undefined;
            } | {
                type: "location";
                latitude: number;
                longitude: number;
                address?: string | undefined;
                title?: string | undefined;
            })[];
        }>]>;
        userId: z.ZodString;
        conversationId: z.ZodString;
        metadata: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnion<[z.ZodAny, z.ZodNull]>>>;
        isBot: z.ZodBoolean;
    }, "strip", z.ZodTypeAny, {
        id: string;
        conversationId: string;
        userId: string;
        payload: {
            type: "audio";
            audioUrl: string;
        } | {
            type: "card";
            title: string;
            actions: {
                action: "postback" | "url" | "say";
                label: string;
                value: string;
            }[];
            subtitle?: string | undefined;
            imageUrl?: string | undefined;
        } | {
            type: "carousel";
            items: {
                type: "card";
                title: string;
                actions: {
                    action: "postback" | "url" | "say";
                    label: string;
                    value: string;
                }[];
                subtitle?: string | undefined;
                imageUrl?: string | undefined;
            }[];
        } | {
            type: "choice";
            options: {
                label: string;
                value: string;
            }[];
            text: string;
        } | {
            type: "dropdown";
            options: {
                label: string;
                value: string;
            }[];
            text: string;
        } | {
            type: "file";
            fileUrl: string;
            title?: string | undefined;
        } | {
            type: "image";
            imageUrl: string;
        } | {
            type: "location";
            latitude: number;
            longitude: number;
            address?: string | undefined;
            title?: string | undefined;
        } | {
            type: "text";
            text: string;
        } | {
            type: "video";
            videoUrl: string;
        } | {
            type: "markdown";
            markdown: string;
        } | {
            type: "bloc";
            items: ({
                type: "text";
                text: string;
            } | {
                type: "markdown";
                markdown: string;
            } | {
                type: "image";
                imageUrl: string;
            } | {
                type: "audio";
                audioUrl: string;
            } | {
                type: "video";
                videoUrl: string;
            } | {
                type: "file";
                fileUrl: string;
                title?: string | undefined;
            } | {
                type: "location";
                latitude: number;
                longitude: number;
                address?: string | undefined;
                title?: string | undefined;
            })[];
        };
        createdAt: string;
        isBot: boolean;
        metadata?: Record<string, any> | undefined;
    }, {
        id: string;
        conversationId: string;
        userId: string;
        payload: {
            type: "audio";
            audioUrl: string;
        } | {
            type: "card";
            title: string;
            actions: {
                action: "postback" | "url" | "say";
                label: string;
                value: string;
            }[];
            subtitle?: string | undefined;
            imageUrl?: string | undefined;
        } | {
            type: "carousel";
            items: {
                type: "card";
                title: string;
                actions: {
                    action: "postback" | "url" | "say";
                    label: string;
                    value: string;
                }[];
                subtitle?: string | undefined;
                imageUrl?: string | undefined;
            }[];
        } | {
            type: "choice";
            options: {
                label: string;
                value: string;
            }[];
            text: string;
        } | {
            type: "dropdown";
            options: {
                label: string;
                value: string;
            }[];
            text: string;
        } | {
            type: "file";
            fileUrl: string;
            title?: string | undefined;
        } | {
            type: "image";
            imageUrl: string;
        } | {
            type: "location";
            latitude: number;
            longitude: number;
            address?: string | undefined;
            title?: string | undefined;
        } | {
            type: "text";
            text: string;
        } | {
            type: "video";
            videoUrl: string;
        } | {
            type: "markdown";
            markdown: string;
        } | {
            type: "bloc";
            items: ({
                type: "text";
                text: string;
            } | {
                type: "markdown";
                markdown: string;
            } | {
                type: "image";
                imageUrl: string;
            } | {
                type: "audio";
                audioUrl: string;
            } | {
                type: "video";
                videoUrl: string;
            } | {
                type: "file";
                fileUrl: string;
                title?: string | undefined;
            } | {
                type: "location";
                latitude: number;
                longitude: number;
                address?: string | undefined;
                title?: string | undefined;
            })[];
        };
        createdAt: string;
        isBot: boolean;
        metadata?: Record<string, any> | undefined;
    }>;
}, "strip", z.ZodTypeAny, {
    type: "message_created";
    data: {
        id: string;
        conversationId: string;
        userId: string;
        payload: {
            type: "audio";
            audioUrl: string;
        } | {
            type: "card";
            title: string;
            actions: {
                action: "postback" | "url" | "say";
                label: string;
                value: string;
            }[];
            subtitle?: string | undefined;
            imageUrl?: string | undefined;
        } | {
            type: "carousel";
            items: {
                type: "card";
                title: string;
                actions: {
                    action: "postback" | "url" | "say";
                    label: string;
                    value: string;
                }[];
                subtitle?: string | undefined;
                imageUrl?: string | undefined;
            }[];
        } | {
            type: "choice";
            options: {
                label: string;
                value: string;
            }[];
            text: string;
        } | {
            type: "dropdown";
            options: {
                label: string;
                value: string;
            }[];
            text: string;
        } | {
            type: "file";
            fileUrl: string;
            title?: string | undefined;
        } | {
            type: "image";
            imageUrl: string;
        } | {
            type: "location";
            latitude: number;
            longitude: number;
            address?: string | undefined;
            title?: string | undefined;
        } | {
            type: "text";
            text: string;
        } | {
            type: "video";
            videoUrl: string;
        } | {
            type: "markdown";
            markdown: string;
        } | {
            type: "bloc";
            items: ({
                type: "text";
                text: string;
            } | {
                type: "markdown";
                markdown: string;
            } | {
                type: "image";
                imageUrl: string;
            } | {
                type: "audio";
                audioUrl: string;
            } | {
                type: "video";
                videoUrl: string;
            } | {
                type: "file";
                fileUrl: string;
                title?: string | undefined;
            } | {
                type: "location";
                latitude: number;
                longitude: number;
                address?: string | undefined;
                title?: string | undefined;
            })[];
        };
        createdAt: string;
        isBot: boolean;
        metadata?: Record<string, any> | undefined;
    };
}, {
    type: "message_created";
    data: {
        id: string;
        conversationId: string;
        userId: string;
        payload: {
            type: "audio";
            audioUrl: string;
        } | {
            type: "card";
            title: string;
            actions: {
                action: "postback" | "url" | "say";
                label: string;
                value: string;
            }[];
            subtitle?: string | undefined;
            imageUrl?: string | undefined;
        } | {
            type: "carousel";
            items: {
                type: "card";
                title: string;
                actions: {
                    action: "postback" | "url" | "say";
                    label: string;
                    value: string;
                }[];
                subtitle?: string | undefined;
                imageUrl?: string | undefined;
            }[];
        } | {
            type: "choice";
            options: {
                label: string;
                value: string;
            }[];
            text: string;
        } | {
            type: "dropdown";
            options: {
                label: string;
                value: string;
            }[];
            text: string;
        } | {
            type: "file";
            fileUrl: string;
            title?: string | undefined;
        } | {
            type: "image";
            imageUrl: string;
        } | {
            type: "location";
            latitude: number;
            longitude: number;
            address?: string | undefined;
            title?: string | undefined;
        } | {
            type: "text";
            text: string;
        } | {
            type: "video";
            videoUrl: string;
        } | {
            type: "markdown";
            markdown: string;
        } | {
            type: "bloc";
            items: ({
                type: "text";
                text: string;
            } | {
                type: "markdown";
                markdown: string;
            } | {
                type: "image";
                imageUrl: string;
            } | {
                type: "audio";
                audioUrl: string;
            } | {
                type: "video";
                videoUrl: string;
            } | {
                type: "file";
                fileUrl: string;
                title?: string | undefined;
            } | {
                type: "location";
                latitude: number;
                longitude: number;
                address?: string | undefined;
                title?: string | undefined;
            })[];
        };
        createdAt: string;
        isBot: boolean;
        metadata?: Record<string, any> | undefined;
    };
}>;
export default _default;
