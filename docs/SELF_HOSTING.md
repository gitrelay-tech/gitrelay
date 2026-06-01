# Self-hosting GitRelay

GitRelay is a standard Next.js app and runs anywhere Node.js does.

## Prerequisites

- Node.js 20+
- pnpm
- At least one LLM API key

## 1. Build

```bash
pnpm install
pnpm build
```

## 2. Environment

Set these in your host's environment (or `.env.local`):

```ini
GITRELAY_QUICK_LLM=google
GOOGLE_GENERATIVE_AI_API_KEY=...
VIEWS_IP_SALT=<random 32-byte hex>   # REQUIRED in production
```

Generate a salt:

```bash
# macOS / Linux
openssl rand -hex 32

# PowerShell
-join ((1..32) | ForEach-Object { '{0:x2}' -f (Get-Random -Max 256) })
```

## 3. Run

```bash
pnpm start   # serves the production build on :3000
```

## Deploying to Vercel

1. Import the repository.
2. Add the environment variables above in **Project → Settings → Environment Variables**.
3. Deploy. Vercel auto-detects Next.js.

## Optional services

| Service | Enables |
| --- | --- |
| Supabase | Response caching, Prompt Library, auth |
| Stripe | Premium subscriptions |
| GitHub token | Higher GitHub API rate limits |

All three are optional — the core "repo → prompt" flow works with just an LLM key.
