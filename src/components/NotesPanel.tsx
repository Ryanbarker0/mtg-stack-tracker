import { useState } from 'react'
import type { DeckNote } from '../lib/types'
import { newId } from '../state/game'

interface Props {
  notes: DeckNote[]
  onChange: (notes: DeckNote[]) => void
}

/**
 * Short interaction notes kept with the deck, in the player's own words. Each note names
 * the cards it is about so the insight panel can surface it on the right stack items.
 */
export function NotesPanel({ notes, onChange }: Props) {
  const [editing, setEditing] = useState<DeckNote | null>(null)

  const save = () => {
    if (!editing || editing.title.trim() === '') return
    const exists = notes.some((n) => n.id === editing.id)
    onChange(exists ? notes.map((n) => (n.id === editing.id ? editing : n)) : [...notes, editing])
    setEditing(null)
  }

  const remove = (id: string) => {
    if (window.confirm('Delete this note?')) onChange(notes.filter((n) => n.id !== id))
  }

  return (
    <div className="stackable">
      <div className="row">
        <h3>Deck notes</h3>
        <span className="spacer" />
        <button
          className="primary"
          onClick={() => setEditing({ id: newId(), title: '', body: '', cards: [] })}
        >
          + Add note
        </button>
      </div>
      <p className="faint">
        Short reminders of how the deck works, for you and for the table. Name the cards a note is
        about and it appears on the ⓘ panel of any stack item from those cards.
      </p>

      {editing && (
        <div className="notice stackable" style={{ gap: 8 }}>
          <input
            type="text"
            name="noteTitle"
            placeholder="Title, e.g. Why Ulalek's trigger is on the stack more than once"
            value={editing.title}
            onChange={(e) => setEditing({ ...editing, title: e.target.value })}
            aria-label="Note title"
          />
          <textarea
            rows={5}
            placeholder="Explain it the way you would to your pod."
            value={editing.body}
            onChange={(e) => setEditing({ ...editing, body: e.target.value })}
            aria-label="Note body"
            style={{ fontFamily: 'inherit', fontSize: 15 }}
          />
          <input
            type="text"
            name="noteCards"
            placeholder="Cards it is about, comma separated"
            value={editing.cards.join(', ')}
            onChange={(e) =>
              setEditing({
                ...editing,
                cards: e.target.value
                  .split(',')
                  .map((c) => c.trim())
                  .filter((c) => c !== ''),
              })
            }
            aria-label="Related cards"
          />
          <div className="row">
            <button className="ghost" onClick={() => setEditing(null)}>
              Cancel
            </button>
            <span className="spacer" />
            <button className="primary" onClick={save} disabled={editing.title.trim() === ''}>
              Save note
            </button>
          </div>
        </div>
      )}

      {notes.length === 0 && !editing && <div className="empty">No notes yet.</div>}

      {notes.map((note) => (
        <div key={note.id} className="note-card">
          <div className="row" style={{ alignItems: 'flex-start' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <strong>{note.title}</strong>
              <p className="muted" style={{ marginTop: 4, whiteSpace: 'pre-line' }}>
                {note.body}
              </p>
              {note.cards.length > 0 && (
                <div className="row wrap" style={{ gap: 6, marginTop: 8 }}>
                  {note.cards.map((card) => (
                    <span key={card} className="tag">
                      {card}
                    </span>
                  ))}
                </div>
              )}
            </div>
            <div className="row" style={{ gap: 6 }}>
              <button className="icon" onClick={() => setEditing(note)} aria-label="Edit note">
                ✎
              </button>
              <button
                className="icon danger"
                onClick={() => remove(note.id)}
                aria-label="Delete note"
              >
                ✕
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
