# NEDJM FROID ERP

Cloud ERP for NEDJM FROID (BTPH & Maintenance) — Phase 1A Foundation.

## Layout

| Path | Role |
|------|------|
| `supabase/migrations/` (repo root parent) | PostgreSQL Phase 1A DDL applied to project `ykjqtprxgvdgkwzqxjky` |
| `nedjm-froid-erp/` | Next.js App Router application |

> The Next.js app lives in this folder because create-next-app rejected the parent directory name (`NedjmFroid_ERP`). Supabase config/migrations remain one level up.

## Setup

```bash
cd nedjm-froid-erp
cp .env.example .env.local
# Fill NEXT_PUBLIC_SUPABASE_ANON_KEY from Supabase Dashboard → API
npm run dev
```

## Auth checklist (Supabase Dashboard)

1. Disable public sign-ups (invite-only).
2. Enable TOTP MFA.
3. Invite the first user, then bootstrap `sys_users` + global `SUPER_ADMIN` via SQL (Studio) — chicken-and-egg before RLS allows admin UI.

## Brand

- Royal Blue: `#1E4DB7` (`--color-brand`)
- Light / dark via `next-themes`
