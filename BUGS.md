# BUGS

## Syllabus change can overwrite active chapter in journey

I asked for the agent to change the syllabus, and it changed the active chapter,
removing all of the summary and sections, and leaving only the title.

The backend should reject any syllabus change that would affect closed or the
active chapter.

## Dots appear at the bottom of the chat

When the API is loading but text hasn't started streaming yet, the chat shows
dots. The dots appear at the bottom of the page, right above the text input. I
want them to appear right below the last user message, where the next assistant
message will be inserted.

## Syllabus blinks in and out while streaming

When the model is streaming the syllabus, the syllabus blinks in and out while
the model is generating the syllabus.
