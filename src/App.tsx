import { useState } from 'react'
import { CardDetail } from './components/CardDetail'
import { DeckImport } from './components/DeckImport'
import { DeckList } from './components/DeckList'
import { HistoryPanel } from './components/HistoryPanel'
import { Palette } from './components/Palette'
import { QuickAdd } from './components/QuickAdd'
import { StackView } from './components/StackView'
import type { Card, Deck } from './lib/types'
import { YOU } from './state/game'
import { useDecks } from './state/useDecks'
import { useGame } from './state/useGame'

type Screen = 'decks' | 'import' | 'game'

export default function App() {
  const decks = useDecks()
  const { game, dispatch, undo, redo, canUndo, canRedo } = useGame()
  const [screen, setScreen] = useState<Screen | null>(null)
  const [detail, setDetail] = useState<Card | null>(null)
  const [showHistory, setShowHistory] = useState(false)

  if (!decks.loaded) return null

  // First render: go straight into the game if a deck was active last time.
  const current: Screen = screen ?? (decks.activeDeck ? 'game' : 'decks')

  const play = (deck: Deck) => {
    decks.setActiveDeckId(deck.id)
    setScreen('game')
  }

  const top = game.stack[game.stack.length - 1]
  const topIsMine = top !== undefined && top.controller === YOU
  const others = game.stack
    .slice(0, -1)
    .filter((i) => i.controller === YOU && i.kind !== 'note').length

  return (
    <div className="app">
      {current === 'decks' && (
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
                  if (
                    game.stack.length === 0 ||
                    window.confirm('Clear the stack and start a new game?')
                  ) {
                    dispatch({ type: 'newGame' })
                    setShowHistory(false)
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
                onPush={(item) => dispatch({ type: 'push', item })}
                onShowCard={setDetail}
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
                  <StackView game={game} dispatch={dispatch} onShowCard={setDetail} />
                )}
              </div>
            </section>
          </div>
        </>
      )}

      {current === 'game' && !decks.activeDeck && (
        <DeckList
          decks={decks.decks}
          activeDeckId={decks.activeDeckId}
          onPlay={play}
          onDelete={(deck) => decks.deleteDeck(deck.id)}
          onImport={() => setScreen('import')}
        />
      )}

      {detail && <CardDetail card={detail} onClose={() => setDetail(null)} />}
    </div>
  )
}
