# Schema graph — layout and routing

How the ontology dev tool builds the ER graph: edges, handles, libavoid routing, and transit clearance.

**Agent index:** `.cursor/rules/ontology-dev-tool.mdc` (glob-loaded for `app/dev/ontology/**`, `lib/dev/**`).

---

## File map

| File                        | Role                                                             |
| --------------------------- | ---------------------------------------------------------------- |
| `lib/dev/parse-ontology.ts` | Parse `ontology.mdc` → types, relationships, coverage, sources   |
| `lib/dev/types.ts`          | `RelationshipEdge`, `SchemaNodeData`, `SchemaRelationshipHandle` |
| `SchemaGraph.tsx`           | Build nodes/edges, dagre layout, transit clearance pass 1        |
| `schema-handles.ts`         | Handle construction, partner-aligned Y, collision spread         |
| `graph-clearance.ts`        | Transit corridor detection, node `dy` nudges                     |
| `SchemaNode.tsx`            | ER node UI + handle dots                                         |
| `useLibavoid.ts`            | WASM router, pins, waypoints, transit clearance pass 2           |
| `CardinalityEdge.tsx`       | Orthogonal path + crow's foot / one markers                      |
| `SchemaDetailPanel.tsx`     | Relationship list with cardinality text                          |

---

## Pipeline

```
ontology.mdc (YAML)
  → parse-ontology: buildRelationships()
  → SchemaGraph: buildRelationshipHandles() + dagre layout
  → graph-clearance: adjustTransitClearance()        [pass 1]
  → SchemaNode: computePartnerAlignedHandleTops()
  → useLibavoid: route edges around node shapes
  → graph-clearance: computeRouteClearanceOffsets()  [pass 2, ≤4×]
  → CardinalityEdge: render path + cardinality icons
```

Each layer has a fixed job. **libavoid does not choose handles.** **dagre does not clear transit corridors.** Our code owns handle Y and obstacle-node nudges.

---

## Edges (parser)

`buildRelationships()` in `lib/dev/parse-ontology.ts` scans reference properties and emits **one edge per type-pair** (deduped by sorted pair key).

| Edge                       | Source       | Target       |
| -------------------------- | ------------ | ------------ |
| Person ↔ Organization      | Person       | Organization |
| Person ↔ Interaction       | Person       | Interaction  |
| Organization ↔ Interaction | Organization | Interaction  |

- **Direction** — first raw ref in parse order (entities first, properties top-to-bottom).
- **Cardinality** — `array` → `many`, scalar reference → `one` on each end via reciprocal property.
- **Labels** — `sourceProperty` / `targetProperty` for edge label and inspector only; not handle placement.

**Parser gotcha:** `extractReferenceTargetsFromRawYaml` must resolve property names by **line index**. Duplicate comment lines like `type: reference # to Person entities` break `indexOf` and drop reciprocals (wrong `one` cardinality).

---

## Cardinality icons (edges only)

| Marker      | Meaning |
| ----------- | ------- |
| Crow's foot | `many`  |
| Bar + cross | `one`   |

Handles are neutral border dots. Change `CardinalityEdge.tsx` markers to change cardinality display — not handle shape.

```
ontology array vs reference
  → RelationshipEdge.sourceCardinality / targetCardinality
  → edge.data in SchemaGraph
  → CardinalityEdge crowFootMarkerPath() vs oneMarkerPath()
```

---

## Handles

**Rule:** one handle per relationship end, keyed by `relationshipId`.

- Source type → **right** (`source`)
- Target type → **left** (`target`)
- Wired via `getRelationshipHandleId(data, relationship.id, "source" | "target")`

Handles are **node-level** — not aligned to property rows.

### Partner-aligned Y (`schema-handles.ts`)

After dagre positions nodes:

1. Each handle's ideal Y = **partner node vertical center** (flow coords → node-relative `top`)
2. Colliding handles on the same side: nudge apart (`MIN_HANDLE_GAP` 56px)
3. If partner ideals crowd: **spread evenly** across the full side

Recomputes on drag via `useStore` in `SchemaNode`. Invalidates libavoid shapes via `getHandleLayoutSignature`.

