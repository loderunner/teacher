# TODO

## Question tool

In the syllabus chat, the model should be able to ask questions to the user to
help it understand the user's needs better. This could be done by giving the
model a question tool, and the user answering the question. The model would then
use the answer to understand the user's needs better, and generate a more
appropriate response. Similar to Anthropic's `AskUserQuestion` tool:
https://code.claude.com/docs/en/agent-sdk/user-input.md

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

