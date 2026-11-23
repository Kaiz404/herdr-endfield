// The session card's rules: whose card is up, and when a press takes it away. No Herdr import:
// tests/ runs it under node.

/**
 * facts, read when the decision is made: `row` is the hovered agent row's address (null when the
 * list draws no rows or the agent is gone), `hot` the overlay id of the card the pointer is on,
 * `open` the card that is up ({ id, address }).
 * Returns the address whose card should be up, or null for none.
 */
export function wantedCard({ row = null, hot = null, open = null }) {
  return row ?? (open && hot === open.id ? open.address : null);
}

/**
 * Whether the open card goes now: `closed` is the overlay id last reported pressed beside or
 * closed by itself, `kept` the overlay id whose own row took the press.
 */
export function dismissed({ closed = null, open = null, kept = null }) {
  return Boolean(open) && closed === open.id && kept !== open.id;
}
