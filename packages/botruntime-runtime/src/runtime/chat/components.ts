import { Message } from '@holocronlab/botruntime-client'
import { messages, z } from '@holocronlab/botruntime-sdk'
import { Autonomous } from '../autonomous'

type DefaultMessageType = keyof typeof messages.defaults
export const DefaultMessageTypes = {
  text: messages.defaults['text'].schema,
  audio: messages.defaults['audio'].schema,
  card: messages.defaults['card'].schema,
  image: messages.defaults['image'].schema,
  carousel: messages.defaults['carousel'].schema,
  choice: messages.defaults['choice'].schema,
  dropdown: messages.defaults['dropdown'].schema,
  file: messages.defaults['file'].schema,
  location: messages.defaults['location'].schema,
  video: messages.defaults['video'].schema,
  bloc: messages.defaults['bloc'].schema,
} satisfies { [K in DefaultMessageType]: z.ZodType }

type SpecificMessage<T> = Omit<Message, 'type' | 'payload'> & T
type DefaultMessages<T extends keyof typeof DefaultMessageTypes> = SpecificMessage<{
  type: T
  payload: z.infer<(typeof DefaultMessageTypes)[T]>
}>

export namespace Messages {
  export namespace User {
    export type Any = Text | Image | Audio | Video | File | Location | Blocs
    export type Text = DefaultMessages<'text'>
    export type Image = DefaultMessages<'image'>
    export type Audio = DefaultMessages<'audio'>
    export type Video = DefaultMessages<'video'>
    export type File = DefaultMessages<'file'>
    export type Location = DefaultMessages<'location'>
    export type Blocs = SpecificMessage<{
      type: 'blocs'
      payload: {
        blocs: Bloc[]
      }
    }>

    export type Bloc = Text | Image | Audio | Video | File | Location
  }

  export namespace Bot {
    export type Any = Text | Image | Audio | Video | File | Location | Blocs
    export type Text = DefaultMessages<'text'>
    export type Image = DefaultMessages<'image'>
    export type Audio = DefaultMessages<'audio'>
    export type Video = DefaultMessages<'video'>
    export type File = DefaultMessages<'file'>
    export type Location = DefaultMessages<'location'>
    export type Bloc = Text | Image | Audio | Video | File | Location
    export type Blocs = SpecificMessage<{
      type: 'blocs'
      payload: {
        blocs: Bloc[]
      }
    }>

    export type Card = DefaultMessages<'card'>
    export type Carousel = DefaultMessages<'carousel'>
    export type Choice = DefaultMessages<'choice'>
    export type Dropdown = DefaultMessages<'dropdown'>
  }
}

const TextComponent = new Autonomous.Component({
  type: 'leaf',
  aliases: ['text', 'message'],
  name: 'Text',
  description: `Send a text message to the user, which can include plain text or markdown formatting.
The text message can be used to convey information, ask questions, or provide instructions to the user within the chat interface.`,
  examples: [
    {
      name: ' Basic Text Message',
      description: 'Sends a simple text message to the user',
      code: `
yield <Message>
  Hello! This is a **bold** statement and this is _italicized_.
</Message>`,
    },
  ],
  leaf: {
    props: z.object({
      text: z.string().describe('The text content of the message to be sent.'),
      // oxlint-disable-next-line no-explicit-any -- Zui schema requires any for SDK Component type compatibility
    }) as any,
  },
})

const AudioComponent = new Autonomous.Component({
  type: 'leaf',
  aliases: [],
  name: 'Audio',
  description: `Send an audio file to the user, which will be playable by the user whithin the chat interface. The audio file should be in a supported format (e.g., MP3, WAV) and accessible via a public URL.`,
  examples: [
    {
      name: ' Basic Audio Message',
      description: 'Sends a simple audio message to the user',
      code: `
yield <Message>
  Here's an **awesome** audio clip for you!
  <Audio audioUrl="https://example.com/path/to/audio.mp3" />
</Message>`,
    },
  ],
  leaf: {
    props: z.object({
      audioUrl: z.string().url().describe('The URL of the audio file to be sent.'),
      // oxlint-disable-next-line no-explicit-any -- Zui schema requires any for SDK Component type compatibility
    }) as any,
  },
})

