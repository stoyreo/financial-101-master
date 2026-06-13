# AI provider: local Ollama Gemma 4 (default) + Claude fallback

All AI-powered analysis in Financial 101 Master now routes through a single
module — [`src/lib/ai-provider.ts`](../src/lib/ai-provider.ts) — instead of
calling Anthropic directly.

## How it works

- **Default:** your local **Ollama** running **Gemma 4** (`gemma4`), reached at
  `OLLAMA_BASE_URL` (default `http://localhost:11434`).
- **Fallback:** Anthropic **Claude**. Used automatically only when Ollama can't
  be reached (laptop asleep, model not pulled, or running on a server like
  Vercel that can't see `localhost`). Requires `ANTHROPIC_API_KEY`.

Order is controlled by `AI_PROVIDER` (`ollama` = default, or `claude` to flip
the preference).

Every response carries an `x-ai-source` header / `provider` field of either
`ollama-gemma4` or `claude-live`, so you can see which engine answered.

## Setup on your Mac

```bash
# 1. Install Ollama → https://ollama.com/download
# 2. Pull Gemma 4 (default E4B variant)
ollama pull gemma4
# 3. Confirm it's serving
curl http://localhost:11434/api/tags
```

Then set in `.env.local` (defaults already match, so this is optional):

```env
AI_PROVIDER=ollama
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=gemma4
# ANTHROPIC_API_KEY=sk-ant-...   # only needed for cloud fallback
```

Want a bigger/smaller model? Set `OLLAMA_MODEL` to any pulled tag, e.g.
`gemma4:e2b` (edge), `gemma4:12b`, or `gemma4:31b`.

## Routes wired to the provider

- `POST /api/ai/chat` — Fin assistant (streaming)
- `GET  /api/ai/status` — availability probe (reports active provider + model)
- `POST /api/expenses/suggest-cuts`
- `POST /api/coach/forecast`
- `POST /api/investments/quick-insight` (streaming)
- `POST /api/investments/scenario-analysis`
- `POST /api/investments/preset-vectors`
- `POST /api/investments/pvd-forecast`
- `POST /api/investments/scbgoldhrmf-forecast`

`POST /api/payslip/extract` intentionally stays on Claude — it's image OCR,
which the Gemma text endpoint can't handle.
