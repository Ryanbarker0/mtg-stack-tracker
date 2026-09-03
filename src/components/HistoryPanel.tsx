import { groupItems, shortKind } from '../lib/summary'
import type { ResolvedItem } from '../lib/types'

interface Props {
  history: ResolvedItem[]
  onClear: () => void
}

/**
 * Log of what has left the stack this game. A grouped summary of everything that
 * resolved sits on top, so the turn can be read out to the table, followed by the
 * item-by-item list, most recent first.
 */
export function HistoryPanel({ history, onClear }: Props) {
  if (history.length === 0) {
    return <div className="empty">Nothing has resolved yet.</div>
  }
  const resolved = history.filter((h) => h.outcome === 'resolved').map((h) => h.item)
  const tokens = resolved.filter(
    (i) => i.kind === 'copy' && i.originalKind === 'spell' && i.card,
  ).length
  const fizzled = history.filter((h) => h.outcome === 'fizzled').length
  const removed = history.filter((h) => h.outcome === 'removed').length

  return (
    <div className="stackable">
      <div className="row">
        <h3>This game</h3>
        <span className="spacer" />
        <button className="ghost" onClick={onClear}>
          Clear log
        </button>
      </div>

      <div className="summary-bar" aria-label="Resolved summary">
        <span className="label">
          {resolved.length} resolved
          {tokens > 0 && (
            <span className="faint">
              {' '}
              · {tokens} token{tokens === 1 ? '' : 's'} made
            </span>
          )}
          {fizzled > 0 && <span className="faint"> · {fizzled} fizzled</span>}
          {removed > 0 && <span className="faint"> · {removed} removed</span>}
        </span>
        {groupItems(resolved).map((g) => (
          <span key={g.key} className={`count kind-${g.kind}`}>
            <strong>{g.originals + g.copies}×</strong> {g.title}
            <span className="faint"> {shortKind(g.kind)}</span>
          </span>
        ))}
      </div>

      <div>
        {[...history].reverse().map((entry, index) => (
          <div key={`${entry.item.id}-${index}`} className="history-item">
            <span className={`outcome ${entry.outcome}`}>{entry.outcome}</span>
            <span className={`kind-${entry.item.kind}`}>{entry.item.kind}</span>
            <span>{entry.item.title}</span>
            {entry.item.controller !== 'You' && (
              <span className="faint">({entry.item.controller})</span>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
