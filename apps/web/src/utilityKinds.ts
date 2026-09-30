export const UTILITY_KINDS = ['inbox', 'conversations', 'agent-tools', 'index', 'help'] as const
export type UtilityKind = (typeof UTILITY_KINDS)[number]

export function isUtilityKind(value: string): value is UtilityKind {
  return (UTILITY_KINDS as readonly string[]).includes(value)
}
