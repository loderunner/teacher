# BUGS

## Tool call errors

Tool call errors are not handled which results, for example, in an infinite
"Applying syllabus" message, never resolved. Handle tool call errors gracefully
by showing them in the chat flow.

## Hero prompt misbehavior

Hero prompt accepts submission with empty text area which it shouldn't. Also,
when submitting, the text area content is reset to zero, even if there is an
error. This makes it impossible to re-submit the same text after a transient
error.

## Journey creation fails at first

After sending the first message from the hero and navigating to the chat page,
the journey chat does not immediately start responding. If I refresh the page it
still does not work. I need to re-submit the first message.

This might only be happening locally.

## Thinking messages stay active

"Thinking..." messages stay active until the entire response is completed, even
though the thinking turn actually ends with the next tool call or assistant
message.

## Prevent sending empty message in chat

You can send an empty message in the chat areas. We want to prevent this.
