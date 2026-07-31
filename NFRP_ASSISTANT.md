# NFRP local assistant

The optional assistant uses Ollama as a local planner and a closed catalog of application tools. The tools read data through Prisma and return summaries; they do not execute arbitrary SQL and expose no create, update, confirmation or deletion commands.

The demo profile starts with `ASSISTANT_ENABLED=false`. For an isolated demonstration, start the Compose `assistant` profile, download a compatible model separately and enable the variable. Prompts and results may contain data loaded into the environment, so use only the synthetic dataset.

Limitations that must be addressed before public use include rate limiting, quotas, granular per-tool authorization, prompt-retention policies and prompt-injection testing. Authentication at the route boundary does not replace these controls.
