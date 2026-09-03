import { useState } from 'react'
import type { Card, GameState, StackItem } from '../lib/types'
import { YOU, type GameAction } from '../state/game'

interface Props {
  game: GameState
  dispatch: (action: GameAction) => void
  onShowCard: (card: Card) => void
}

/**
 * The stack, drawn top-first so the next object to resolve is at the top of the
 * screen. Only the top item can be resolved; anything can be removed (countered,
 * fizzled) or reordered while the user is arranging simultaneous triggers.
 */
export function StackView({ game, dispatch, onShowCard }: Props) {
  const items = [...game.stack].reverse()
  if (items.length === 0) {
    return (
      <div className="empty">
        The stack is empty.
        <br />
        <span className="faint">Tap an ability on the left, or cast a spell, to begin.</span>
      </div>
    )
  }
  return (
    <div className="stack-list">
      {items.map((item, index) => (
        <StackRow
          key={item.id}
          item={item}
          isTop={index === 0}
          isBottom={index === items.length - 1}
          position={game.stack.length - index}
          dispatch={dispatch}
          onShowCard={onShowCard}
        />
      ))}
    </div>
  )
}

interface RowProps {
  item: StackItem
  isTop: boolean
  isBottom: boolean
  position: number
  dispatch: (action: GameAction) => void
  onShowCard: (card: Card) => void
}

function StackRow({ item, isTop, isBottom, position, dispatch, onShowCard }: RowProps) {
  const [expanded, setExpanded] = useState(false)
  const [editingNote, setEditingNote] = useState(false)
  const opponent = item.controller !== YOU

  return (
    <div className={`stack-item ${isTop ? 'top' : ''}`}>
      <span className={`bar bar-${item.kind}`} />
      {item.imageUrl ? (
        <img
          className="thumb"
          src={item.imageUrl}
          alt=""
          onClick={() => item.card && onShowCard(item.card)}
        />
      ) : (
        <div className="thumb placeholder">{item.kind === 'note' ? '✎' : '?'}</div>
      )}
      <div className="body" onClick={() => setExpanded((v) => !v)}>
        <div className="meta">
          {isTop && <span className="top-label">▲ Resolves next</span>}
          {!isTop && <span className="faint">#{position}</span>}
          <span className={`kind-${item.kind}`}>{item.kind}</span>
          <span className={`controller ${opponent ? 'opponent' : ''}`}>{item.controller}</span>
        </div>
        <div className="item-title">{item.title}</div>
        {item.text && <div className={`item-text ${expanded ? 'expanded' : ''}`}>{item.text}</div>}
        {(editingNote || item.note) && (
          <div className="note" onClick={(e) => e.stopPropagation()}>
            <input
              type="text"
              name="note"
              placeholder="Targets, choices, reminders…"
              value={item.note ?? ''}
              autoFocus={editingNote}
              onChange={(e) => dispatch({ type: 'setNote', id: item.id, note: e.target.value })}
              onBlur={() => setEditingNote(false)}
              aria-label="Note"
            />
          </div>
        )}
      </div>
      <div className="actions">
        {isTop ? (
          <button className="primary" onClick={() => dispatch({ type: 'resolveTop' })}>
            Resolve
          </button>
        ) : (
          <button
            className="icon"
            onClick={() => dispatch({ type: 'move', id: item.id, direction: 'up' })}
            aria-label="Move up"
          >
            ↑
          </button>
        )}
        <div className="row">
          <button
            className="icon"
            onClick={() => dispatch({ type: 'move', id: item.id, direction: 'down' })}
            disabled={isBottom}
            aria-label="Move down"
          >
            ↓
          </button>
          <button
            className="icon"
            onClick={() => dispatch({ type: 'copy', id: item.id })}
            aria-label="Copy"
            title="Copy this spell or ability"
          >
            ⧉
          </button>
          <button
            className="icon"
            onClick={() => setEditingNote(true)}
            aria-label="Add note"
            title="Add a note"
          >
            ✎
          </button>
          <button
            className="icon danger"
            onClick={() => dispatch({ type: 'remove', id: item.id })}
            aria-label="Remove"
            title="Remove without resolving (countered, fizzled)"
          >
            ✕
          </button>
        </div>
      </div>
    </div>
  )
}
