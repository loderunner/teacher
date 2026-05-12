# TODO

## Processing indicators

The message part of the chat interface does not show anything while the model is
processing the request. We should show a loading indicator when the model starts
processing the request, a thinking indicator while the model is thinking (and
the client is receiving thinking content), and a tool call indicator when the
model is calling or has called a tool.

## Tool calls & follow-up message

The AI term should never end on a tool call. After calling a tool, if the turn
is finished, the LLM should always send a follow-up message to the user, just to
make the conversation feel more natural. Maybe this needs a multi-turn LLM call?
Or maybe an agentic loop? Should this be done on our side or on the provider's
side? Read Anthropic blogs and docs, and AI SDK docs, and discover optimal
practices.

## Question tool

In the syllabus chat, the model should be able to ask questions to the user to
help it understand the user's needs better. This could be done by giving the
model a question tool, and the user answering the question. The model would then
use the answer to understand the user's needs better, and generate a more
appropriate response. Similar to Anthropic's `AskUserQuestion` tool:
https://code.claude.com/docs/en/agent-sdk/user-input.md

## Show thinking content

The user should be able to see the model's thinking content in the chat
interface as it's streaming. The thinking content should be closed in a
collapsible section by default. The height of the collapsible section should be
fixed, as thinking content can be quite long. The collapsible section should
have a title like "Thinking..." and a pulsing animation to indicate that the
model is thinking. The content should be scrollable.

## Write tests w/ db mock

Write unit tests for the whole thing. Unit tests use Vitest mocks. Use Drizzle
mock (https://orm.drizzle.team/docs/goodies#mock-driver) for database mocks, and
Vitest to mock the actual database responses.

## No source outside app/ or lib/

No source should be outside the app/ or lib/ directories. All source should be
within these directories. This does not include config or setup files, or
Next.js files in standard locations like proxy.ts.

Add this rule to AGENTS.md, and simplify the tsconfig.json include to only point
to those directories.

## Persist syllabus draft phase

The syllabus draft phase should be persisted in the database. A journey is
created immediately after the user sends their first message, and the syllabus
draft and the messages are persisted in the database. When the user navigates
back to the journey page, they can resume building their syllabus in chat.

## Where are the headings?

I set Poppins as the heading font, and Inter as the body font. But I don't see
Poppins being used anywhere. Can we set the CSS class for the heading font where
it belongs in the components code? Also, switch to "Atkinson Hyperlegible Next"
for the body font, and "Atkinson Hyperlegible Mono" for the code font.
