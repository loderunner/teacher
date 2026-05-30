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

We will also need to apply the same pattern to any "user elicitaion" tool, like
the `proposeSyllabusChange` tool and others if required.

## Rewrite "no-op" tools for persistence

Most of the tools are "no-ops". They don't have any meaningful code in
`execute`. This is an artifact from when the messages and syllabus were not
persisted and client-only. Now that every message and tool use is persisted, we
can refactor the tools to actually do something, affect the back or frontend,
and respond with an actual tool use result or error.

## No source outside app/ or lib/

No source should be outside the app/ or lib/ directories. All source should be
within these directories. This does not include config or setup files, or
Next.js files in standard locations like proxy.ts.

`components/`, `i18n`, `messages/` all belong in the `app/` or `lib/`
directories.

Add this rule to AGENTS.md, and simplify the tsconfig.json include to only point
to those directories. Then fix the ESLint `allowDefaultProject` rule to include
relevant files at the root of the repo.

## Show a "diff" of the syllabus draft when the model updates it

When the model updates the syllabus draft, it should show a "diff" of the
previous draft and the new draft in a collapsed section within the "Updated
syllabus" message, similar to the Reasoning collapsible. Not a strict code diff,
but still a list of edits.

We should also be able to have the same view when the model proposes changes to
the syllabus through the `proposeSyllabusChange` tool.

The user should always be able to disclose or collapse the diff, even after the
changes have been applied.

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

## Abuse guardrails

We should guard against the user abusing the LLM to generate inappropriate
content. I think we should have a cheap and fast check for each incoming message
to see if it's likely to be abuse. If it is, we should reject the message and
tell the user to stop.

Remember this app is intended for educational use, starting with
middle-schoolers. So we shouldn't underestimate both the LLM's ability to
generate inappropriate content, and the user's ability to be creative and
persistent in asking for it.

I'm even thinking this could be a pre-chat guardrail that EVERY chat endpoint
goes through. So we don't have to check for abuse in every single chat prompt,
conflating concerns, and make it general.

## user profile customization

Account creation and onboarding collects personal info to tailor LLM responses
to the user.

## neon RLS and OAuth

setup Neon Oauth, and row-level security so that an authenticated user cannot
access a journey or any related row (chapter or message)

## Refactor the "canonical path" logic

The "canonical path" logic is a bit messy. It has global functions for
generating the paths, but nothing to compare an existing slug. Right now we're
comparing constructed strings to the journey's root canonical path. We should
make it easy, using shared primitives, for a page server component to quickly
check its slug or slugs against the canonical slug, and redirect if necessary.

## Accordion visual glitches

- The first syllabus item in the syllabus panel, the one that links to the
  syllabus chat, is not styled the same as the other syllabus items.
- The chapter items in the syllabus panel function both as accordion items and
  navigation items. The UX is unclear: clicking opens the accordion, but
  navigates to the chapter page simultaneously.

## Stop generating text when the user navigates away from a page

We need to call `stop` on the chat hook when the user navigates away from a
page, otherwise the model will continue generating text in the background,
wasting tokens and money.

## Pagination

We should paginate get functions that return arrays of resources. Maybe just
journeys? Chapters will always be pretty limited in a single journey. Messages,
we may just want to make sure we always show all messages in one go? No
"infinite scroll" or "load more" buttons.

## Find a better name for the project

The project is currently called "Journey" which is generic and stupid. The repo
is named "teacher" which doesn't make sense either. We should work our way to
finding a better name for the project.

## Conversation branching

Currently, or at least after we are done with the delta message transport, the
conversation is linear. When a user edits a user message or regenerates an
assistant message, every message after that message is deleted. We should find a
way to support a full conversation tree, with branching. And add controls to
navigate between branches in the UI.
