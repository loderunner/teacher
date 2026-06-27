# BUGS

## Syllabus change can overwrite active chapter in journey

I asked for the agent to change the syllabus, and it changed the active chapter,
removing all of the summary and sections, and leaving only the title.

## Dots appear at the bottom of the chat

When the API is loading but text hasn't started streaming yet, the chat shows
dots. The dots appear at the bottom of the page, right above the text input. I
want them to appear right below the last user message, where the next assistant
message will be inserted.

## User messages aren't rendered as Markdown

User messages are rendered as HTML text, but they should be rendered as
Markdown.

## Bottom of journey page gets pushed below the browser's frame

See screenshots

## MathML rendering triggers too easily

Only trigger MathML on `$$` blocks, not `$` blocks.