const ImageComponent = new Autonomous.Component({
  type: 'leaf',
  aliases: ['img'],
  name: 'Image',
  description: `Send an image to the user, which will be displayed within the chat interface. The image should be in a supported format (e.g., JPEG, PNG) and accessible via a public URL.`,
  examples: [
    {
      name: ' Basic Image Message',
      description: 'Sends a simple image message to the user',
      code: `
yield <Message>
  Here's an **awesome** image for you!
  <Image imageUrl="https://example.com/path/to/image.jpg" />
</Message>`,
    },
  ],
  leaf: {
    props: z.object({
      imageUrl: z.string().url().describe('The URL of the image to be sent.'),
      // oxlint-disable-next-line no-explicit-any -- Zui schema requires any for SDK Component type compatibility
    }) as any,
  },
})

const VideoComponent = new Autonomous.Component({
  type: 'leaf',
  aliases: [],
  name: 'Video',
  description: `Send a video to the user, which will be playable within the chat interface. The video should be in a supported format (e.g., MP4, WebM) and accessible via a public URL.`,
  examples: [
    {
      name: ' Basic Video Message',
      description: 'Sends a simple video message to the user',
      code: `
yield <Message>
  Here's an **awesome** video for you!
  <Video videoUrl="https://example.com/path/to/video.mp4" />
</Message>`,
    },
  ],
  leaf: {
    props: z.object({
      videoUrl: z.string().url().describe('The URL of the video to be sent.'),
      // oxlint-disable-next-line no-explicit-any -- Zui schema requires any for SDK Component type compatibility
    }) as any,
  },
})

const LocationComponent = new Autonomous.Component({
  type: 'leaf',
  aliases: [],
  name: 'Location',
  description: `Send a location to the user, which will be displayed as a map within the chat interface. The location should include latitude and longitude coordinates.
The location can also optionally include an address and a title for better context.`,
  examples: [
    {
      name: ' Basic Location Message',
      description: 'Sends a simple location message to the user',
      code: `
yield <Message>
  Here's the location you requested!
  <Location latitude={37.7749} longitude={-122.4194} />
</Message>`,
    },
    {
      name: ' Location Message with Address and Title',
      description: 'Sends a location message with additional address and title information',
      code: `
yield <Message>
  Here's the location of our office!
  <Location 
    latitude={45.506342} 
    longitude={-73.572012} 
    address="400 Blvd. De Maisonneuve Ouest #200, Montreal, Quebec H3A 1L4, Canada"
    title="Botpress HQ" 
  />
</Message>`,
    },
  ],
  leaf: {
    props: z.object({
      latitude: z.number().describe('The latitude of the location to be sent.'),
      longitude: z.number().describe('The longitude of the location to be sent.'),
      address: z.string().optional().describe('The address of the location to be sent.'),
      title: z.string().optional().describe('The title of the location to be sent.'),
      // oxlint-disable-next-line no-explicit-any -- Zui schema requires any for SDK Component type compatibility
    }) as any,
  },
})

const ChoiceComponent = new Autonomous.Component({
  type: 'leaf',
  aliases: ['choices', 'option', 'options', 'buttons'],
  name: 'Choice',
  description: `Present a choice to the user with multiple options.
The user can select one of the provided options, and the selection will be sent back to the system for further processing.
You can include up to 10 options for the user to choose from.
Values for each option should be unique identifiers that can be used to identify the user's selection.`,
  examples: [
    {
      name: ' Basic Choice Message',
      description: 'Presents a simple choice message to the user',
      code: `
yield <Message>
  Please choose one of the following options:
  <Choice 
    text="Select an option:"
    options={[
      { label: "Option 1", value: "option_1" },
      { label: "Option 2", value: "option_2" },
      { label: "Option 3", value: "option_3" }
    ]}
  />
</Message>`,
    },
  ],
  leaf: {
    props: z.object({
      text: z.string().describe('The prompt text for the choice.'),
      options: z
        .array(
          z.object({
            label: z.string().describe('The label of the option to be displayed to the user.'),
            value: z.string().describe('The value of the option to be sent back when selected.'),
          })
        )
        .describe('The list of options to present to the user.'),
      // oxlint-disable-next-line no-explicit-any -- Zui schema requires any for SDK Component type compatibility
    }) as any,
  },
})

