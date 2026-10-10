# 0004. Local project identity and its limits

- Status: accepted
- Date: 2026-10-11

## Context

The first interface is a local CLI and stdio MCP. There is no identity
vendor yet.

## Decision

A project is a string id in machine config. `kanon mcp --project <id>`
treats that id as the principal and applies grants. This prevents
accidental cross-project reads.

## Consequences

A hostile agent on the same OS account can still read config and indexes.
Say so in the threat model. Real credentials wait for private HTTP.
