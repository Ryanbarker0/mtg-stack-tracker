import type { StackItem } from './types'

export interface ItemGroup {
  key: string
  title: string
  kind: StackItem['kind']
  originals: number
  copies: number
}

/**
 * Groups stack items (or resolved items) by what they are, folding copies into the item
 * they copy, so a long list can be read as "16× Forsaken Monument trigger".
 */
export function groupItems(items: StackItem[]): ItemGroup[] {
  const groups = new Map<string, ItemGroup>()
  for (const item of items) {
    const kind = item.kind === 'copy' ? (item.originalKind ?? 'spell') : item.kind
    const title = item.title.replace(/^Copy of /, '')
    // Different abilities of the same card are different groups, so key on the text too.
    const key = `${kind}|${title}|${kind === 'spell' ? '' : item.text.slice(0, 40)}`
    const group = groups.get(key) ?? { key, title, kind, originals: 0, copies: 0 }
    if (item.kind === 'copy') group.copies += 1
    else group.originals += 1
    groups.set(key, group)
  }
  return [...groups.values()]
}

export function shortKind(kind: StackItem['kind']): string {
  switch (kind) {
    case 'triggered':
      return 'trigger'
    case 'activated':
      return 'ability'
    default:
      return kind
  }
}
