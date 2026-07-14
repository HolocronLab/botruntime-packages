/**
 * Message names available across one or more conversation channels.
 *
 * The naked TChannel conditional is intentional: when an unparameterized
 * BaseConversationInstance represents a union of generated channels, TypeScript
 * distributes over every channel instead of taking keyof of the messages union
 * (which would retain only common keys and often collapse to never).
 */
type IsAny<T> = 0 extends 1 & T ? true : false
type HasNoChannels<T> = [keyof T] extends [never] ? true : false

export type MessageTypeFor<TDefinitions, TChannel extends keyof TDefinitions> = IsAny<TDefinitions> extends true
  ? string
  : HasNoChannels<TDefinitions> extends true
    ? string
    : TChannel extends keyof TDefinitions
      ? TDefinitions[TChannel] extends { messages: infer TMessages }
        ? Extract<keyof TMessages, string>
        : never
      : never

/** Payload accepted by every channel in TChannel that supports TMessage. */
export type MessagePayloadFor<
  TDefinitions,
  TChannel extends keyof TDefinitions,
  TMessage extends PropertyKey,
> = IsAny<TDefinitions> extends true
  ? Record<string, unknown>
  : HasNoChannels<TDefinitions> extends true
    ? Record<string, unknown>
    : TChannel extends keyof TDefinitions
      ? TDefinitions[TChannel] extends { messages: infer TMessages }
        ? TMessage extends keyof TMessages
          ? TMessages[TMessage]
          : never
        : never
      : never
