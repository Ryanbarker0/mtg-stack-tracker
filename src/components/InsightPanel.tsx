import { explain, notesFor } from '../lib/insights'
import type { DeckNote, StackItem } from '../lib/types'

interface Props {
  item: StackItem
  stack: StackItem[]
  notes: DeckNote[]
  onClose: () => void
}

/**
 * Explains one stack item in plain words: what it is, the steps that put it there, the
 * rules behind it, and any deck notes about the cards involved.
 */
export function InsightPanel({ item, stack, notes, onClose }: Props) {
  const insight = explain(item, stack)
  const related = notesFor(item, notes)

  return (
    <div className="modal-backdrop" onClick={onClose} role="presentation">
      <div
        className="modal single"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={`About ${item.title}`}
      >
        <div className="stackable">
          <div className="row">
            <h1>{item.title}</h1>
            <span className="spacer" />
            <button className="icon ghost" onClick={onClose} aria-label="Close">
              ✕
            </button>
          </div>

          <p>{insight.what}</p>

          {item.origin && item.origin.length > 0 && (
            <div>
              <h3>How it got here</h3>
              <ol className="steps">
                {item.origin.map((step, index) => (
                  <li key={index}>{step}</li>
                ))}
              </ol>
            </div>
          )}

          {insight.why.length > 0 && (
            <div>
              <h3>Why</h3>
              <div className="stackable" style={{ gap: 8 }}>
                {insight.why.map((line, index) => (
                  <p key={index} className="muted">
                    {line}
                  </p>
                ))}
              </div>
            </div>
          )}

          {insight.onResolve && (
            <div>
              <h3>When it resolves</h3>
              <p className="muted">{insight.onResolve}</p>
            </div>
          )}

          {related.length > 0 && (
            <div>
              <h3>Deck notes</h3>
              <div className="stackable" style={{ gap: 10 }}>
                {related.map((note) => (
                  <div key={note.id} className="notice">
                    <strong>{note.title}</strong>
                    <p className="muted" style={{ marginTop: 4 }}>
                      {note.body}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div>
            <h3>Card text</h3>
            <p className="oracle muted">{item.text}</p>
          </div>
        </div>
      </div>
    </div>
  )
}
