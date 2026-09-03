import { useState } from 'react'
import type { Suggestion } from '../lib/triggers'

interface Props {
  title: string
  subtitle: string
  suggestions: Suggestion[]
  onConfirm: (chosen: Suggestion[]) => void
  onSkip: () => void
}

/**
 * Offers the triggers the app thinks fire for a cast or an enters event. Everything is
 * pre-ticked; uncertain matches carry a hint so the user can untick them. The list is in
 * stack order, bottom first, so the last row will be on top of the stack.
 */
export function TriggerSheet({ title, subtitle, suggestions, onConfirm, onSkip }: Props) {
  const [ticked, setTicked] = useState<boolean[]>(() => suggestions.map(() => true))
  const count = suggestions.reduce((n, s, i) => n + (ticked[i] ? s.times : 0), 0)

  return (
    <div className="modal-backdrop" onClick={onSkip} role="presentation">
      <div
        className="modal single"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="stackable">
          <div>
            <h1>{title}</h1>
            <p className="muted">{subtitle}</p>
          </div>

          <div className="stackable" style={{ gap: 8 }}>
            {suggestions.map((s, index) => (
              <button
                key={`${s.ability.id}-${index}`}
                className={`suggestion ${ticked[index] ? 'on' : ''}`}
                onClick={() => setTicked(ticked.map((t, i) => (i === index ? !t : t)))}
                aria-pressed={ticked[index]}
              >
                <span className={`check ${ticked[index] ? 'on' : ''}`}>
                  {ticked[index] ? '✓' : ''}
                </span>
                <span className="body">
                  <span className="row wrap" style={{ gap: 8 }}>
                    <strong>{s.source.faces[s.sourceFaceIndex]?.name ?? s.source.name}</strong>
                    {s.times > 1 && (
                      <span className="tag doubled" title={`Doubled by ${s.doubledBy}`}>
                        ×{s.times} {s.doubledBy}
                      </span>
                    )}
                    {s.fromCommander && <span className="tag commander">Top of stack</span>}
                    {s.certain === undefined && (
                      <span className="tag uncertain" title={s.uncertainReason}>
                        Check: {s.uncertainReason ?? 'condition'}
                      </span>
                    )}
                  </span>
                  <span className="text">{s.ability.text}</span>
                </span>
              </button>
            ))}
          </div>

          <div className="row">
            <button className="ghost" onClick={onSkip}>
              None of these
            </button>
            <span className="spacer" />
            <button
              className="primary"
              disabled={count === 0}
              onClick={() => onConfirm(suggestions.filter((_, i) => ticked[i]))}
            >
              Put {count} trigger{count === 1 ? '' : 's'} on the stack
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
