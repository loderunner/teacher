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
back to the journey page, they can resume building their syllabus in chat. In
fact, the syllabus draft chat should still be available to peruse, kind of like
a "Chapter 0".

## Show a "diff" of the syllabus draft when the model updates it

When the model updates the syllabus draft, it should show a "diff" of the
previous draft and the new draft in a collapsed section within the "Updated
syllabus" message, similar to the Reasoning collapsible. Not a strict code diff,
but still a terse added/removed/changed list of edits.

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

## Change memory from single string to string array

The memory is currently a single markdown string. We should instead have a list
of memories, and only append to memories. The prompt should mention that if two
memories contradict, the more recent memory should be used.

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

## CI

Run linter and tests and migrations before deploying.

## Mobile UI

This app was designed with desktop in mind, but now we're going to have to adapt
it to mobile.

### Welcome chat

- padding around content (top bar is fine)
- reduce hero font, make sure it fits in the screen width
- teaching style either centered or right-aligned

### Syllabus chat

- i can only see the syllabus sidebar in the viewport. how can we hide it and
  make it displayable without taking up too much screen real estate?

## user profile customization

Account creation and onboarding collects personal info to tailor LLM responses
to the user.

## neon RLS and OAuth

setup Neon Oauth, and row-level security so that an authenticated user cannot access a journey or any related row (chapter or message)