| Constant         | Value |
| ---------------- | ----- |
| `MIN_HANDLE_GAP` | 56    |
| `SIDE_INSET`     | 18    |
| `HEADER_HEIGHT`  | 36    |
| `ROW_HEIGHT`     | 24    |

---

## libavoid (`useLibavoid.ts`)

- WASM: `public/libavoid.wasm`
- Node shapes = measured bounding boxes
- Pins = React Flow `handleBounds` (handle center, connection direction from side)
- Writes intermediate waypoints to `edge.data.points` (excludes source/target)
- `CardinalityEdge` builds path: source → waypoints → target

| Parameter              | Value |
| ---------------------- | ----- |
| `shapeBufferDistance`  | 28    |
| `idealNudgingDistance` | 24    |

---

## Transit clearance (`graph-clearance.ts`)

**Problem:** libavoid routes around node shapes, but a horizontal segment can still run just above/below an unrelated node in the middle column (e.g. Person→Interaction clipping Organization). The edge is fine; the **obstacle node** must move.

**Solution:** detect transit corridors and nudge obstructing nodes vertically.

### Pass 1 — post-dagre (`adjustTransitClearance`)

Before first paint. Estimates transit Y from partner-aligned handle centers (or node center fallback). Any node between source.right and target.left (excluding endpoints) within clearance → `dy` nudge.

### Pass 2 — post-libavoid (`computeRouteClearanceOffsets`)

After routed waypoints exist. Scans **horizontal segments** in each edge polyline. Obstructing node in corridor + segment within clearance → `dy` nudge. Up to **4 iterations** (`MAX_ROUTE_CLEARANCE_PASSES`); resets on `layoutKey` change.

| Constant                 | Value                      |
| ------------------------ | -------------------------- |
| `TRANSIT_NODE_CLEARANCE` | 52                         |
| `LABEL_CLEARANCE`        | 16 (extra for edge labels) |
| `SCHEMA_NODE_WIDTH`      | 280                        |

**Push logic:** compute `pushDown` vs `pushUp` to place node clear of segment Y; take smaller movement. Merge per-node: keep largest absolute offset.

---

## dagre (`SchemaGraph.tsx`)

| Setting   | Value                               |
| --------- | ----------------------------------- |
| `rankdir` | `LR`                                |
| `nodesep` | 140 (vertical gap, same rank)       |
| `ranksep` | 280 (horizontal gap, between ranks) |

Sources exit right; targets enter left.

---

## Debugging checklist

| Symptom                                    | Check                                                                |
| ------------------------------------------ | -------------------------------------------------------------------- |
| Edge shows `one` but property is `array[]` | Reciprocal `referenceTarget` in parser (line-index bug)              |
| Top handle → bottom handle diagonal        | Partner-aligned Y not running; stale handle tops                     |
| Handles crowded on one side                | `MIN_HANDLE_GAP` / `spreadEvenlyInZone` in `resolveHandleCollisions` |
| Edge clips unrelated node                  | `graph-clearance` passes; bump `TRANSIT_NODE_CLEARANCE`              |
| Edge floats off handles                    | Handle bounds vs libavoid pins; shape signature stale                |
| Path through node                          | `shapeBufferDistance`; measured width/height zero                    |

---

## Known tensions

| Choice                      | Benefit                                 | Cost                                       |
| --------------------------- | --------------------------------------- | ------------------------------------------ |
| One handle per relationship | Unambiguous wiring                      | More handles on busy types                 |
| Node-level handles          | No false property semantics             | Edge doesn't "belong" to a field visually  |
| Partner-aligned Y           | Horizontal-ish edges                    | Recomputes on drag; not libavoid's job     |
| Transit clearance           | Clean corridors without rerouting edges | Extra layout passes; may fight manual drag |
| Pair dedup in parser        | 3 edges not 6                           | Edge direction follows parse order         |

---

## Future improvements

- Stable relationship parse order independent of YAML property order
- Dagre rank cost using handle alignment / transit clearance preview
- Optional user lock on manually placed nodes (skip clearance nudge)
