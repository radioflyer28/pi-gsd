/** Reviewed adapter coverage, not a claim that every upstream workflow has run. */
export const GSD_RUNTIME_ROLES = [
  "gsd-advisor-researcher", "gsd-ai-researcher", "gsd-assumptions-analyzer",
  "gsd-code-fixer", "gsd-code-reviewer", "gsd-codebase-mapper", "gsd-debugger",
  "gsd-doc-classifier", "gsd-doc-synthesizer", "gsd-doc-verifier", "gsd-doc-writer",
  "gsd-domain-researcher", "gsd-eval-auditor", "gsd-eval-planner", "gsd-executor",
  "gsd-framework-selector", "gsd-integration-checker", "gsd-intel-updater",
  "gsd-mempalace-curator", "gsd-nyquist-auditor", "gsd-pattern-mapper",
  "gsd-phase-researcher", "gsd-plan-checker", "gsd-planner", "gsd-project-researcher",
  "gsd-research-synthesizer", "gsd-roadmapper", "gsd-security-auditor",
  "gsd-ui-auditor", "gsd-ui-checker", "gsd-ui-researcher", "gsd-user-profiler", "gsd-verifier",
] as const;

export const GSD_EXCLUDED_ROLES = {
  "gsd-debug-session-manager": "Nested dispatch is not granted; dedicated debug/checkpoint adaptation is deferred.",
  "gsd-dom-verifier": "Requires approved Chrome browser MCP providers; the baseline cannot perform live-DOM verification.",
} as const;

// New upstream scripts must receive an explicit disposition during integration review.
// Only the two existing opt-in guards are enabled by this adapter.
export const GSD_HOOK_PARITY = {
  "gsd-write-guard.js": "bridged-opt-in",
  "gsd-worktree-path-guard.js": "bridged-opt-in",
  "gsd-prompt-guard.js": "deferred-input-mapping",
  "gsd-read-guard.js": "deferred-advisory-delivery",
  "gsd-workflow-guard.js": "deferred-input-mapping",
  "gsd-secret-read-guard.js": "deferred-fail-closed-policy",
  "gsd-read-injection-scanner.js": "deferred-advisory-delivery",
  "gsd-session-state.sh": "deferred-shell-lifecycle",
  "gsd-validate-commit.sh": "deferred-shell-lifecycle",
  "gsd-phase-boundary.sh": "deferred-shell-lifecycle",
  "gsd-graphify-update.sh": "deferred-shell-lifecycle",
  "gsd-context-monitor.js": "deferred-context-lifecycle",
  "gsd-ensure-canonical-path.js": "not-needed-package-local-paths",
  "gsd-path-export.js": "not-needed-gsd-tool",
  "gsd-check-update.js": "not-used-pi-package-updates",
  "gsd-update-banner.js": "unsupported-claude-statusline",
  "gsd-statusline.js": "unsupported-claude-statusline",
  "gsd-agent-isolation-guard.js": "unsupported-claude-agent-argument",
  "gsd-config-reload.js": "unsupported-file-change-event",
  "gsd-check-update-worker.js": "internal",
  "gsd-node-runner.sh": "internal",
  "gsd-cursor-post-tool.js": "other-runtime",
  "gsd-cursor-pre-tool.js": "other-runtime",
  "gsd-cursor-session-start.js": "other-runtime",
  "gsd-cursor-stop.js": "other-runtime",
  "gsd-cursor-subagent-start.js": "other-runtime",
  "gsd-cursor-subagent-stop.js": "other-runtime",
  "gsd-windsurf-pre-command.js": "other-runtime",
  "gsd-windsurf-pre-write.js": "other-runtime",
} as const;
