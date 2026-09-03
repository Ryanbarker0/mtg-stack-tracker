import type { ResolvedItem } from '../lib/types'

interface Props {
  history: ResolvedItem[]
  onClear: () => void
}

/** Log of what has left the stack this game, most recent first. */
export function HistoryPanel({ history, onClear }: Props) {
  if (history.length === 0) {
    return <div className="empty">Nothing has resolved yet.</div>
  }
  return (
    <div className="stackable">
      <div className="row">
        <h3>Resolved this game</h3>
        <span className="spacer" />
        <button className="ghost" onClick={onClear}>
          Clear log
        </button>
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
