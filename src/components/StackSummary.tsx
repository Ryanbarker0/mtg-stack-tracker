import type { StackItem } from '../lib/types'

interface Props {
  stack: StackItem[]
}

interface Group {
  key: string
  title: string
  kind: StackItem['kind']
  originals: number
  copies: number
}

/**
 * A grouped count of what is on the stack, so a 50-item Ulalek stack can be read at a
 * glance and explained to the table. Copies are folded into the item they copy.
 */
export function StackSummary({ stack }: Props) {
  if (stack.length < 4) return null

  const groups = new Map<string, Group>()
  for (const item of stack) {
    const kind = item.kind === 'copy' ? (item.originalKind ?? 'spell') : item.kind
    const base = item.title.replace(/^Copy of /, '')
    // A granted keyword trigger reads "Cascade (granted by Zhulodok...)"; name it by the keyword.
    const granted = /^([A-Z][a-z]+) \(granted by /.exec(item.text)
    const title = granted ? `${granted[1]} on ${base}` : base
    // Different abilities of the same card are different groups, so key on the text too.
    const key = `${kind}|${title}|${kind === 'spell' ? '' : item.text.slice(0, 40)}`
    const group = groups.get(key) ?? { key, title, kind, originals: 0, copies: 0 }
    if (item.kind === 'copy') group.copies += 1
    else group.originals += 1
    groups.set(key, group)
  }

  const copies = stack.filter((i) => i.kind === 'copy').length

  return (
    <div className="summary-bar" aria-label="Stack summary">
      <span className="label">
        {stack.length} on the stack
        {copies > 0 && <span className="faint"> · {copies} copies</span>}
      </span>
      {[...groups.values()].map((g) => (
        <span key={g.key} className={`count kind-${g.kind}`}>
          <strong>{g.originals + g.copies}×</strong> {g.title}
          <span className="faint"> {shortKind(g.kind)}</span>
        </span>
      ))}
    </div>
  )
}

function shortKind(kind: StackItem['kind']): string {
  switch (kind) {
    case 'triggered':
      return 'trigger'
    case 'activated':
      return 'ability'
    default:
      return kind
  }
}
