# GSD Review Loop

Use GSD Core as the source of truth for the workflow.

1. Inspect GSD project state.
2. Identify the current phase or slice.
3. If `pi-subagents` is available, run a fresh reviewer for correctness and a second reviewer for tests/verification.
4. If `context-mode` is available, use `ctx_execute` or `ctx_execute_file` for large diffs, logs, and test output.
5. Synthesize only actionable findings.
6. Apply fixes through the normal GSD workflow.
