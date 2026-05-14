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

Write unit tests for the whole project. Follow the testing conventions in
@AGENTS.md. There's an example of a DB test in the `getJourney` test. Dispatch
subagents to write the tests for different parts of the codebase, and avoid
context overload.

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

## Teaching style should be immutable

The teaching style should be immutable. It should not be possible to change the
teaching style after the journey has started. The change in tone would be too
abrupt. I don't think the LLM would be able to handle it cleanly.

## Hero should always be as wide as possible

The Hero is constrained by the width of the chat region. It should always be as
wide as possible to show its contents on a single line if possible.

## "Journey" in the top bar should be a link to the journey home page

The "Journey" in the top bar should be a link to the journey home page. It
should not be a button.

## Don't return 404 on locked chapters

When a chapter is locked, it should not return a 404. It should return the
chapter page with a "This chapter is locked" message and a link back to the
active chapter.

## Error boundary for 404 & 500 errors

Put an error boundary around the main app layout, and where relevant inside the
child pages, so that a user can still navigate to other pages if the current
page is not available.

While you're at it, customize and localize the 404 and 500 pages.

## Smooth hero ↔ syllabus-chat transition

The hero (`/`) and the syllabus chat (`/journeys/new`) currently render as two
separate pages with a hard navigation. We want a smooth transition that makes
them feel continuous, especially around the `PromptInput`.

Approach sketch:

- Give the hero's `PromptInput` and the chat page's `PromptInput` the same
  `view-transition-name` so the browser morphs them across navigation.
- Wrap the `router.push('/journeys/new')` call in `startViewTransition` and use
  `addTransitionType('hero-to-chat')` so we can scope CSS animations to this
  specific navigation direction.
- Animate the hero (title, tagline, compass) out, and slide the empty
  conversation in from the bottom.

See `.claude/skills/vercel-react-view-transitions/SKILL.md` for the React 19
`<ViewTransition>` and `addTransitionType` APIs.

## Restructure server packages

Right now we have one `lib/server` package which basically only has `db/` and
then each entity package. It's not any more `server` than the other packages in
`lib/`. And then we have 3 `*-chat` packages, with unclear boundaries between
journey and syllabus.

We should restructure this to make more sense. What do you propose?
