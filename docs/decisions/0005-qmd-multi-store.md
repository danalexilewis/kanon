# 0005. Several QMD stores in one process

- Status: accepted
- Date: 2026-10-11

## Context

Each index is its own SQLite file. The MCP server may open more than one.
QMD lazy-loads embedding models per store.

## Decision

v0.1 opens one store per granted index in-process and uses **lexical**
search by default. Semantic and hybrid are explicit. Do not share QMD's
global `~/.config/qmd`. If model memory becomes a problem, move embedding
work to a worker later.

## Spike

`test/qmd-multistore.test.ts` opens two lexical stores against fixture
copies and records RSS. Lexical does not require a model download.
