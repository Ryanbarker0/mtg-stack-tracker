# MTG Stack Tracker

A touch-first web app for visualising the Magic: The Gathering stack during complex turns.
Built for commanders like Ulalek, Fused Atrocity, where a single cast can put a dozen triggers and copies on the stack.

The app is a tracker, not a rules engine.
You remain the judge.
It makes the stack visible to you and to the table, and keeps the order honest.

## What it does

- Import a deck by pasting a decklist from Archidekt or Moxfield.
- Every card is looked up on Scryfall.
  No card text is hand-authored or assumed.
- Each paragraph of oracle text is classified as triggered, activated, mana or static.
  Instants, sorceries and cards with a triggered or activated ability are ticked for the in-game palette by default, and you can override any card.
  If the commander's text says "whenever you cast a(n) X spell", every card of type X is ticked as well, so for Ulalek all Eldrazi spells are in the palette.
  Every nonland card uses the stack when cast, so anything left unticked can still be added mid-game with quick add.
- In a game, tap an ability to put it on the stack, or tap Cast to put the card on as a spell.
- The app keeps a light list of the permanents you control.
  Your commander starts there, permanent spells you resolve move there automatically, and you can add or remove anything with the Field button.
- When you Cast, the app reads the oracle text of your permanents and offers every "whenever you cast" trigger that matches the spell, plus the spell's own "when you cast" trigger, in one sheet.
  Your commander's trigger is placed on top of the stack so it resolves first.
  When a permanent resolves, the same sheet offers its "when this enters" trigger and any "whenever a creature enters" triggers you control.
- Abilities a permanent grants to the spell are offered too.
  Zhulodok's double cascade appears as the spell's own trigger, doubled again by Echoes.
- Echoes of Eternity is handled on both lines.
  Its doubling is applied as a ×2 on suggested triggers from colorless sources, and its "copy it" trigger copies the spell automatically when it resolves.
  Copies of that trigger, such as those Ulalek makes, copy the spell again.
- When a copy-all trigger such as Ulalek's is on top, the item shows "Pay, copy all" and "Don't pay" so the choice is explicit.
- A grouped summary above the stack counts what is there, so a 50-item Ulalek stack can be read to the table.
  The log has the same summary for everything that resolved, plus how many tokens were made.
- A cascade trigger on top offers "Cast the hit".
  Pick the exiled card from the whole deck and it is cast from exile, with its own trigger sheet.
- "Resolve N until the next choice" clears quiet items from the top and stops at a payment, a sacrifice, a cascade, an opponent's item, or a permanent with enters triggers.
  It only appears when at least two items would resolve, and it is always optional.
- Cast sheets know where the spell was cast from.
  The Cast button means from hand; cascade hits are from exile; a toggle on the sheet covers Mystic Forge and the like.
- Every sheet is a suggestion you confirm.
  Mana value conditions are evaluated from Scryfall data, so Sanctum of Ugin only appears for a spell with mana value 7 or more.
  Conditions the app cannot evaluate, such as "from your hand" or Guardian Project's name check, are offered with a "Check:" tag quoting the clause.
- The stack is drawn top-first.
  Resolve the top item, remove anything that was countered or fizzled, reorder simultaneous triggers, copy an item, or add a note for targets.
- "Resolve, copy all others" handles Ulalek's trigger in one tap.
  The top trigger resolves and every other spell and ability you control is copied onto the stack.
- Quick add anything not in your deck.
  Type "Kyle: Counterspell" to look up an opponent's card, or add plain text as a note.
- Tap a card for its full image, classified abilities and Scryfall rulings.
- Undo and redo every action.
- Everything is stored on the device and card images are cached, so a game works without network once a deck is imported.

## Running locally

```sh
nvm use
npm install
npm run dev
```

Other scripts:

```sh
npm test          # unit tests (vitest)
npm run lint      # oxlint
npm run format    # prettier
npm run build     # type-check and production build
```

## Deployment

Pushes to `main` build and deploy to GitHub Pages via `.github/workflows/deploy.yml`.
The workflow runs lint, tests and the build before deploying.
The Vite base path is set from the repository name at build time.

On the iPad, open the deployed URL in Safari and use Share, then Add to Home Screen.
The app installs as a standalone PWA and updates itself on the next launch after a deploy.

## Project layout

- `src/lib/decklist.ts` parses pasted decklists.
- `src/lib/scryfall.ts` talks to the Scryfall API and maps its responses to the local card shape.
- `src/lib/abilities.ts` classifies oracle text paragraphs.
  This is a deliberate heuristic and the import review step exists so mistakes cost a tap, not a game action.
- `src/state/game.ts` is the pure reducer for the stack.
- `src/state/useGame.ts` adds undo, redo and persistence.
- `src/components/` holds the screens: deck list, import review, palette, stack, quick add and card detail.

## Known limitations

- Archidekt blocks browser requests from other origins, so decks are imported by pasting the text export rather than by URL.
- Ability classification is text-based.
  Unusual wording may be misclassified, which is why the import review exists.
- Trigger suggestions only understand "whenever you cast a[n] X spell", "whenever a[n] X enters" and granted cascade, evaluated against Scryfall's type line and colours.
  Graveyard triggers such as Kozilek's Return are not modelled; tap them from the palette.
  Anything else on your permanents still has to be tapped by hand from the palette.
- Decks imported before colours were stored do not know which cards are colorless.
  Re-import the deck and "colorless" conditions will evaluate.
- Single user and single device.
  There is no sync between devices.
