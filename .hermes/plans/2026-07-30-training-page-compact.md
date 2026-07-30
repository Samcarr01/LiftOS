# Training Page Fixes

## Issues

1. **Page too stretched** — `list-row` has `px-4 py-3.5` (32px horizontal padding). On a 375px phone, this leaves only 343px for content. The `justify-between` pushes labels and controls to opposite edges, creating a "stretched" look.

2. **Experience buttons don't fit** — 7 buttons with `px-2` each need ~420px but only have ~343px. The `overflow-x-auto` scroll is hard to notice.

3. **Weekly goal is buried** — below the 7 experience buttons. Should be at the top.

4. **Training stage descriptions mention sessions/wk** — e.g. "2 sessions per week, linear progression" — makes the user think the stage controls their weekly target.

## Fixes

| File | Change |
|---|---|
| `web/src/app/globals.css` | Reduce `list-row` padding from `px-4 py-3.5` to `px-3 py-3` |
| `web/src/app/(app)/profile/training/page.tsx` | Move weekly goal above experience. Replace 7 horizontal experience buttons with a simple `<select>` dropdown on mobile (or use `flex-wrap` with smaller buttons) |
| `web/src/lib/leveling/training-stage.ts` | Rewrite all 7 descriptions to remove sessions/wk and progression style — just describe the experience level |

## Branch

`fix/training-page-compact`