import { useState } from 'react'
import type { Card, GameState, StackItem } from '../lib/types'
import { YOU, copiesAllOthers, sacrificesSource, siblingsOf, type GameAction } from '../state/game'
import { shortKind } from '../lib/summary'
import { StackSummary } from './StackSummary'

interface Props {
  game: GameState
  dispatch: (action: GameAction) => void
  /** Resolves the top item; the parent may follow up with enters-trigger suggestions. */
  onResolveTop: () => void
  /** Resolves the top cascade trigger and opens the deck picker for its hit. */
  onCascadeHit: () => void
  /** How many items would resolve with no decision, and the action to do it. */
  untilDecision: number
  onResolveUntilDecision: () => void
  /** Item animating off the top right now, if any. */
  leavingId: string | null
  /** Progress of an automatic run, if one is going. */
  auto: { done: number; total: number } | null
  onStopAuto: () => void
  onShowCard: (card: Card) => void
  /** Opens the insight panel for an item. */
  onInsight: (item: StackItem) => void
}

/**
 * The stack, drawn top-first so the next object to resolve is at the top of the
 * screen. Only the top item can be resolved; anything can be removed (countered,
 * fizzled) or reordered while the user is arranging simultaneous triggers.
 */
export function StackView({
  game,
  dispatch,
  onResolveTop,
  onCascadeHit,
  untilDecision,
  onResolveUntilDecision,
  leavingId,
  auto,
  onStopAuto,
  onShowCard,
  onInsight,
}: Props) {
  // Items created after this view mounted slide in; the ones already there on load do not.
  const [mountedAt] = useState(() => Date.now())
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
  const titleOf = (id: string | undefined) =>
    game.stack.find((i) => i.id === id)?.title.replace(/^Copy of /, '')
  return (
    <>
      <StackSummary stack={game.stack} />
      {auto ? (
        <div className="row auto-run" style={{ marginBottom: 12 }}>
          <span className="progress" style={{ flex: 1 }}>
            <span style={{ width: `${(auto.done / Math.max(1, auto.total)) * 100}%` }} />
          </span>
          <span className="muted" style={{ fontSize: 14, fontVariantNumeric: 'tabular-nums' }}>
            Resolving {auto.done} of {auto.total}
          </span>
          <button className="danger" onClick={onStopAuto}>
            Stop
          </button>
        </div>
      ) : (
        untilDecision >= 2 && (
          <div className="row" style={{ marginBottom: 12 }}>
            <button
              onClick={onResolveUntilDecision}
              title="Resolve items from the top until one needs a choice"
            >
              ⏬ Resolve {untilDecision} until the next choice
            </button>
            <span className="faint" style={{ fontSize: 13 }}>
              Stops at a payment, a sacrifice, a cascade hit, an opponent’s item, or a permanent
              with enters triggers.
            </span>
          </div>
        )
      )}
      <div className="stack-list">
        {items.map((item, index) => (
          <StackRow
            key={item.id}
            item={item}
            isTop={index === 0}
            isBottom={index === items.length - 1}
            position={game.stack.length - index}
            refersToTitle={item.onResolve === 'copySpell' ? titleOf(item.refersTo) : undefined}
            othersToCopy={
              index === 0
                ? game.stack.slice(0, -1).filter((i) => i.controller === YOU && i.kind !== 'note')
                    .length
                : 0
            }
            siblings={index === 0 ? siblingsOf(game.stack, item).length : 0}
            leaving={item.id === leavingId}
            mountedAt={mountedAt}
            dispatch={dispatch}
            onResolveTop={onResolveTop}
            onCascadeHit={onCascadeHit}
            onShowCard={onShowCard}
            onInsight={onInsight}
          />
        ))}
      </div>
    </>
  )
}

interface RowProps {
  item: StackItem
  isTop: boolean
  isBottom: boolean
  position: number
  /** For "copy it" triggers, the name of the spell they will copy, if it is still on the stack. */
  refersToTitle?: string
  /** For the top item, how many of the controller's other items a copy-all trigger would copy. */
  othersToCopy: number
  /** For the top item, how many other instances of the same trigger are on the stack. */
  siblings: number
  /** True while this item animates off the stack. */
  leaving: boolean
  /** When the list mounted; items created later animate in. */
  mountedAt: number
  dispatch: (action: GameAction) => void
  onResolveTop: () => void
  onCascadeHit: () => void
  onShowCard: (card: Card) => void
  onInsight: (item: StackItem) => void
}

