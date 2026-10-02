import { useEffect, useRef, useState } from 'react'
import { CardDetail } from './components/CardDetail'
import { DeckImport } from './components/DeckImport'
import { DeckList } from './components/DeckList'
import { DeckPicker } from './components/DeckPicker'
import { HistoryPanel } from './components/HistoryPanel'
import { InsightPanel } from './components/InsightPanel'
import { NotesPanel } from './components/NotesPanel'
import { Palette } from './components/Palette'
import { PermanentPicker } from './components/PermanentPicker'
import { QuickAdd } from './components/QuickAdd'
import { StackView } from './components/StackView'
import { TriggerSheet } from './components/TriggerSheet'
import { itemForAbility, itemForSpell } from './lib/stackItems'
import {
  blinkTriggers,
  castTriggers,
  entersTriggers,
  entryEffect,
  castsExiledCard,
  type CastFrom,
  type Entry,
  type EntryEffect,
  type Suggestion,
} from './lib/triggers'
import type { BattlefieldPermanent, Card, Deck, StackItem } from './lib/types'
import {
  YOU,
  entryOfResolved,
  newId,
  permanentFromResolved,
  resolvableWithoutDecision,
  type NewItem,
} from './state/game'
import { useDecks } from './state/useDecks'
import { useGame } from './state/useGame'

type Screen = 'decks' | 'import' | 'game'

interface Sheet {
  title: string
  subtitle: string
  suggestions: Suggestion[]
  /** Short description of the event, used as the first entry of each item's lineage. */
  event: string
  /** For cast sheets: the spell, so suggestions can be recomputed when cast-from changes. */
  cast?: { spellId: string; card: Card; faceIndex: number; castFrom: CastFrom }
  /** For enters sheets: the permanent, so suggestions can be recomputed when entry changes. */
  enters?: {
    permanent: BattlefieldPermanent
    battlefield: BattlefieldPermanent[]
    entry: Entry
    blink: boolean
  }
  /** Runs once the sheet closes, e.g. to ask what else an effect put onto the battlefield. */
  then?: () => void
}

/** A resolved effect that put something onto the battlefield; the app asks what. */
interface PendingEntry {
  effect: EntryEffect
  /** Name of the spell or ability that resolved. */
  from: string
  /** Its lineage, used to guess what a token copies. */
  origin?: string[]
  /** How many permanents have been picked for this effect so far. */
  picked: number
}

