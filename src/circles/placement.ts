import type { Circle, Placement, PlacementBasis, PlacementInput, ReviewState } from './types.js';

function emptyReview(): ReviewState {
  return { queued: new Set(), excluded: false, approvals: {} };
}

function audiencePasses(input: {
  readonly circle: Circle;
  readonly readers: PlacementInput['readers'];
  readonly review: ReviewState;
  readonly contentHash: string;
  readonly canShare: boolean;
}): { readonly ok: boolean; readonly basis?: PlacementBasis } {
  const readerSet = new Set(input.readers.people);
  if (input.circle.members.every((member) => readerSet.has(member))) {
    return { ok: true, basis: 'sharing' };
  }
  const approval = input.review.approvals[input.circle.id];
  if (
    approval !== undefined &&
    approval.hash === input.contentHash &&
    approval.basis === 'promotion' &&
    input.canShare
  ) {
    return { ok: true, basis: 'promotion' };
  }
  return { ok: false };
}

function admissionPasses(circle: Circle, review: ReviewState, contentHash: string): boolean {
  if (circle.admit === 'auto') {
    return true;
  }
  const approval = review.approvals[circle.id];
  return approval !== undefined && approval.hash === contentHash;
}

/**
 * Widest circle in the route that passes audience, ceiling, admission
 * and is not excluded. Otherwise held.
 */
export function placeDocument(input: PlacementInput): Placement {
  const review = input.review ?? emptyReview();
  if (review.excluded) {
    return { held: true, level: input.level, reason: 'excluded' };
  }

  for (const circleId of input.route) {
    const circle = input.circles.find((entry) => entry.id === circleId);
    if (circle === undefined) {
      continue;
    }
    if (input.level > circle.ceiling) {
      continue;
    }
    const audience = audiencePasses({
      circle,
      readers: input.readers,
      review,
      contentHash: input.contentHash,
      canShare: input.canShare,
    });
    if (!audience.ok) {
      continue;
    }
    if (!admissionPasses(circle, review, input.contentHash)) {
      continue;
    }
    return {
      circle: circle.id,
      held: false,
      basis: audience.basis,
      level: input.level,
    };
  }

  return { held: true, level: input.level, reason: 'no_circle' };
}

export function needsReview(input: PlacementInput): boolean {
  const placed = placeDocument(input);
  if (!placed.held) {
    return false;
  }
  if (input.review.excluded) {
    return false;
  }
  return input.route.some((circleId) => {
    const circle = input.circles.find((entry) => entry.id === circleId);
    return circle !== undefined && circle.admit === 'review' && input.level <= circle.ceiling;
  });
}