const DropdownComponent = new Autonomous.Component({
  type: 'leaf',
  aliases: ['dropdown', 'select', 'combo'],
  name: 'Dropdown',
  description: `Present a dropdown menu to the user with multiple options.
The user can select one of the provided options from the dropdown, and the selection will be sent back to the system for further processing.
Unlike the Choice component, the Dropdown component is typically used when there are more options to choose from, providing a more compact UI.
The dropdown can include up to 100 options for the user to choose from.
Values for each option should be unique identifiers that can be used to identify the user's selection.`,
  examples: [
    {
      name: ' Basic Dropdown Message',
      description: 'Presents a simple dropdown message to the user',
      code: `
yield <Message>
  Please select a fruit from the dropdown:
  <Dropdown 
    text="Choose an option:"
    options={[
      { label: "🍐 Pear", value: "pear" },
      { label: "🍎 Apple", value: "apple" },
      { label: "🍌 Banana", value: "banana" }
    ]}
  />
</Message>`,
    },
  ],
  leaf: {
    props: z.object({
      text: z.string().describe('The prompt text for the dropdown.'),
      options: z
        .array(
          z.object({
            label: z.string().describe('The label of the option to be displayed to the user.'),
            value: z.string().describe('The value of the option to be sent back when selected.'),
          })
        )
        .describe('The list of options to present in the dropdown.'),
      // oxlint-disable-next-line no-explicit-any -- Zui schema requires any for SDK Component type compatibility
    }) as any,
  },
})

const CarouselComponent = new Autonomous.Component({
  type: 'leaf',
  aliases: ['carousel', 'cards', 'card'],
  name: 'Carousel',
  description: `Send a carousel of cards to the user, allowing them to browse through multiple items.
Carousels are useful for displaying a collection of related items in a compact and interactive format.
It is also possible to send a single card using the Carousel component, useful for sending a combination of image, text, and actions in one message such as a receipt or product detail.
Each item in the carousel is represented as a card, which can include an image, title, subtitle, and actions.
Users can navigate through the carousel by swiping or clicking on navigation controls.
You can include multiple cards in the carousel, each with its own set of actions. A carousel can contain between 1 and 10 items (cards).`,
  examples: [
    {
      name: ' Basic Carousel Message',
      description: 'Sends a simple carousel message to the user',
      code: `
yield <Message>
  Here is an **exciting** carousel for you!
  <Carousel 
    items={[
      {
        title: "Product 1",
        subtitle: "Description of Product 1",
        imageUrl: "https://example.com/path/to/image1.jpg",
        actions: [
          { action: "postback", label: "Buy Now", value: "buy_product_1" },
          { action: "url", label: "View Details", value: "https://example.com/product_1" }
        ]
      },
      {
        title: "Product 2",
        subtitle: "Description of Product 2",
        imageUrl: "https://example.com/path/to/image2.jpg",
        actions: [
          { action: "postback", label: "Buy Now", value: "buy_product_2" },
          { action: "url", label: "View Details", value: "https://example.com/product_2" }
        ]
      }
    ]}
  />
</Message>`,
    },
  ],
  leaf: {
    props: z.object({
      items: z
        .array(
          z.object({
            title: z.string().describe('The title of the carousel item.'),
            subtitle: z.string().optional().describe('The subtitle of the carousel item.'),
            imageUrl: z
              .string()
              .url()
              .optional()
              .describe('The URL of the image to be displayed on the carousel item.'),
            actions: z
              .array(
                z.object({
                  action: z.enum(['postback', 'url', 'say']).describe('The type of action for the button.'),
                  label: z.string().describe('The label of the button to be displayed to the user.'),
                  value: z.string().describe('The value associated with the button action.'),
                })
              )
              .max(3)
              .describe('The list of actions (buttons) to include on the carousel item.'),
          })
        )
        .describe('The list of items (cards) to include in the carousel.'),
      // oxlint-disable-next-line no-explicit-any -- Zui schema requires any for SDK Component type compatibility
    }) as any,
  },
})

export const BUILT_IN_INTEGRATIONS = ['webchat', 'slack', 'teams', 'telegram', 'whatsapp', 'chat'] as const
export const DefaultComponents = {
  Audio: AudioComponent,
  Image: ImageComponent,
  Video: VideoComponent,
  Location: LocationComponent,
  Choice: ChoiceComponent,
  Dropdown: DropdownComponent,
  Carousel: CarouselComponent,
  Text: TextComponent,
}
