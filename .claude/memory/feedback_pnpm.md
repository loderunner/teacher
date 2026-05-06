---
name: Use pnpm for dependency management
description: Never edit package.json directly; always use pnpm commands to add/remove/update dependencies
type: feedback
---

Never edit `package.json` directly to manage dependencies. Always use `pnpm` commands:
- `pnpm add <pkg>` to add
- `pnpm remove <pkg>` to remove
- `pnpm add <pkg>@<version>` to pin a version

**Why:** User preference — direct edits to package.json bypass pnpm's lockfile management and can cause inconsistencies.

**How to apply:** Any time a dependency needs to be added, removed, or changed, run the appropriate `pnpm` command instead of editing `package.json`.
