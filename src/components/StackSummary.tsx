import { groupItems, shortKind } from '../lib/summary'
import type { StackItem } from '../lib/types'

interface Props {
  stack: StackItem[]
}

/**
 * A grouped count of what is on the stack, so a 50-item Ulalek stack can be read at a
 * glance and explained to the table. Copies are folded into the item they copy.
 */
export function StackSummary({ stack }: Props) {
  if (stack.length < 4) return null
  const copies = stack.filter((i) => i.kind === 'copy').length
  return (
    <div className="summary-bar" aria-label="Stack summary">
      <span className="label">
        {stack.length} on the stack
        {copies > 0 && <span className="faint"> · {copies} copies</span>}
      </span>
      {groupItems(stack).map((g) => (
        <span key={g.key} className={`count kind-${g.kind}`}>
          <strong>{g.originals + g.copies}×</strong> {g.title}
          <span className="faint"> {shortKind(g.kind)}</span>
        </span>
      ))}
    </div>
  )
}
