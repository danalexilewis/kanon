import type { MachineConfig } from '../config/schemas.js';
import type { Principal } from '../core/principal.js';

export interface AppContext {
  readonly config: MachineConfig;
  readonly principal: Principal;
}

export function resolvePrincipal(args: {
  readonly principal?: unknown;
  readonly context: AppContext;
}): Principal {
  const candidate = args.principal;
  if (
    candidate !== undefined &&
    typeof candidate === 'object' &&
    candidate !== null &&
    'kind' in candidate
  ) {
    return candidate as Principal;
  }
  return args.context.principal;
}
