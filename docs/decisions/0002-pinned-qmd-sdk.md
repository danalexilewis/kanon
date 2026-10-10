# 0002. Pin the released QMD SDK

- Status: accepted
- Date: 2026-10-11

## Context

QMD v2.8.3 (16 August 2026) is the latest release. Main-branch metadata
filtering is unreleased. The operator's global QMD config already contains
leaked fixture collections.

## Decision

Depend on `@tobilu/qmd@2.8.3`. Always pass an explicit `dbPath` and inline
or local config. Never read or write `~/.config/qmd`. Do not use
unreleased metadata filtering as an authorization boundary.

## Consequences

Lexical search works without models. Semantic/hybrid are opt-in. Tests
sandbox `QMD_CONFIG_DIR`.
