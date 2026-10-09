# OpenAI model options: official documentation readback

2026-10-07, read-only documentation observation. This is external API evidence, not owner acceptance, a live account check, or price evidence.

- [GPT-6 Luna](https://developers.openai.com/api/docs/models/gpt-6-luna): reasoning effort includes none; Chat Completions function calling is supported with reasoning_effort none. Streaming and structured outputs are listed as supported.
- [Chat Completions create](https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create): max_completion_tokens bounds generated output including reasoning tokens.

The accepted repository contract omits temperature for Luna. This observation does not assert temperature is forbidden with none. No new model selection, SDK upgrade, paid call, credential use or deployment was performed. Local mocked requests establish serializer behavior only.
