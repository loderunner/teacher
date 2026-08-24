# BUGS

## Tool call errors

Tool call errors are not handled which results, for example, in an infinite
"Applying syllabus" message, never resolved. Handle tool call errors gracefully
by showing them in the chat flow.

## Journey creation fails at first

After sending the first message from the hero and navigating to the chat page,
the journey chat does not immediately start responding. If I refresh the page it
still does not work. I need to re-submit the first message.

This might only be happening locally.

## Thinking messages stay active

"Thinking..." messages stay active until the entire response is completed, even
though the thinking turn actually ends with the next tool call or assistant
message.

## Syllabus draft blinks in and out

After the first syllabus draft tool call ends and until the message finishes
streaming the syllabus disappears, and only reappears when the streaming is
done.

## Applying syllabus change failure

When the user applies a syllabus change, and it fails because the chapter is
current or completed, it feels like a bug: the app proposes a change that it
cannot apply. If the user attempts to apply a change, and it fails because of
chapter mutability issues, the LLM should pick up on that failure, and continue,
acknowledging the failure to apply. Other failures should not continue, as they
might be transient errors.

## Messages with bad ID

Syllabus change message ID is UUID, but all other messages are nanoid. See
@app/[locale]/journeys/[journeySlug]/[chapterSlug]/chapter-page.tsx:69

First message in the syllabus chat when creating a journey is nanoid(10). See
@app/[locale]/create-draft-journey.ts:61
