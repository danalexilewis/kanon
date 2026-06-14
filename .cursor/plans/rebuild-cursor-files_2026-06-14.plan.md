---
Date: 2026-06-14
Status: Done
Last updated: 2026-06-14
Applies to: .cursor/ rules, skills, hooks, memory, README, SETUP
---

# Rebuild Kanon `.cursor` Files

Overhaul kanon's `.cursor/` setup to match evolved patterns from the strategy project and 2026 best practices: continual-learning plugin for memory, zero always-apply rules, agent-requested mode for procedural rules, progressive skill disclosure, and simplified hooks.

## Summary of changes

- **Memory**: continual-learning plugin + `AGENTS.md` + `.cursor/agents/agents-memory-updater.md`; removed `persistent-memory.mdc`, `memory.md`, `memory-reminder.js`
- **Rules**: zero always-apply; glob-scoped + agent-requested activation; deleted `references.mdc`, `placeholder-icons.mdc`
- **Hooks**: kept pipeline hooks; removed `on-stop.js` and `memory-reminder.js`; fixed `format-markdown.js`
- **Skills**: progressive disclosure with `references/`; added `plan/` and `commit/`; moved templates to `update-docs/references/templates/`
- **Docs**: README split into content vs developer workflows; SETUP updated

See the Cursor plan `rebuild_cursor_files_d4a7424e` for full detail.
