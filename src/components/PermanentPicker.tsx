import type { BattlefieldPermanent } from '../lib/types'

interface Props {
  title: string
  subtitle: string
  permanents: BattlefieldPermanent[]
  cancelLabel: string
  onPick: (permanent: BattlefieldPermanent) => void
  onCancel: () => void
}

/**
 * Picks one of the permanents you control. Used after a blink effect resolves, to say
 * which permanent left and came back so its triggers can be offered.
 */
export function PermanentPicker({
  title,
  subtitle,
  permanents,
  cancelLabel,
  onPick,
  onCancel,
}: Props) {
  return (
    <div className="modal-backdrop" onClick={onCancel} role="presentation">
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
          <div className="picker-list">
            {permanents.map((permanent) => {
              const face = permanent.card.faces[permanent.faceIndex] ?? permanent.card.faces[0]
              return (
                <button key={permanent.id} className="picker-row" onClick={() => onPick(permanent)}>
                  {face.imageUrl ? (
                    <img src={face.imageUrl} alt="" loading="lazy" />
                  ) : (
                    <span className="thumb" />
                  )}
                  <span className="body">
                    <strong>
                      {face.name}
                      {permanent.isToken && <span className="faint"> token</span>}
                    </strong>
                    <span className="faint">{face.typeLine}</span>
                  </span>
                </button>
              )
            })}
            {permanents.length === 0 && (
              <div className="empty">Nothing on the battlefield list.</div>
            )}
          </div>
          <div className="row">
            <button className="ghost" onClick={onCancel}>
              {cancelLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