function StackRow({
  item,
  isTop,
  isBottom,
  position,
  refersToTitle,
  othersToCopy,
  siblings,
  leaving,
  mountedAt,
  dispatch,
  onResolveTop,
  onCascadeHit,
  onShowCard,
  onInsight,
}: RowProps) {
  const [expanded, setExpanded] = useState(false)
  const [editingNote, setEditingNote] = useState(false)
  const opponent = item.controller !== YOU

  return (
    <div
      className={`stack-item ${isTop ? 'top' : ''} ${leaving ? 'leaving' : ''} ${
        item.createdAt > mountedAt ? 'entering' : ''
      }`}
    >
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
          <span className={`kind-${item.kind}`}>
            {item.kind === 'copy'
              ? `copy of ${shortKind(item.originalKind ?? 'spell')}`
              : item.kind}
          </span>
          <span className={`controller ${opponent ? 'opponent' : ''}`}>{item.controller}</span>
        </div>
        <div className="item-title">{item.title}</div>
        {item.text && <div className={`item-text ${expanded ? 'expanded' : ''}`}>{item.text}</div>}
        {item.origin && item.origin.length > 0 && (
          <div className={`origin ${expanded ? 'expanded' : ''}`} title={item.origin.join(' → ')}>
            ↳ {item.origin.join(' → ')}
          </div>
        )}
        {item.onResolve === 'copySpell' && (
          <div className="effect kind-copy">
            {refersToTitle
              ? `On resolve: copies ${refersToTitle}`
              : 'On resolve: nothing, the spell has left the stack'}
          </div>
        )}
        {isTop && item.onResolve === 'cascade' && (
          <div className="effect kind-triggered">
            Exile until a nonland card with lesser mana value. Cast it for free, or not.
          </div>
        )}
        {isTop && sacrificesSource(item) && (
          <div className="effect kind-triggered">
            Sacrificing the source
            {siblings > 0
              ? ` fizzles the ${siblings} other ${siblings === 1 ? 'copy' : 'copies'} of this trigger`
              : ''}
            . Declining resolves it with no effect.
          </div>
        )}
        {isTop && copiesAllOthers(item) && (
          <div className="effect kind-copy">
            Pay {'{C}{C}'} to copy the {othersToCopy} other item{othersToCopy === 1 ? '' : 's'} you
            control
          </div>
        )}
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
        {isTop && copiesAllOthers(item) && othersToCopy > 0 ? (
          <>
            <button
              className="primary"
              onClick={() => dispatch({ type: 'resolveTopCopyingOthers', controller: YOU })}
              title="Pay {C}{C}: resolve and copy every other spell and ability you control"
            >
              Pay, copy all
            </button>
            <button onClick={onResolveTop} title="Resolve without paying; nothing is copied">
              Don’t pay
            </button>
          </>
        ) : isTop && item.onResolve === 'cascade' ? (
          <>
            <button
              className="primary"
              onClick={onCascadeHit}
              title="Resolve and cast the exiled card"
            >
              Cast the hit
            </button>
            <button onClick={onResolveTop} title="Resolve without casting anything">
              No cast
            </button>
          </>
        ) : isTop && sacrificesSource(item) ? (
          <>
            <button
              className="primary"
              onClick={() => dispatch({ type: 'resolveTopSacrificingSource' })}
              title="Sacrifice the source and resolve; other copies of this trigger fizzle"
            >
              Sacrifice, resolve
            </button>
            <button onClick={onResolveTop} title="Resolve without sacrificing; nothing happens">
              Decline
            </button>
          </>
        ) : isTop ? (
          <button className="primary" onClick={onResolveTop}>
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
            className="icon info"
            onClick={() => onInsight(item)}
            aria-label="Why is this here?"
            title="Why is this here?"
          >
            i
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
