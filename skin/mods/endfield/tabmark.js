// Where the tab strip's sliding marker sits. No Herdr import: tests/tabmark.test.mjs runs it under node.

/**
 * ids: the shown tabs' ids, in order. widths: each tab's laid-out width by id, as on_size_change
 * reported it, which is in window px. active: the selected tab's index, or -1. zoom: settings().zoom.
 * Returns the marker's left and width in the px a mod writes, which Herdr draws times the zoom.
 * A tab not measured yet counts as 0 wide; a width whose tab is gone is ignored.
 */
export function markAt({ ids, widths, active, zoom }) {
  const scale = zoom > 0 ? zoom : 1;
  const wide = (id) => (widths[id] ?? 0) / scale;
  if (active < 0 || active >= ids.length) return { left: 0, width: 0 };
  return { left: ids.slice(0, active).reduce((x, id) => x + wide(id), 0), width: wide(ids[active]) };
}
