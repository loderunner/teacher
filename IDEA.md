# Tutorial app

I want to create an app so that my teenager son can "teach himself anything with AI". I think he's mostly interested in code tutorials to build games today, but pretty much anything else goes.

## User journey

### Welcome page

This should appear as a chatbot, similar to Claude or ChatGPT UI. Start with a big welcoming prompt.
When the user enters what they want to learn about / what tutorial they want, the first interaction is to establish a complete Syllabus of the course/tutorial. The Syllabus will establish a number of chapters and sections,
with a summary of the contents for each chapter & section.
The user can iterate in a chat style on the exact contents of the lesson/tutorial, until satisfied. While building out the Syllabus in chat, the UI shows the Syllabus in a sticky panel so that the user can see the current
state at a glance, without needing to scroll back on the conversation. When the user is statisfied, they can START the lesson/tutorial.

### Transition to Lesson page

At this point, before transitioning into teaching mode, the app persists:

- A generated Title for the lesson/tutorial
- The complete Syllabus
- A summarized Memory of the Syllabus creation chat, where it stores all of the subtext, contextual signals, peripheral information... How the user prefers to be addressed, their knowledge level about the topic, the type of knowledge they are looking for (in-depth vs. surface), things the user might prefer or avoid... No specifics here, the agent should be able to infer the important information to commit to Memory.

This set of data constitutes the state at the start of the lesson/tutorial. Now the system can store this, giving it an identity, a URI, and the user will be able to revisit/resume the lesson/tutorial at a later date.

### Chapter 1 page

The Lesson/Tutorial page is a standard chat window. Just make sure the assistant messages render markdown with syntax coloring for code blocks. Once the agent assumes the chapter or section is finished, a link appears "Go to the next chapter". The user can continue the conversation in the chat, however. The Agent also prompts the user if they want to move to the next chapter or section in chat.

During the conversation, if the agent spots elements of conversation that could affect the Syllabus or the Memory, it takes action:

- If the Syllabus is affected, prompt the user for a change to the Syllabus, and change the Syllabus on confirmation
- If the Memory is affected, the Agent silently adds, removes from, or updates the Memory for upcoming conversations.

### Transition to next chapter

When the user moves to the next chapter, the Agent summarizes the previous chapter: what was covered, what was learned, what was created, the state of the knowledge or tutorial at this point.

This will be passed to the next chapter so the Agent can continue where it left off, keeping the context, and can refer to previous steps.

### Chapter 2+ page

All chapter pages are alike, they just start at a different part of the lesson/tutorial. A user can revisit previous chapters, but never skip ahead to new chapters without completing the current chapter.

## Tech stack

A Next.js web app, but build it as an SPA: pure frontend in App routing, pure backend in `api`.

UI uses shadcn/ui & TailwindCSS. Don't do _any_ styling yet. Stick to the brutalist black & white default approach from shadcn/ui.

For the AI parts, use Vercel AI SDK, Vercel AI Elements, and streamdown.

Project will be deployed on Vercel

Use Neon Postgres for database through the Vercel integration, and use Drizzle ORM for the database layer. Use Vercel Blob for anything that can go to object storage.

Use https://github.com/loderunner/eslint-config, insofar as it does not conflict with Next.js ESLint rules.

Use Clerk for Auth

## TODO

There are a number of things left undecided:

- Name of the project
- I'd like to have several teaching Styles, that the user can pick before they start chapter 1. Two baseline styles: "teacher" and "tutorial". "Teacher" goes in depth over long, well-written messages. "Tutorial" uses shorter messages, moves step by step, always gives the user something to do or try before continuing. I'd also like the user to be able to create custom styles. Elements from Memory can affect the Style, so the system prompt will need to be built accordingly.
- Find a name for "lesson/tutorial" concept.
- Login / Logout / Account / Settings pages
- How to show past lessons/tutorials
- how to show where we currently are in the Syllabus and allow navigation across the lesson pages from the Syllabus (and the generated conversations)
