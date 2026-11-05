<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Local development

The Next.js app in this directory talks to Supabase. Cloud Agents start a local Supabase stack with the CLI (`SUPABASE_EXPERIMENTAL_STACK=1`, native runtime) and then `npm run dev` on port 3000. `supabase/config.toml` expects `supabase/seed.sql`; that file is not in git, and the boot script creates an empty one when it is missing.

Local login, created on boot when it is absent: `dev@nedjm-froid.local` / `LocalDev123!` (SUPER_ADMIN). Do not point this password at the hosted project.

Leave `SUPABASE_DB_PASSWORD` unset for local Supabase commands. That variable overrides the local database password.

From this directory: `npm run dev`, `npm test`, `npm run build`. `npm run lint` is the ESLint check.
