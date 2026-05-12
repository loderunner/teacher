# TODO

## Tool calls & follow-up message

The AI term should never end on a tool call. After calling a tool, if the turn
is finished, the LLM should always send a follow-up message to the user, just to
make the conversation feel more natural. Maybe this needs a multi-turn LLM call?
Or maybe an agentic loop? Should this be done on our side or on the provider's
side? Read Anthropic blogs and docs, and AI SDK docs, and discover optimal
practices.

The user should also be able to uncollapse a tool call to see its details.

## Layout & scrollability

The syllabus can grow quite long and the Syllabus panel grows quite tall. This
pushes the chat input out of view. The Syllabus panel should be scrollable,
wider on wide screens, and only details of a single chapter should be
disclosable at a time.

The messages view also pushes the prompt input box out of view. The messages
view should be scrollable, and the prompt input box should be at the bottom of
the screen. Additionally, the width of the messages and prompt input box are
very wide on a wide screen. The width should be constrained to feel legible.

In general, the UI should feel app-like, where interactive elements (prompt
input box, buttons, etc.) appear in fixed positions on the screen, and dynamic
content (messages, syllabus draft, etc.) occupies a fixed size in which the
content is scrollable.

## Locale picker

It's nice that the locale is automatically detected from the browser, but it
would be nice to have a locale picker in the top bar.

## RPG teaching style

Another approach to learning would be for the model to teach through a
role-playing game, where the user would solve puzzles, complete tasks, and
progress through a story. The model would be the storyteller, create and submit
the puzzles and tasks, and the user would solve them. The model would then
assess the solution, and either continue with the story, or guide the user teach
and to try again.

## Question tool

In the syllabus chat, the model should be able to ask questions to the user to
help it understand the user's needs better. This could be done by giving the
model a question tool, and the user answering the question. The model would then
use the answer to understand the user's needs better, and generate a more
appropriate response. Similar to Anthropic's `AskUserQuestion` tool:
https://code.claude.com/docs/en/agent-sdk/user-input.md

## Dark mode selector

Select between light, dark, and system themes in the top bar.

## Show thinking content

The user should be able to see the model's thinking content in the chat
interface as it's streaming. The thinking content should be closed in a
collapsible section by default. The height of the collapsible section should be
fixed, as thinking content can be quite long. The collapsible section should
have a title like "Thinking..." and a pulsing animation to indicate that the
model is thinking. The content should be scrollable.

## First visit

On first visit, before the chat has started, the prompt input box should appear
at the center of the screen, and the syllabus draft panel should be hidden.
After the user sends their first message, the prompt input box should transition
to the bottom of the screen, and the syllabus draft panel should appear.
Ideally, the transition should be smooth and not jarring.

## Prettier tailwind plugin

Use prettier tailwind plugin, and make it support twMerge, clsx, and cn utility.
Also, create a tw`` template tag for tailwind classes in strings.

## Return to home page

When the user is on a journey page, and they click the "Return to home" button
in the top bar, they should be redirected to the home page.

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