export default function App() {
  const decks = useDecks()
  const { game, dispatch, undo, redo, canUndo, canRedo } = useGame()
  const [screen, setScreen] = useState<Screen | null>(null)
  const [detail, setDetail] = useState<Card | null>(null)
  const [panel, setPanel] = useState<'stack' | 'log' | 'notes'>('stack')
  const [insight, setInsight] = useState<StackItem | null>(null)
  const [sheet, setSheet] = useState<Sheet | null>(null)
  const [pickingHit, setPickingHit] = useState(false)
  const [pendingEntry, setPendingEntry] = useState<PendingEntry | null>(null)
  /** The stack item currently animating off the top, if any. */
  const [leavingId, setLeavingId] = useState<string | null>(null)
  /** Progress of an in-flight "resolve until the next choice" run. */
  const [auto, setAuto] = useState<{ done: number; total: number } | null>(null)
  const gameRef = useRef(game)
  const timer = useRef<number | undefined>(undefined)
  useEffect(() => {
    gameRef.current = game
  }, [game])
  useEffect(() => () => window.clearTimeout(timer.current), [])

  if (!decks.loaded) return null

  // First render: go straight into the game if a deck was active last time.
  const current: Screen = screen ?? (decks.activeDeck ? 'game' : 'decks')

  const commanders = (deck: Deck) => deck.entries.filter((e) => e.isCommander).map((e) => e.card)
  const commanderIds = new Set(
    decks.activeDeck ? commanders(decks.activeDeck).map((c) => c.oracleId) : [],
  )

  const startGame = (deck: Deck) => {
    dispatch({ type: 'newGame', commanders: commanders(deck) })
    setPanel('stack')
    setSheet(null)
    setPickingHit(false)
    setPendingEntry(null)
  }

  const play = (deck: Deck) => {
    // Playing a different deck starts a fresh game; the same deck resumes where it was.
    if (deck.id !== decks.activeDeckId) startGame(deck)
    decks.setActiveDeckId(deck.id)
    setScreen('game')
  }

  const itemsFor = (chosen: Suggestion[], event: string, spellId?: string): NewItem[] =>
    chosen.flatMap((s) =>
      Array.from({ length: s.times }, () => ({
        ...itemForAbility(s.source, s.ability),
        ...(s.copiesSpell && spellId ? { onResolve: 'copySpell' as const, refersTo: spellId } : {}),
        ...(castsExiledCard(s.ability.text) ? { onResolve: 'cascade' as const } : {}),
        origin: [
          event,
          ...(s.grantedBy ? [`Granted by ${s.grantedBy}`] : []),
          ...(s.doublers && s.doublers.length > 0
            ? [`Doubled by ${s.doublers.join(' and ')}`]
            : []),
        ],
      })),
    )

  const openCastSheet = (
    spellId: string,
    card: Card,
    faceIndex: number,
    castFrom: CastFrom,
    battlefield: BattlefieldPermanent[],
  ) => {
    const suggestions = castTriggers(card, faceIndex, battlefield, commanderIds, castFrom)
    if (suggestions.length === 0) {
      setSheet(null)
      return
    }
    setSheet({
      title: `Casting ${card.faces[faceIndex]?.name ?? card.name}`,
      event: `Cast of ${card.faces[faceIndex]?.name ?? card.name}`,
      subtitle:
        'These abilities trigger on the cast. They go on the stack above the spell in this order, so the last row ends up on top.',
      suggestions,
      cast: { spellId, card, faceIndex, castFrom },
    })
  }

  const cast = (card: Card, faceIndex: number, castFrom: CastFrom = 'hand') => {
    // The spell gets its id up front so its triggers can refer back to it.
    const spellId = newId()
    dispatch({
      type: 'push',
      item: {
        ...itemForSpell(card, faceIndex),
        id: spellId,
        origin: [castFrom === 'hand' ? 'Cast from hand' : 'Cast from exile (cascade or free cast)'],
      },
    })
    openCastSheet(spellId, card, faceIndex, castFrom, game.battlefield)
  }

  /**
   * Offers enters triggers for a permanent that entered, or leaves and enters triggers
   * for one that was blinked. With nothing to offer the sheet closes and `then` runs.
   */
  const offerEnters = (
    entering: BattlefieldPermanent,
    battlefield: BattlefieldPermanent[],
    entry: Entry,
    options: { blink?: boolean; then?: () => void } = {},
  ) => {
    const name = entering.card.faces[entering.faceIndex]?.name ?? entering.card.name
    const blink = options.blink ?? false
    const suggestions = blink
      ? blinkTriggers(entering, battlefield, commanderIds)
      : entersTriggers(entering, battlefield, commanderIds, entry)
    if (suggestions.length === 0) {
      setSheet(null)
      options.then?.()
      return
    }
    let subtitle = 'These abilities trigger on it entering the battlefield.'
    if (blink && entering.isToken) {
      subtitle =
        'A token that leaves the battlefield ceases to exist and does not come back (CR 111.8), so only its leaves triggers fire.'
    } else if (blink) {
      subtitle =
        'It came back as a new object that was not cast (CR 400.7). Leaves and enters triggers go on the stack together, in the order you choose (CR 603.3b).'
    }
    const label = entering.isToken ? `${name} token` : name
    setSheet({
      title: blink ? `${label} left and came back` : `${label} entered`,
      event: blink ? `${name} blinked` : `${name} entering`,
      subtitle,
      suggestions,
      enters: { permanent: entering, battlefield, entry, blink },
      then: options.then,
    })
  }

  /** The permanent left the battlefield and returned; a token does not return (CR 111.8). */
  const blink = (permanent: BattlefieldPermanent) => {
    if (permanent.isToken) dispatch({ type: 'battlefieldRemove', id: permanent.id })
    offerEnters(permanent, game.battlefield, 'notCast', { blink: true })
  }

  /** The card picked for an effect that put something onto the battlefield. */
  const entered = (card: Card, pending: PendingEntry) => {
    const { effect } = pending
    const isToken = effect.kind === 'tokenCopy'
    const keeps = effect.kind !== 'fromElsewhere' || effect.keeps
    const permanent: BattlefieldPermanent = { id: newId(), card, faceIndex: 0, isToken }
    if (keeps) dispatch({ type: 'battlefieldAdd', card, faceIndex: 0, isToken, id: permanent.id })
    const several = effect.kind === 'fromElsewhere' && effect.several
    setPendingEntry(null)
    offerEnters(permanent, [...game.battlefield, permanent], 'notCast', {
      then: several ? () => setPendingEntry({ ...pending, picked: pending.picked + 1 }) : undefined,
    })
  }

  /** "Spirited Companion entering" or "Spirited Companion blinked": the permanent a trigger was about. */
  const subjectOf = (origin: string[] | undefined) =>
    /^(.+?) (?:entering|blinked)$/.exec(origin?.[0] ?? '')?.[1] ?? ''

  const LEAVE_MS = 260
  const GAP_MS = 90

  /** Animates the top item off, then runs `after`. Ignored while another item is leaving. */
  const animateTop = (after: () => void) => {
    const top = gameRef.current.stack[gameRef.current.stack.length - 1]
    if (!top || leavingId !== null) return
    setLeavingId(top.id)
    timer.current = window.setTimeout(() => {
      setLeavingId(null)
      after()
    }, LEAVE_MS)
  }

  const resolveTop = () => {
    const top = game.stack[game.stack.length - 1]
    if (!top) return
    animateTop(() => {
      dispatch({ type: 'resolveTop' })
      if (top.controller !== YOU) return
      const entering = permanentFromResolved(top)
      if (entering) {
        offerEnters(entering, [...gameRef.current.battlefield, entering], entryOfResolved(top))
        return
      }
      // Blinks, reanimation and token copies put something onto the battlefield that the
      // app cannot name on its own, so it asks.
      const effect = entryEffect(top.text)
      if (effect) {
        setPendingEntry({
          effect,
          from: top.title.replace(/^Copy of /, ''),
          origin: top.origin,
          picked: 0,
        })
      }
    })
  }

  const cascadeHit = () => {
    animateTop(() => {
      dispatch({ type: 'resolveTop' })
      setPickingHit(true)
    })
  }

  const untilDecision = resolvableWithoutDecision(game, commanderIds)

  const stopAuto = () => {
    window.clearTimeout(timer.current)
    setLeavingId(null)
    setAuto(null)
  }

  /** Resolves one quiet item at a time with the leave animation, until a decision is needed. */
  const runAuto = (done: number, total: number) => {
    const current = gameRef.current
    const remaining = resolvableWithoutDecision(current, commanderIds)
    if (done >= total || remaining === 0) {
      setAuto(null)
      return
    }
    const top = current.stack[current.stack.length - 1]
    setLeavingId(top.id)
    timer.current = window.setTimeout(() => {
      dispatch({ type: 'resolveTop' })
      setLeavingId(null)
      setAuto({ done: done + 1, total })
      timer.current = window.setTimeout(() => runAuto(done + 1, total), GAP_MS)
    }, LEAVE_MS)
  }

  const resolveUntilDecision = () => {
    if (untilDecision === 0 || auto || leavingId !== null) return
    setAuto({ done: 0, total: untilDecision })
    runAuto(0, untilDecision)
  }

  return (
    <div className="app">
      {(current === 'decks' || (current === 'game' && !decks.activeDeck)) && (
        <DeckList
          decks={decks.decks}
          activeDeckId={decks.activeDeckId}
          onPlay={play}
          onDelete={(deck) => decks.deleteDeck(deck.id)}
          onImport={() => setScreen('import')}
        />
      )}

      {current === 'import' && (
        <DeckImport
          onSave={(deck) => {
            decks.addDeck(deck)
            startGame(deck)
            setScreen('game')
          }}
          onCancel={() => setScreen('decks')}
          onShowCard={setDetail}
        />
      )}

      {current === 'game' && decks.activeDeck && (
        <>
          <header className="topbar">
            <button className="ghost" onClick={() => setScreen('decks')}>
              ‹ Decks
            </button>
            <div className="title">
              <h1>{decks.activeDeck.name}</h1>
              <small>
                {game.stack.length === 0 ? 'Stack empty' : `${game.stack.length} on the stack`}
              </small>
            </div>
            <span className="spacer" />
            <div className="toolbar">
              <button onClick={undo} disabled={!canUndo} title="Undo">
                ↶ Undo
              </button>
              <button onClick={redo} disabled={!canRedo} title="Redo">
                ↷ Redo
              </button>
              <button
                className={panel === 'log' ? 'primary' : ''}
                onClick={() => setPanel(panel === 'log' ? 'stack' : 'log')}
              >
                Log{game.history.length > 0 ? ` (${game.history.length})` : ''}
              </button>
              <button
                className={panel === 'notes' ? 'primary' : ''}
                onClick={() => setPanel(panel === 'notes' ? 'stack' : 'notes')}
                title="Deck notes"
              >
                Notes{decks.activeDeck.notes?.length ? ` (${decks.activeDeck.notes.length})` : ''}
              </button>
              <button
                className="danger"
                onClick={() => {
                  const deck = decks.activeDeck
                  if (!deck) return
                  if (
                    game.stack.length === 0 ||
                    window.confirm('Clear the stack and start a new game?')
                  ) {
                    startGame(deck)
                  }
                }}
              >
                New game
              </button>
            </div>
          </header>

          <div className="game">
            <section className="pane" aria-label="Deck">
              <Palette
                deck={decks.activeDeck}
                battlefield={game.battlefield}
                onPush={(item) => dispatch({ type: 'push', item })}
                onCast={(card, faceIndex) => cast(card, faceIndex, 'hand')}
                onShowCard={setDetail}
                onFieldAdd={(card, faceIndex) =>
                  dispatch({ type: 'battlefieldAdd', card, faceIndex })
                }
                onFieldRemove={(id) => dispatch({ type: 'battlefieldRemove', id })}
                onFieldReenter={(id) => {
                  const permanent = game.battlefield.find((p) => p.id === id)
                  if (permanent) blink(permanent)
                }}
              />
            </section>
            <section className="pane stack-pane" aria-label="Stack">
              <div className="pane-header" style={{ display: 'block' }}>
                <QuickAdd
                  onPush={(item) => dispatch({ type: 'push', item })}
                  onShowCard={setDetail}
                />
              </div>
              <div className="pane-body">
                {panel === 'log' && (
                  <HistoryPanel
                    history={game.history}
                    onClear={() => dispatch({ type: 'clearHistory' })}
                  />
                )}
                {panel === 'notes' && (
                  <NotesPanel
                    notes={decks.activeDeck.notes ?? []}
                    onChange={(notes) => decks.updateDeck({ ...decks.activeDeck!, notes })}
                  />
                )}
                {panel === 'stack' && (
                  <StackView
                    game={game}
                    dispatch={dispatch}
                    leavingId={leavingId}
                    auto={auto}
                    onStopAuto={stopAuto}
                    onResolveTop={resolveTop}
                    onCascadeHit={cascadeHit}
                    untilDecision={untilDecision}
                    onResolveUntilDecision={resolveUntilDecision}
                    onShowCard={setDetail}
                    onInsight={setInsight}
                  />
                )}
              </div>
            </section>
          </div>
        </>
      )}

      {sheet && (
        <TriggerSheet
          title={sheet.title}
          subtitle={sheet.subtitle}
          suggestions={sheet.suggestions}
          castFrom={sheet.cast?.castFrom}
          onCastFromChange={
            sheet.cast
              ? (castFrom) => {
                  const c = sheet.cast!
                  openCastSheet(c.spellId, c.card, c.faceIndex, castFrom, game.battlefield)
                }
              : undefined
          }
          entry={sheet.enters?.entry}
          onEntryChange={
            sheet.enters && !sheet.enters.blink
              ? (entry) => {
                  const e = sheet.enters!
                  offerEnters(e.permanent, e.battlefield, entry, { then: sheet.then })
                }
              : undefined
          }
          onConfirm={(chosen) => {
            dispatch({
              type: 'pushMany',
              items: itemsFor(chosen, sheet.event, sheet.cast?.spellId),
            })
            setSheet(null)
            sheet.then?.()
          }}
          onSkip={() => {
            setSheet(null)
            sheet.then?.()
          }}
        />
      )}

      {pendingEntry && pendingEntry.effect.kind === 'blink' && (
        <PermanentPicker
          title={`${pendingEntry.from}: which permanent came back?`}
          subtitle="It left the battlefield and returned at once. Pick it to put its leaves and enters triggers on the stack."
          permanents={game.battlefield}
          cancelLabel="None of mine"
          onPick={(permanent) => {
            setPendingEntry(null)
            blink(permanent)
          }}
          onCancel={() => setPendingEntry(null)}
        />
      )}

      {pendingEntry && pendingEntry.effect.kind !== 'blink' && decks.activeDeck && (
        <DeckPicker
          title={
            pendingEntry.effect.kind === 'tokenCopy'
              ? `${pendingEntry.from}: what is the token a copy of?`
              : `${pendingEntry.from}: what entered the battlefield?`
          }
          subtitle={
            pendingEntry.effect.kind === 'tokenCopy'
              ? 'The token enters the battlefield with the abilities of what it copies, so its enters triggers fire again. It was not cast.'
              : pendingEntry.effect.keeps
                ? 'It was put onto the battlefield without being cast. Pick it to add it to your battlefield and offer its enters triggers.'
                : 'They enter under your control, so their enters triggers are yours (CR 603.3a), before each opponent takes one. They are not added to your battlefield list.'
          }
          deck={decks.activeDeck}
          includeLands={
            pendingEntry.effect.kind === 'fromElsewhere' &&
            (pendingEntry.effect.cardType === undefined ||
              /^(permanent|land)$/.test(pendingEntry.effect.cardType))
          }
          typeFilter={
            pendingEntry.effect.kind === 'fromElsewhere' ? pendingEntry.effect.cardType : undefined
          }
          initialFilter={
            pendingEntry.effect.kind === 'tokenCopy' ? subjectOf(pendingEntry.origin) : ''
          }
          cancelLabel={pendingEntry.picked > 0 ? 'Nothing else entered' : 'Nothing entered'}
          onPick={(card) => entered(card, pendingEntry)}
          onCancel={() => setPendingEntry(null)}
        />
      )}

      {pickingHit && decks.activeDeck && (
        <DeckPicker
          title="Cast the exiled card"
          subtitle="Pick the card you exiled and are casting. It is cast from exile, not your hand."
          deck={decks.activeDeck}
          onPick={(card) => {
            setPickingHit(false)
            cast(card, 0, 'elsewhere')
          }}
          onCancel={() => setPickingHit(false)}
        />
      )}

      {insight && (
        <InsightPanel item={insight} stack={game.stack} onClose={() => setInsight(null)} />
      )}

      {detail && <CardDetail card={detail} onClose={() => setDetail(null)} />}
    </div>
  )
}
