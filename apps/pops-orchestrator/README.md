# @pops/orchestrator

Cross-pillar orchestrator service. A standalone container that federates over the pillars via `@pops/pillar-sdk` (REST by default) and owns no domain DB — it registers with the core registry like a pillar (opt-in via `POPS_REGISTRY_ENABLED`) and exposes `/health` + a federated `/pillars` view on port `3009`.

This is the C2 foundation (ADR-029, epics 06+07). Federated search (epic 06), the AI-tool registry (epic 07), the cross-pillar embeddings pipeline, and the deployment `Dockerfile` land in follow-up increments.
