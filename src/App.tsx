import { useState } from 'react'
import { CardDetail } from './components/CardDetail'
import { DeckImport } from './components/DeckImport'
import { DeckList } from './components/DeckList'
import { HistoryPanel } from './components/HistoryPanel'
import { Palette } from './components/Palette'
import { QuickAdd } from './components/QuickAdd'
import { StackView } from './components/StackView'
import { TriggerSheet } from './components/TriggerSheet'
import { itemForAbility, itemForSpell } from './lib/stackItems'
import { castTriggers, entersTriggers, type Suggestion } from './lib/triggers'
import type { BattlefieldPermanent, Card, Deck } from './lib/types'
import { YOU, permanentFromResolved, type NewItem } from './state/game'
import { useDecks } from './state/useDecks'
import { useGame } from './state/useGame'

type Screen = 'decks' | 'import' | 'game'

interface Sheet {
  title: string
  subtitle: string
  suggestions: Suggestion[]
}

export default function App() {
  const decks = useDecks()
  const { game, dispatch, undo, redo, canUndo, canRedo } = useGame()
  const [screen, setScreen] = useState<Screen | null>(null)
  const [detail, setDetail] = useState<Card | null>(null)
  const [showHistory, setShowHistory] = useState(false)
  const [sheet, setSheet] = useState<Sheet | null>(null)

  if (!decks.loaded) return null

  // First render: go straight into the game if a deck was active last time.
  const current: Screen = screen ?? (decks.activeDeck ? 'game' : 'decks')

  const commanders = (deck: Deck) => deck.entries.filter((e) => e.isCommander).map((e) => e.card)
  const commanderIds = new Set(
    decks.activeDeck ? commanders(decks.activeDeck).map((c) => c.oracleId) : [],
  )

  const startGame = (deck: Deck) => {
    dispatch({ type: 'newGame', commanders: commanders(deck) })
    setShowHistory(false)
    setSheet(null)
  }

  const play = (deck: Deck) => {
    // Playing a different deck starts a fresh game; the same deck resumes where it was.
    if (deck.id !== decks.activeDeckId) startGame(deck)
    decks.setActiveDeckId(deck.id)
    setScreen('game')
  }

  const itemsFor = (chosen: Suggestion[]): NewItem[] =>
    chosen.flatMap((s) =>
      Array.from({ length: s.times }, () => itemForAbility(s.source, s.ability)),
    )

  const cast = (card: Card, faceIndex: number) => {
    dispatch({ type: 'push', item: itemForSpell(card, faceIndex) })
    const suggestions = castTriggers(card, faceIndex, game.battlefield, commanderIds)
    if (suggestions.length > 0) {
      setSheet({
        title: `Casting ${card.faces[faceIndex]?.name ?? card.name}`,
        subtitle:
          'These abilities trigger on the cast. They go on the stack above the spell in this order, so the last row ends up on top.',
        suggestions,
      })
    }
  }

  const resolveTop = () => {
    const top = game.stack[game.stack.length - 1]
    if (!top) return
    dispatch({ type: 'resolveTop' })
    const entering = permanentFromResolved(top)
    if (!entering || top.controller !== YOU) return
    const battlefield: BattlefieldPermanent[] = [...game.battlefield, entering]
    const suggestions = entersTriggers(entering, battlefield, commanderIds)
    if (suggestions.length > 0) {
      setSheet({
        title: `${entering.card.faces[entering.faceIndex]?.name ?? entering.card.name} entered`,
        subtitle: 'These abilities trigger on it entering the battlefield.',
        suggestions,
      })
    }
  }

  const top = game.stack[game.stack.length - 1]
  const topIsMine = top !== undefined && top.controller === YOU
  const others = game.stack
    .slice(0, -1)
    .filter((i) => i.controller === YOU && i.kind !== 'note').length

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
                onClick={() => dispatch({ type: 'resolveTopCopyingOthers', controller: YOU })}
                disabled={!topIsMine || others === 0}
                title="Ulalek: resolve the top trigger and copy every other spell and ability you control"
              >
                ⧉ Resolve, copy all others{others > 0 && topIsMine ? ` (${others})` : ''}
              </button>
              <button
                className={showHistory ? 'primary' : ''}
                onClick={() => setShowHistory((v) => !v)}
              >
                Log{game.history.length > 0 ? ` (${game.history.length})` : ''}
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
                onCast={cast}
                onShowCard={setDetail}
                onFieldAdd={(card, faceIndex) =>
                  dispatch({ type: 'battlefieldAdd', card, faceIndex })
                }
                onFieldRemove={(id) => dispatch({ type: 'battlefieldRemove', id })}
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
                {showHistory ? (
                  <HistoryPanel
                    history={game.history}
                    onClear={() => dispatch({ type: 'clearHistory' })}
                  />
                ) : (
                  <StackView
                    game={game}
                    dispatch={dispatch}
                    onResolveTop={resolveTop}
                    onShowCard={setDetail}
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
          onConfirm={(chosen) => {
            dispatch({ type: 'pushMany', items: itemsFor(chosen) })
            setSheet(null)
          }}
          onSkip={() => setSheet(null)}
        />
      )}

      {detail && <CardDetail card={detail} onClose={() => setDetail(null)} />}
    </div>
  )
}
