/**
 * Where the user is, for the Shadowland board (docs/PLAN-help-footer.md 3, r1 #3): each page SETS it for itself
 * (App can't see a document's kind or a character's open step). App clears it on every route change.
 */
export const board = $state({ page: "", step: "", race: "", choices: [] });
export function setBoard({ page = "", step = "", race = "", choices = [] } = {}) {
  board.page = page; board.step = step; board.race = race; board.choices = choices;
}
