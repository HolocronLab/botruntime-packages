---
"@holocronlab/botruntime-adk": patch
---

Made generated script and bot dependencies hermetic under Bun's isolated workspace linker by routing script bootstrap through the runtime facade and reconciling the generated runtime/SDK links to the agent's selected dependency graph.
