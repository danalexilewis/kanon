import {
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import type { ConnRef, PolyLine, Router, ShapeRef } from "libavoid-js";
import { AvoidLib } from "libavoid-js";
import {
  type Edge,
  type Node,
  useNodesInitialized,
  useReactFlow,
  useStore,
} from "@xyflow/react";
import type { SchemaNodeData } from "@/lib/dev/types";
import {
  applyNodeOffsets,
  buildRoutedEdgePaths,
  computeRouteClearanceOffsets,
  hasClearanceOffsets,
} from "./graph-clearance";
import { getHandlePosition, getHandleLayoutSignature } from "./schema-handles";

const WASM_URL = "/libavoid.wasm";
const MAX_ROUTE_CLEARANCE_PASSES = 4;

type UseLibavoidOptions = {
  layoutKey: string;
  setNodes: Dispatch<SetStateAction<Node[]>>;
};

type RoutablePolyLine = PolyLine & {
  get_ps?: (index: number) => { x: number; y: number };
};

/** Reads a point from a libavoid route polyline. */
function getRoutePoint(route: RoutablePolyLine, index: number) {
  if (typeof route.get_ps === "function") {
    return route.get_ps(index);
  }

  return route.at(index);
}

/** Signature of a node's handle layout for shape recreation. */
function getHandleSignature(node: Node, allNodes: Node[]): string {
  return getHandleLayoutSignature(node, allNodes);
}

/** Wires libavoid orthogonal routing into the schema graph. */
export function useLibavoid({ layoutKey, setNodes }: UseLibavoidOptions) {
  const [router, setRouter] = useState<Router | null>(null);
  const shapeIds = useRef<Map<string, number>>(new Map());
  const nextShapeId = useRef(1);
  const shapes = useRef<Map<number, ShapeRef>>(new Map());
  const handleSignatures = useRef<Map<string, string>>(new Map());
  const connections = useRef<Map<string, ConnRef>>(new Map());
  const loading = useRef(false);
  const clearancePasses = useRef(0);
  const lastLayoutKey = useRef(layoutKey);

  const { setEdges } = useReactFlow();
  const nodesInitialized = useNodesInitialized();
  const elements = useStore(
    (state) => ({ nodes: state.nodes, edges: state.edges }),
    compareElements,
  );
  const nodeLookup = useStore((state) => state.nodeLookup);

  useEffect(() => {
    if (lastLayoutKey.current !== layoutKey) {
      lastLayoutKey.current = layoutKey;
      clearancePasses.current = 0;
    }
  }, [layoutKey]);

  useEffect(() => {
    if (!nodesInitialized || loading.current) {
      return;
    }

    if (!router) {
      loading.current = true;

      AvoidLib.load(WASM_URL)
        .then(() => {
          const instance = AvoidLib.getInstance();
          const avoidRouter = new instance.Router(instance.OrthogonalRouting);

          avoidRouter.setRoutingParameter(instance.shapeBufferDistance, 28);
          avoidRouter.setRoutingParameter(instance.idealNudgingDistance, 24);
          avoidRouter.setRoutingOption(
            instance.nudgeSharedPathsWithCommonEndPoint,
            false,
          );
          avoidRouter.setRoutingOption(
            instance.performUnifyingNudgingPreprocessingStep,
            true,
          );

          setRouter(avoidRouter);
        })
        .finally(() => {
          loading.current = false;
        });

      return;
    }

    const instance = AvoidLib.getInstance();

    const activeShapeIds = new Set(
      elements.nodes.flatMap((node) => shapeIds.current.get(node.id) ?? []),
    );

    for (const [id, shapeRef] of shapes.current) {
      if (!activeShapeIds.has(id)) {
        router.deleteShape(shapeRef);
        shapes.current.delete(id);
        shapeIds.current.forEach((shapeId, nodeId) => {
          if (shapeId === id) {
            shapeIds.current.delete(nodeId);
            handleSignatures.current.delete(nodeId);
          }
        });
      }
    }

    for (const node of elements.nodes) {
      const width = node.measured?.width ?? 0;
      const height = node.measured?.height ?? 0;

      if (width <= 0 || height <= 0) {
        continue;
      }

      const data = node.data as SchemaNodeData;
      const signature = getHandleSignature(node, elements.nodes);
      const existingSignature = handleSignatures.current.get(node.id);

      if (!shapeIds.current.has(node.id)) {
        shapeIds.current.set(node.id, nextShapeId.current++);
      }

      const shapeId = shapeIds.current.get(node.id)!;

      if (existingSignature !== signature && shapes.current.has(shapeId)) {
        router.deleteShape(shapes.current.get(shapeId)!);
        shapes.current.delete(shapeId);
      }

      handleSignatures.current.set(node.id, signature);

      const topLeft = new instance.Point(node.position.x, node.position.y);
      const bottomRight = new instance.Point(
        node.position.x + width,
        node.position.y + height,
      );
      const box = new instance.Rectangle(topLeft, bottomRight);

      if (shapes.current.has(shapeId)) {
        const shape = shapes.current.get(shapeId)!;
        shape.setNewPoly(box);
      } else {
        const shape = new instance.ShapeRef(router, box);
        const handleBounds = nodeLookup.get(node.id)?.internals.handleBounds;
        const sourceHandles = handleBounds?.source ?? [];
        const targetHandles = handleBounds?.target ?? [];

        for (const handle of [...sourceHandles, ...targetHandles]) {
          if (!handle.id) {
            continue;
          }

          const pinId = Number(handle.id);
          const position = getHandlePosition(data, handle.id);

          const pin = new instance.ShapeConnectionPin(
            shape,
            pinId,
            handle.x + handle.width / 2,
            handle.y + handle.height / 2,
            false,
            0,
            position === "top"
              ? instance.ConnDirUp
              : position === "bottom"
                ? instance.ConnDirDown
                : position === "left"
                  ? instance.ConnDirLeft
                  : instance.ConnDirRight,
          );

          pin.setExclusive(false);
        }

        shapes.current.set(shapeId, shape);
      }

      instance.destroy(box);
      instance.destroy(bottomRight);
      instance.destroy(topLeft);
    }

    const edgeIds = new Set(elements.edges.map((edge) => edge.id));

    for (const [id, connRef] of connections.current) {
      if (!edgeIds.has(id)) {
        router.deleteConnector(connRef);
        connections.current.delete(id);
      }
    }

    for (const edge of elements.edges) {
      if (!edge.sourceHandle || !edge.targetHandle) {
        continue;
      }

      const sourceShapeId = shapeIds.current.get(edge.source);
      const targetShapeId = shapeIds.current.get(edge.target);

      if (!sourceShapeId || !targetShapeId) {
        continue;
      }

      const sourceShape = shapes.current.get(sourceShapeId);
      const targetShape = shapes.current.get(targetShapeId);

      if (!sourceShape || !targetShape) {
        continue;
      }

      const source = new instance.ConnEnd(
        sourceShape,
        Number(edge.sourceHandle),
      );
      const target = new instance.ConnEnd(
        targetShape,
        Number(edge.targetHandle),
      );

      if (connections.current.has(edge.id)) {
        const connection = connections.current.get(edge.id)!;
        connection.setSourceEndpoint(source);
        connection.setDestEndpoint(target);
      } else {
        const connection = new instance.ConnRef(router, source, target);
        connections.current.set(edge.id, connection);
      }

      instance.destroy(source);
      instance.destroy(target);
    }

    router.processTransaction();

    const routedEdges = elements.edges.map((edge) => {
      const connection = connections.current.get(edge.id);
      if (!connection) {
        return edge;
      }

      const route = connection.displayRoute() as RoutablePolyLine;
      const numPoints = route.size();
      const points = [];

      for (let index = 1; index < numPoints - 1; index += 1) {
        const point = getRoutePoint(route, index);
        points.push({ x: point.x, y: point.y });
      }

      return {
        ...edge,
        data: {
          ...(edge.data as Record<string, unknown>),
          points,
        },
      };
    });

    if (clearancePasses.current < MAX_ROUTE_CLEARANCE_PASSES) {
      const edgePaths = buildRoutedEdgePaths(
        elements.nodes,
        routedEdges,
        nodeLookup,
      );
      const offsets = computeRouteClearanceOffsets(elements.nodes, edgePaths);

      if (hasClearanceOffsets(offsets)) {
        clearancePasses.current += 1;
        setNodes((nodes) => applyNodeOffsets(nodes, offsets));
        return;
      }
    }

    setEdges(routedEdges);
  }, [
    router,
    nodesInitialized,
    elements,
    nodeLookup,
    setEdges,
    setNodes,
    layoutKey,
  ]);
}

type Elements = {
  nodes: Array<Node>;
  edges: Array<Edge>;
};

function compareElements(left: Elements, right: Elements) {
  return (
    compareNodes(left.nodes, right.nodes) &&
    compareEdges(left.edges, right.edges)
  );
}

function compareNodes(left: Array<Node>, right: Array<Node>) {
  if (left.length !== right.length) {
    return false;
  }

  for (let index = 0; index < left.length; index++) {
    const leftNode = left[index];
    const rightNode = right[index];

    if (!rightNode) {
      return false;
    }

    if (
      leftNode.measured?.width !== rightNode.measured?.width ||
      leftNode.measured?.height !== rightNode.measured?.height
    ) {
      return false;
    }

    if (
      leftNode.position.x !== rightNode.position.x ||
      leftNode.position.y !== rightNode.position.y
    ) {
      return false;
    }

    if (
      getHandleSignature(leftNode, left) !==
      getHandleSignature(rightNode, right)
    ) {
      return false;
    }
  }

  return true;
}

function compareEdges(left: Array<Edge>, right: Array<Edge>) {
  if (left.length !== right.length) {
    return false;
  }

  for (let index = 0; index < left.length; index++) {
    const leftEdge = left[index];
    const rightEdge = right[index];

    if (
      leftEdge.source !== rightEdge.source ||
      leftEdge.target !== rightEdge.target
    ) {
      return false;
    }

    if (leftEdge.sourceHandle !== rightEdge.sourceHandle) {
      return false;
    }

    if (leftEdge.targetHandle !== rightEdge.targetHandle) {
      return false;
    }
  }

  return true;
}
