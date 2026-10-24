// The order a reader meets the shell top bar's controls in.
//
// Each control is described by its viewport rectangle (getBoundingClientRect: top, bottom, left, height), not by
// offsetTop. offsetTop is measured from each element's own offset parent, so controls that sit in different
// groups can report offsets that do not compare with each other.
//
// Rows. Two controls share a row when their vertical extents overlap (top to bottom), or when one control's
// vertical centre falls inside the other's extent. A control centred in a taller group sits a pixel or two
// lower than its neighbours on the same row, but its extent still overlaps theirs, so it stays on the row. A
// wrapped second row starts at or below the first row's bottom edge, so its controls do not overlap the first
// row and stay separate. The rule uses only these geometric facts; it has no pixel threshold. The centre test is
// implied by the overlap test for controls with positive height. It is kept so the rule reads as it is stated.
//
// A row's extent is the union of its members' extents, so a control that overlaps any member joins the row.
// Rows are read top to bottom; controls within a row are read left to right.

function sharesRow(row, control) {
  const centre = control.top + control.height / 2
  const overlaps = control.top < row.bottom && control.bottom > row.top
  const centreInside = centre > row.top && centre < row.bottom
  return overlaps || centreInside
}

export function visualOrder(controls) {
  const rows = []
  const byTop = controls.toSorted((a, b) => a.top - b.top || a.left - b.left)
  for (const control of byTop) {
    const row = rows.find((candidate) => sharesRow(candidate, control))
    if (row) {
      row.members.push(control)
      row.top = Math.min(row.top, control.top)
      row.bottom = Math.max(row.bottom, control.bottom)
    } else {
      rows.push({ top: control.top, bottom: control.bottom, members: [control] })
    }
  }
  return rows
    .toSorted((a, b) => a.top - b.top)
    .flatMap((row, index) =>
      row.members
        .toSorted((a, b) => a.left - b.left)
        .map((control) => Object.assign(control, { row: index }))
    )
}
