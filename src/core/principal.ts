export type Principal =
  | { readonly kind: 'operator' }
  | { readonly kind: 'project'; readonly id: string };

export const OPERATOR: Principal = { kind: 'operator' };

export function projectPrincipal(id: string): Principal {
  return { kind: 'project', id };
}
