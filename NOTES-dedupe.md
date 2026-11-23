# Briefly embedding dedupe — results

Last updated: 2026-11-24 04:27 Asia/Dhaka

## Live
- App: https://briefly-as0b.onrender.com
- Repo: https://github.com/naimulhsn/briefly (main `26fc548`, includes `9e4b747` and `02f135e`)
- Render service `srv-dc1up9ifngtc738npr60`, deploy `dep-dc2bp2jrjlhs73af6t00` live
- Health: ok, processor=gemini, providers=["gemini"], embedder=gemini:gemini-embedding-001, database=turso
- Users: 2 (persisted on Turso). NovelAudioReader was not touched.

## Counts
- Before any embedding recluster: 1,727 articles, 1,465 stories
- After first live recluster (embeddings on the newest 800 articles): 1,465 → 1,327 stories (138 merged)
- Ingest then added more articles (2,818 total). A failed Turso save left 999 unlinked; ingest run 4 (02f135e) clustered and saved them (0 unlinked now)
- After tighter heuristics + split-capable recluster: 2,152 → 2,196 stories (44 over-merged stories split). Max cluster size 186 → 95
- All 2,152 older stories have summaries; 86 use a Gemini processor. 28 clusters in ingest run 4 were summarized with gemini-flash-lite-latest (some batches fell back after Gemini 503s)

## Example
- Tongi gas-cylinder house fire is one story (id 1388, 46 Bangla+English articles): "Three injured in Tongi gas cylinder leak fire"
- World Toilet Day in Tongi, Tongi college theft, Lalbagh restaurant gas explosion, and Hazaribagh house explosion stayed separate
- A 186-article Gazipur jumble (protests mixed with unrelated political stories) split; the remaining 95-article story is wage-protest / highway-blockade coverage. One English singleton still has the same title and should merge once embeddings can run again (Gemini embed quota was exhausted; typically resets around 2:00 PM Asia/Dhaka)

## Stack
- Embeddings: gemini-embedding-001, 768-d, SEMANTIC_SIMILARITY, L2-normalised; cosine 0.90 (soft 0.85 + heuristic 0.24); 72h window; title/entity heuristics as backup. Optional Jina/Cohere if keys are added. Local multilingual models were rejected for a 512MB Render instance.
- Summarization router (keys optional): gemini-flash-lite-latest, then Groq, OpenRouter :free, Cerebras, Mistral, Cloudflare Workers AI. Only the Gemini key is on the service today. Gemini free-tier 503s are handled with a 25s timeout and heuristic fallback.

## Optional keys (do not block)
- Groq: https://console.groq.com
- OpenRouter: https://openrouter.ai
- Cerebras (trial, payment method): https://inference.cerebras.ai
- Cloudflare Workers AI (account id and Workers key)
- Jina embeddings: https://jina.ai
- Cohere trial embeddings: https://dashboard.cohere.com
