# Contributing to GitRelay

Thanks for your interest in improving GitRelay! This guide covers everything you
need to get a change merged.

## Ground rules

- Be respectful — see the [Code of Conduct](CODE_OF_CONDUCT.md).
- Keep PRs focused. One concern per pull request.
- Match the surrounding code style; the linter is the source of truth.

## Local setup

```bash
pnpm install
cp .env.example .env.local   # add at least one LLM API key
pnpm dev
```

## Before you open a PR

```bash
pnpm lint     # ESLint
pnpm build    # type-check + production build
```

Both must pass. CI runs the same checks on every pull request.

## Branch & commit conventions

- Branch from `main`: `feat/<short-name>`, `fix/<short-name>`, `docs/<short-name>`.
- Write [Conventional Commits](https://www.conventionalcommits.org/):
  - `feat: add per-language prompt templates`
  - `fix: handle empty README in prompt builder`
  - `docs: clarify env setup`

## Pull request checklist

- [ ] `pnpm lint` passes
- [ ] `pnpm build` passes
- [ ] The change is described clearly in the PR body
- [ ] Screenshots/GIFs included for any UI change

## Where things live

| Area | Path |
| --- | --- |
| UI / pages | `app/`, `components/` |
| Prompt generation & LLM routing | `lib/`, `app/api/reverse-prompt/`, `app/api/custom-reverse/` |
| Caching / library / auth | `lib/supabase*.ts`, `app/api/library/` |
| Database migrations | `supabase/migrations/` |

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the bigger picture.

Happy hacking! 🔴
