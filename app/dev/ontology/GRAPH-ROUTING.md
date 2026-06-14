# Schema graph — edge and handle routing

How relationships become edges, how handles are chosen, and how to reason about clean layouts.

## Pipeline

```
ontology.mdc properties
  → parse-ontology: buildRelationships()
  → SchemaGraph: buildRelationshipHandles() + getRelationshipHandleId()
  → SchemaNode: render handles + computePartnerAlignedHandleTops()
  → libavoid: route edges around node obstacles
```

## Step 1 — Which edges exist?

`buildRelationships()` in `lib/dev/parse-ontology.ts` scans every reference property on every type and emits **one edge per type-pair** (deduped by sorted pair key).

Property names (`sourceProperty` / `targetProperty`) are used for edge labels and the detail panel only — not for handle placement.

| Edge                       | Source type  | Target type  |
| -------------------------- | ------------ | ------------ |
| Person ↔ Organization      | Person       | Organization |
| Person ↔ Interaction       | Person       | Interaction  |
| Organization ↔ Interaction | Organization | Interaction  |

Edge direction follows the **first** raw ref in parse order. Cardinality comes from whether each side's property is an array (`many`) or scalar (`one`).

## Cardinality icons — edges only, not handles

Relationship cardinality (`one` vs `many`) is shown **only on the edge**, via SVG markers in `CardinalityEdge.tsx`:

| Marker                      | Meaning |
| --------------------------- | ------- |
| Crow's foot (three prongs)  | `many`  |
| Single vertical bar + cross | `one`   |

**Handles are neutral dots on the node border.** They do not encode cardinality or map to a property row. To change how a relationship reads visually, update the edge markers in `CardinalityEdge` — not the handle shape.

Cardinality data flows:

```
ontology property type (array vs reference)
  → parse-ontology: sourceCardinality / targetCardinality on RelationshipEdge
  → SchemaGraph: edge.data.sourceCardinality / targetCardinality
  → CardinalityEdge: crowFootMarkerPath() vs oneMarkerPath() per end
```

If an edge shows `one` when the schema property is `array[]`, check that `referenceTarget` was inferred for the reciprocal property in `extractReferenceTargetsFromRawYaml`. A missing reciprocal defaults `targetCardinality` to `one` even when the source side is `many`.

## Step 2 — Which handle owns an edge?

**Rule: one handle per relationship end, keyed by `relationshipId`.**

On each node, `buildRelationshipHandles()` walks `schema.relationships`:

- If this node is `sourceType` → **source** handle on the **right**
- If this node is `targetType` → **target** handle on the **left**

`SchemaGraph` wires edges with:

```ts
sourceHandle = getRelationshipHandleId(sourceData, relationship.id, "source");
targetHandle = getRelationshipHandleId(targetData, relationship.id, "target");
```

Each relationship gets its own handle pair. Handles are not shared across edges.

## Step 3 — Where on the node does the handle sit?

Handles are **node-level attachment points** on the left or right border. They are not aligned to property rows.

**Handle Y is chosen by our layout logic, not libavoid.** libavoid routes between fixed pins; it does not pick which handle to use.

`computePartnerAlignedHandleTops()` runs after dagre positions nodes:

1. For each handle, read the **partner node's vertical center** in flow coordinates
2. Convert to a node-relative `top` for that handle
3. On each side, **nudge colliding handles apart** (`MIN_HANDLE_GAP`) while staying inside the node body

So Person→Interaction uses handles at roughly the same height on both nodes when dagre places them level — not top-on-one-side / bottom-on-the-other from alphabetical slot assignment.

When a node is dragged, handle positions recompute from current partner positions and libavoid shapes invalidate via `getHandleLayoutSignature`.

## Transit clearance — moving nodes away from unrelated edges

libavoid routes around node **shapes**, but a routed edge can still run horizontally **just above or below** a node in the middle column (e.g. Person→Interaction clipping Organization). The edge path is fine; the **obstacle node** needs to shift.

`graph-clearance.ts` runs in two passes:

1. **Post-dagre** (`adjustTransitClearance`) — estimates transit Y from handle/partner centers before first paint
2. **Post-libavoid** (`computeRouteClearanceOffsets`) — inspects actual horizontal segments from routed waypoints; nudges obstructing nodes by `dy` (up to 4 iterations)

For each edge, any node sitting in the horizontal corridor between source and target (excluding endpoints) is checked. If a horizontal segment passes within `TRANSIT_NODE_CLEARANCE` (52px + label padding) of that node's bounds, the node moves down or up — whichever needs less travel — until clear.

## Reasoning framework — cleanest lines

### 1. One handle per edge end

Never share handles across relationships. One edge → one source handle + one target handle.

### 2. Layout direction (dagre)

Dagre uses `rankdir: "LR"`. Sources exit **right**, targets enter **left**.

### 3. Partner-aligned handle Y (our logic)

Match each handle's Y to its connected node's center. This is separate from dagre (node positions) and libavoid (orthogonal paths between pins).

### 4. Separate handles before routing

`MIN_HANDLE_GAP` (56px) between handles on the same side. When partner nodes align vertically and ideals would crowd, handles **spread evenly** across the full side instead of stacking at minimal separation.

### 5. Route around obstacles (libavoid)

Shapes match measured node bounds with `shapeBufferDistance` 28px; paths nudge with `idealNudgingDistance` 24px. Dagre uses `nodesep` 140 / `ranksep` 280 for node spacing.

## Known tensions

| Choice                      | Benefit                                 | Cost                                                 |
| --------------------------- | --------------------------------------- | ---------------------------------------------------- |
| One handle per relationship | Unambiguous edge wiring                 | More handles on busy types                           |
| Node-level handles          | Simple, no false property-row semantics | Edge may not visually "belong" to a field            |
| Partner-aligned handle Y    | Horizontal-ish edges, fewer diagonals   | Recomputes on drag; libavoid does not choose handles |
| Pair dedup in parser        | Simple graph (3 edges not 6)            | Edge direction follows parse order                   |

## Future improvements

- Stable relationship parse order independent of YAML property declaration order
- Iterative refinement: adjust dagre ranks using handle alignment cost
