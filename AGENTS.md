<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

---

# Tech stack

| Concern | Choice |
|---|---|
| Framework | Next.js 16, App Router, TypeScript, React 19 |
| UI | shadcn/ui + Tailwind CSS v4, brutalist B&W defaults, no custom styling |
| Icons | `@phosphor-icons/react` |
| AI chat UI | AI Elements (primitives), Streamdown (markdown + streaming code blocks) |
| AI SDK | Vercel AI SDK — `streamText`, `generateObject`, tool calling |
| AI provider | Vercel AI Gateway → Anthropic `claude-sonnet-4-6` (plain `"provider/model"` strings — no provider-specific SDK imports) |
| Database | Neon Postgres (Vercel Marketplace) + Drizzle ORM (`drizzle-orm/neon-http` + `@neondatabase/serverless`) |
| Object storage | Vercel Blob |
| Auth | Clerk (Vercel Marketplace) + `@clerk/nextjs` |
| Package manager | pnpm — always use `pnpm add`/`pnpm remove`, never edit `package.json` directly |
| Test runner | Vitest |
| Lint | `next/core-web-vitals` + `eslint-config-loderunner` |
| Deploy | Vercel — pushes to `main` deploy automatically |
