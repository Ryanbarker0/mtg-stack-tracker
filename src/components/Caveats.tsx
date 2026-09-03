/**
 * The honest contract of the app, shown where a new user first meets it. It exists so
 * nobody assumes the app enforces the rules or knows the whole board.
 */
export function Caveats({ open = false }: { open?: boolean }) {
  return (
    <details className="caveats" open={open}>
      <summary>What this app does, and what it leaves to you</summary>
      <div className="stackable" style={{ gap: 10 }}>
        <p>
          This is a stack tracker with suggestions. It is not a rules engine and it never rules on
          your play. You are the judge; it keeps the stack visible and saves taps when things get
          big.
        </p>
        <div>
          <strong>Trust it for</strong>
          <ul>
            <li>Card text, types, colours and mana values, all straight from Scryfall.</li>
            <li>
              Which of your permanents trigger when you cast a spell or a permanent enters, for the
              two wordings it reads: “whenever you cast a[n] X spell” and “whenever a[n] X enters”,
              plus granted cascade.
            </li>
            <li>
              Copies: what a copy-all trigger copies, that copies are not cast, that copied
              permanent spells become tokens, and that a doubler applies to triggers but not to
              copies.
            </li>
            <li>Mana value conditions, which are checked against the card’s printed cost.</li>
          </ul>
        </div>
        <div>
          <strong>Check yourself</strong>
          <ul>
            <li>
              Anything tagged <em>Check:</em>. It quotes the clause the app could not judge, such as
              an intervening “if”.
            </li>
            <li>
              Whether you were allowed to cast at that moment. Timing and flash are not checked.
            </li>
            <li>Targets and their legality. Use the note field on a stack item.</li>
            <li>
              Triggers the app cannot see: graveyard and exile triggers, life gain, draws, deaths,
              attacks.
            </li>
            <li>
              The battlefield strip is a list you maintain. Remove a permanent when it leaves play.
            </li>
            <li>Which mana you spent, for abilities like Path of Ancestry.</li>
            <li>
              The import review. Ability classification reads printed text and can miss unusual
              wording, so look over what is ticked.
            </li>
          </ul>
        </div>
        <p className="faint">
          Everything stays on this device. Nothing is uploaded, and the deck is only stored in this
          browser.
        </p>
      </div>
    </details>
  )
}
