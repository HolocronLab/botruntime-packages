import type { MessageCreated } from './messageCreated.t';
import type { EventCreated } from './eventCreated.t';
import type { ParticipantAdded } from './participantAdded.t';
import type { ParticipantRemoved } from './participantRemoved.t';
import type { MessageDeleted } from './messageDeleted.t';
export declare const json: {
    messageCreated: import("json-schema").JSONSchema7;
    eventCreated: import("json-schema").JSONSchema7;
    participantAdded: import("json-schema").JSONSchema7;
    participantRemoved: import("json-schema").JSONSchema7;
    messageDeleted: import("json-schema").JSONSchema7;
};
export declare const zod: {
    messageCreated: import("zod").ZodObject<{
        type: import("zod").ZodLiteral<"message_created">;
        data: import("zod").ZodObject<{
            id: import("zod").ZodString;
            createdAt: import("zod").ZodString;
            payload: import("zod").ZodUnion<[import("zod").ZodObject<{
                type: import("zod").ZodLiteral<"audio">;
                audioUrl: import("zod").ZodString;
            }, "strip", import("zod").ZodTypeAny, {
                type: "audio";
                audioUrl: string;
            }, {
                type: "audio";
                audioUrl: string;
            }>, import("zod").ZodObject<{
                type: import("zod").ZodLiteral<"card">;
                title: import("zod").ZodString;
                subtitle: import("zod").ZodOptional<import("zod").ZodString>;
                imageUrl: import("zod").ZodOptional<import("zod").ZodString>;
                actions: import("zod").ZodArray<import("zod").ZodObject<{
                    action: import("zod").ZodEnum<["postback", "url", "say"]>;
                    label: import("zod").ZodString;
                    value: import("zod").ZodString;
                }, "strip", import("zod").ZodTypeAny, {
                    action: "postback" | "url" | "say";
                    label: string;
                    value: string;
                }, {
                    action: "postback" | "url" | "say";
                    label: string;
                    value: string;
                }>, "many">;
            }, "strip", import("zod").ZodTypeAny, {
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
            }>, import("zod").ZodObject<{
                type: import("zod").ZodLiteral<"carousel">;
                items: import("zod").ZodArray<import("zod").ZodObject<{
                    type: import("zod").ZodLiteral<"card">;
                    title: import("zod").ZodString;
                    subtitle: import("zod").ZodOptional<import("zod").ZodString>;
                    imageUrl: import("zod").ZodOptional<import("zod").ZodString>;
                    actions: import("zod").ZodArray<import("zod").ZodObject<{
                        action: import("zod").ZodEnum<["postback", "url", "say"]>;
                        label: import("zod").ZodString;
                        value: import("zod").ZodString;
                    }, "strip", import("zod").ZodTypeAny, {
                        action: "postback" | "url" | "say";
                        label: string;
                        value: string;
                    }, {
                        action: "postback" | "url" | "say";
                        label: string;
                        value: string;
                    }>, "many">;
                }, "strip", import("zod").ZodTypeAny, {
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
            }, "strip", import("zod").ZodTypeAny, {
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
            }>, import("zod").ZodObject<{
                text: import("zod").ZodString;
                options: import("zod").ZodArray<import("zod").ZodObject<{
                    label: import("zod").ZodString;
                    value: import("zod").ZodString;
                }, "strip", import("zod").ZodTypeAny, {
                    label: string;
                    value: string;
                }, {
                    label: string;
                    value: string;
                }>, "many">;
                type: import("zod").ZodLiteral<"choice">;
            }, "strip", import("zod").ZodTypeAny, {
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
            }>, import("zod").ZodObject<{
                text: import("zod").ZodString;
                options: import("zod").ZodArray<import("zod").ZodObject<{
                    label: import("zod").ZodString;
                    value: import("zod").ZodString;
                }, "strip", import("zod").ZodTypeAny, {
                    label: string;
                    value: string;
                }, {
                    label: string;
                    value: string;
                }>, "many">;
                type: import("zod").ZodLiteral<"dropdown">;
            }, "strip", import("zod").ZodTypeAny, {
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
            }>, import("zod").ZodObject<{
                type: import("zod").ZodLiteral<"file">;
                fileUrl: import("zod").ZodString;
                title: import("zod").ZodOptional<import("zod").ZodString>;
            }, "strip", import("zod").ZodTypeAny, {
                type: "file";
                fileUrl: string;
                title?: string | undefined;
            }, {
                type: "file";
                fileUrl: string;
                title?: string | undefined;
            }>, import("zod").ZodObject<{
                type: import("zod").ZodLiteral<"image">;
                imageUrl: import("zod").ZodString;
            }, "strip", import("zod").ZodTypeAny, {
                type: "image";
                imageUrl: string;
            }, {
                type: "image";
                imageUrl: string;
            }>, import("zod").ZodObject<{
                type: import("zod").ZodLiteral<"location">;
                latitude: import("zod").ZodNumber;
                longitude: import("zod").ZodNumber;
                address: import("zod").ZodOptional<import("zod").ZodString>;
                title: import("zod").ZodOptional<import("zod").ZodString>;
            }, "strip", import("zod").ZodTypeAny, {
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
            }>, import("zod").ZodObject<{
                type: import("zod").ZodLiteral<"text">;
                text: import("zod").ZodString;
            }, "strip", import("zod").ZodTypeAny, {
                type: "text";
                text: string;
            }, {
                type: "text";
                text: string;
            }>, import("zod").ZodObject<{
                type: import("zod").ZodLiteral<"video">;
                videoUrl: import("zod").ZodString;
            }, "strip", import("zod").ZodTypeAny, {
                type: "video";
                videoUrl: string;
            }, {
                type: "video";
                videoUrl: string;
            }>, import("zod").ZodObject<{
                type: import("zod").ZodLiteral<"markdown">;
                markdown: import("zod").ZodString;
            }, "strip", import("zod").ZodTypeAny, {
                type: "markdown";
                markdown: string;
            }, {
                type: "markdown";
                markdown: string;
            }>, import("zod").ZodObject<{
                type: import("zod").ZodLiteral<"bloc">;
                items: import("zod").ZodArray<import("zod").ZodUnion<[import("zod").ZodObject<{
                    type: import("zod").ZodLiteral<"text">;
                    text: import("zod").ZodString;
                }, "strip", import("zod").ZodTypeAny, {
                    type: "text";
                    text: string;
                }, {
                    type: "text";
                    text: string;
                }>, import("zod").ZodObject<{
                    type: import("zod").ZodLiteral<"markdown">;
                    markdown: import("zod").ZodString;
                }, "strip", import("zod").ZodTypeAny, {
                    type: "markdown";
                    markdown: string;
                }, {
                    type: "markdown";
                    markdown: string;
                }>, import("zod").ZodObject<{
                    type: import("zod").ZodLiteral<"image">;
                    imageUrl: import("zod").ZodString;
                }, "strip", import("zod").ZodTypeAny, {
                    type: "image";
                    imageUrl: string;
                }, {
                    type: "image";
                    imageUrl: string;
                }>, import("zod").ZodObject<{
                    type: import("zod").ZodLiteral<"audio">;
                    audioUrl: import("zod").ZodString;
                }, "strip", import("zod").ZodTypeAny, {
                    type: "audio";
                    audioUrl: string;
                }, {
                    type: "audio";
                    audioUrl: string;
                }>, import("zod").ZodObject<{
                    type: import("zod").ZodLiteral<"video">;
                    videoUrl: import("zod").ZodString;
                }, "strip", import("zod").ZodTypeAny, {
                    type: "video";
                    videoUrl: string;
                }, {
                    type: "video";
                    videoUrl: string;
                }>, import("zod").ZodObject<{
                    type: import("zod").ZodLiteral<"file">;
                    fileUrl: import("zod").ZodString;
                    title: import("zod").ZodOptional<import("zod").ZodString>;
                }, "strip", import("zod").ZodTypeAny, {
                    type: "file";
                    fileUrl: string;
                    title?: string | undefined;
                }, {
                    type: "file";
                    fileUrl: string;
                    title?: string | undefined;
                }>, import("zod").ZodObject<{
                    type: import("zod").ZodLiteral<"location">;
                    latitude: import("zod").ZodNumber;
                    longitude: import("zod").ZodNumber;
                    address: import("zod").ZodOptional<import("zod").ZodString>;
                    title: import("zod").ZodOptional<import("zod").ZodString>;
                }, "strip", import("zod").ZodTypeAny, {
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
            }, "strip", import("zod").ZodTypeAny, {
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
            userId: import("zod").ZodString;
            conversationId: import("zod").ZodString;
            metadata: import("zod").ZodOptional<import("zod").ZodRecord<import("zod").ZodString, import("zod").ZodUnion<[import("zod").ZodAny, import("zod").ZodNull]>>>;
            isBot: import("zod").ZodBoolean;
        }, "strip", import("zod").ZodTypeAny, {
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
    }, "strip", import("zod").ZodTypeAny, {
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
    eventCreated: import("zod").ZodObject<{
        type: import("zod").ZodLiteral<"event_created">;
        data: import("zod").ZodObject<{
            createdAt: import("zod").ZodString;
            payload: import("zod").ZodRecord<import("zod").ZodString, import("zod").ZodAny>;
            conversationId: import("zod").ZodString;
            userId: import("zod").ZodString;
            id: import("zod").ZodUnion<[import("zod").ZodString, import("zod").ZodNull]>;
            isBot: import("zod").ZodBoolean;
        }, "strip", import("zod").ZodTypeAny, {
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
    }, "strip", import("zod").ZodTypeAny, {
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
    participantAdded: import("zod").ZodObject<{
        type: import("zod").ZodLiteral<"participant_added">;
        data: import("zod").ZodObject<{
            conversationId: import("zod").ZodString;
            participantId: import("zod").ZodString;
        }, "strip", import("zod").ZodTypeAny, {
            conversationId: string;
            participantId: string;
        }, {
            conversationId: string;
            participantId: string;
        }>;
    }, "strip", import("zod").ZodTypeAny, {
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
    participantRemoved: import("zod").ZodObject<{
        type: import("zod").ZodLiteral<"participant_removed">;
        data: import("zod").ZodObject<{
            conversationId: import("zod").ZodString;
            participantId: import("zod").ZodString;
        }, "strip", import("zod").ZodTypeAny, {
            conversationId: string;
            participantId: string;
        }, {
            conversationId: string;
            participantId: string;
        }>;
    }, "strip", import("zod").ZodTypeAny, {
        type: "participant_removed";
        data: {
            conversationId: string;
            participantId: string;
        };
    }, {
        type: "participant_removed";
        data: {
            conversationId: string;
            participantId: string;
        };
    }>;
    messageDeleted: import("zod").ZodObject<{
        type: import("zod").ZodLiteral<"message_deleted">;
        data: import("zod").ZodObject<{
            id: import("zod").ZodString;
            conversationId: import("zod").ZodString;
            userId: import("zod").ZodString;
        }, "strip", import("zod").ZodTypeAny, {
            id: string;
            conversationId: string;
            userId: string;
        }, {
            id: string;
            conversationId: string;
            userId: string;
        }>;
    }, "strip", import("zod").ZodTypeAny, {
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
};
export type Types = {
    messageCreated: MessageCreated;
    eventCreated: EventCreated;
    participantAdded: ParticipantAdded;
    participantRemoved: ParticipantRemoved;
    messageDeleted: MessageDeleted;
};
