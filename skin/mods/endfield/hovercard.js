// The session card's one rule: whose card is up. No Herdr import: tests/ runs it under node.

/**
 * facts, read when the decision is made: `row` is the hovered agent row's address, `hot` the
 * overlay id of the card the pointer is on, `open` the card that is up ({ id, address }).
 * Returns the address whose card should be up, or null for none.
 */
export function wantedCard({ row = null, hot = null, open = null }) {
  return row ?? (open && hot === open.id ? open.address : null);
}
