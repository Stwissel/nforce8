# Streaming API support

**nforce8** supports the Force.com Streaming API. Connecting to one of
your channels (PushTopics, Generic Channels, or Platform Events) is easy
using nforce. Here's how you create a streaming client and subscribe to a
PushTopic.

## Push Topics

`topic`: (String:Required) An string value for the streaming topic. This should include the entire topic location:

- `/topic/<PushTopicName>` for PushTopic channel
- `/systemTopic/<SystemTopicName>` for system PushTopics
- `/u/<GenericChannelName>` for Generic Streaming Channels
- `/event/<PlatformEventName>` for Platform Events

## Replay Id

`replayId`: (Integer:Optional) The replayId of the last received event.
Used for replaying events in Durable Streaming or Platform Events

- -1 for new events only
- -2 replay all events
- a number: replay from there
