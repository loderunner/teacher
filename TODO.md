# TODO

## Question tool

In the syllabus chat, the model should be able to ask questions to the user to
help it understand the user's needs better. This could be done by giving the
model a question tool, and the user answering the question. The model would then
use the answer to understand the user's needs better, and generate a more
appropriate response. Similar to Anthropic's `AskUserQuestion` tool:
https://code.claude.com/docs/en/agent-sdk/user-input.md

Find out if a component for this already exists in ai-elements. If not, create
it, copying the style of the `Confirmation` component.

## Write tests w/ db mock

Write unit tests for the whole project. Unit tests use Vitest mocks. Use Vitest
and chain-mock to mock the actual database responses. There's an example of this
in the `getJourney` test. Dispatch subagents to write the tests for different
parts of the codebase, and avoid context overload.

## No source outside app/ or lib/

No source should be outside the app/ or lib/ directories. All source should be
within these directories. This does not include config or setup files, or
Next.js files in standard locations like proxy.ts.

`components/`, `i18n`, `messages/` all belong in the `app/` or `lib/`
directories.

Add this rule to AGENTS.md, and simplify the tsconfig.json include to only point
to those directories. Then fix the ESLint `allowDefaultProject` rule to include
relevant files at the root of the repo.

## Persist syllabus draft phase

The syllabus draft phase should be persisted in the database. A journey is
created immediately after the user sends their first message, and the syllabus
draft and the messages are persisted in the database. When the user navigates
back to the journey page, they can resume building their syllabus in chat.

## Show a "diff" of the syllabus draft when the model updates it

When the model updates the syllabus draft, it should show a "diff" of the
previous draft and the new draft in a collapsed section within the "Updated
syllabus" message. Not a strict code diff, but still a terse
added/removed/changed list of edits.
