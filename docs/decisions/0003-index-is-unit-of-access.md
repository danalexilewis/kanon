# 0003. An index is the unit of access

- Status: accepted
- Date: 2026-10-11

## Context

QMD collections are retrieval handles. Unknown MCP parameters are ignored,
so a typo can widen a search. A shared process that can see every
collection can leak by filter failure.

## Decision

Each index is its own QMD SQLite file, built from one or more sources. A
project is granted indexes. The MCP server opens only those files.

## Consequences

Authorization is "which files are mounted", then operation policy. A
collection name is not an authorization boundary.
