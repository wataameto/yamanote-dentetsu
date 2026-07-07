# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

山手線電鉄 (Yamanote-Dentetsu) — a Momotetsu (桃太郎電鉄) -style board game built with Phaser 3 and Vite. No backend; everything runs client-side. Players race around a hexagon-shaped Yamanote-line loop (with a Chuo-line shortcut branch) buying properties, drawing cards, and dodging ノラネコ (a lightweight "poverty cat" mechanic), aiming for the highest total assets after N years.

See `DESIGN.md` for the original game-design research (Momotetsu mechanics) and phase plan; this file documents the actual as-built architecture.

## Commands

```
npm run dev      # start Vite dev server (http://localhost:5173)
npm run build     # production build to dist/
npm run preview   # preview the production build
```

No tests, no linter configured. When testing interactively with Playwright, run the dev server on a port other than 5173 (this session used 5299) and temporarily add `window.__game = new Phaser.Game(config)` in `main.js` for introspection — always revert that line before committing.

## Scenes

- **`src/scenes/TitleScene.js`** — title screen. Year-count picker (3×3 grid: 1/3/10/30/100/300/1000/3000/10000 years — yes, the joke long modes are real options) and a "つづきから" (continue) button that opens a 10-slot load modal (see Save below). Shares a single `SFX` instance and BGM playback with `GameBoardScene` via `this.registry` (`registry.get('sfx')`), so the theme keeps playing seamlessly across the scene transition.
- **`src/scenes/GameBoardScene.js`** — the entire game. Large single-scene class (~1400 lines) owning board state, HUD, turn flow, cards, properties, and modals. `create(data)` branches: fresh game (`setupNewGame`) vs. loaded save (`loadFromSaveData`, from `data.loadData`).

## Board model (`src/board.js`, `src/layout.js`, `src/stations.js`)

- `STATIONS` (30 Yamanote stations, `stations.js`) are laid out by `buildStationPositions()` (`layout.js`) into a hexagon shape with diagonal "shoulder" sections at 大崎/高輪ゲートウェイ (bottom) and 巣鴨/田端 (top) — extracted from an earlier tower-defense project's station-select screen.
- `buildBoard()` builds `mainLoop`: 60 cells, alternating `station` and small event cells (`blue`/`red`/`card`, weighted random via `pickSmallType`). Station `i` always occupies main-loop cell `2*i`.
- A separate `chuoPath` (5 cells: small, 四ツ谷, small, 御茶ノ水, small) models the Chuo-line shortcut connecting 新宿⇄神田.
- **Position representation**: `pos = { onChuo: boolean, index: number, chuoDir?: 1 | -1 }`. `chuoDir` only matters while `onChuo` is true — it says which direction the piece is currently walking along the 5-cell chuo path (`+1` = toward 神田, `-1` = toward 新宿). It is **not** meant to persist meaningfully across turns; every time movement is computed from an on-chuo position, both directions are freshly recomputed (see Movement below) and `chuoDir` on the actual player position gets overwritten in `beginMove` right before animating, so a stale value from a previous turn never leaks in.
- `stepForward`/`stepBackward` step the main loop in `+1`/`-1` cell direction. Both now support entering the chuo branch from **either** junction (新宿 or 神田) regardless of which of the two you call — the direction you were already traveling in on the main loop no longer restricts which junction you can dive in from. Once `onChuo`, both delegate to the shared `stepChuo()`, which walks by `pos.chuoDir` and exits to whichever main-loop junction is on that side. This means `stepForward`/`stepBackward` behave identically once on chuo — the distinction only matters for the main-loop-only portion of a path.
- `getCell(board, pos)` reads the cell at a position; `mainLoopDistance` is a rough forward/backward distance helper used for the ノラネコ "farthest player" calculation (see below) and CPU target-seeking heuristics.

## Movement / direction-choice system (`GameBoardScene.js`)

Momotetsu-style dice movement was reworked several times during development; the current model:

1. `rollAndChooseMove(player, diceCount)` rolls `diceCount` d6, then calls `computeDirectionOptions(player, totalSteps)`.
2. **If not on chuo**: up to 2 base options — `反時計回り`(ccw, `stepForward`) and `時計回り`(cw, `stepBackward`), always using the *full* roll (no "stop early" — that was tried and removed; see git history). Additionally, for **each** of the 4 combinations of (forward/backward) × (via 新宿/via 神田), `findChuoBranchPassThrough` checks whether that path passes through the junction cell mid-route (or the player is already sitting on it — handled by a dedicated `chuoEntryHereOption` special case, to avoid the direction check firing twice for the "already at the junction" case and creating a duplicate option). If it does, and steps remain, a 🚃 chuo option is added.
3. **If already on chuo**: `computeChuoDirectionOptions` computes the two possible travel directions (toward 新宿 / toward 神田) fresh, ignoring any previously-stored `chuoDir`. Each direction:
   - If the roll doesn't reach that exit: single option, landing inside the chuo path.
   - If it lands exactly on the exit: single option, landing on that station.
   - If it overshoots the exit: **forks** into continuing ccw or cw on the main loop for the leftover steps — two options.
   - So a single roll from mid-chuo can yield up to 4 options total (2 directions × up to 2 forks each).
4. **Arrow-key assignment**: because the board is a loop, "ccw" doesn't map to a fixed screen direction — on the left straight column ccw is "down", on the right column it's "up", and at 駒込/品川 it's left/right. Every option's key is computed from real geometry: `arrowKeyForStep(fromPos, oneStepTowardOption)` diffs pixel coordinates and returns whichever of Up/Down/Left/Right has the larger component. Collisions fall back to whatever arrow key isn't taken yet (`pickKey`/inline fallback logic). Do **not** reintroduce a fixed "near exit → Up/Down, far exit → Left/Right" scheme — that was tried and shipped a real bug (four谷→御茶ノ水, which is visually to the right, got assigned `←`) because it ignored actual geometry.
5. `beginMove` logs the choice, plays the shortcut jingle if `shortcutAtStep` is set, force-sets `player.pos.chuoDir` to the chosen branch's direction if starting from chuo (overriding stale state), then runs `animateSteps` (recursive, one cell per `this.delay(...)` tick, see Speed below), which resolves the cell effect once steps run out.

CPU movement (`cpuChooseOption`) picks the option landing exactly on the target if one exists, otherwise the option minimizing `approxDistanceToTarget` (a distance estimate that also handles the chuo branch by checking both exits).

## Turn flow highlights

- `checkTargetAtTurnStart` — target arrival is awarded not just by landing on it mid-move, but also if a player is *already standing* on the target station when their turn starts (e.g., after being sent there, or the target rotates onto them). This fixed a bug where 品川 (the shared start station) could never be claimed as a target because everyone started there and no one ever "arrived".
- `awardTargetArrival` gives the cash bonus, plays `celebrateGoal()` (emoji burst + camera flash), and reassigns ノラネコ to whichever player is farthest from the *old* target — using plain `(cellIdx - targetCellIdx + len) % len` (not `mainLoopDistance`, which has a `|| len` fallback that would wrongly mark the just-arrived player, sitting exactly on the target, as "farthest").
- Starting positions for the 4 players (you + CPU1-3) are evenly spaced around the loop (quarter-loop offsets) but the rotation offset is randomized per game (`Math.random()` in `setupNewGame`) — they used to be fixed to the same 4 stations every game, which was reported as a bug ("random spawn is always the same").

## Cards / Properties / Save

- `src/cards.js` — 12 cards across 5 categories (progress/move/attack/money/defense), weighted random draw.
- `src/properties.js` — 2-4 properties per station scaled by `rank`, monopoly doubles settlement income.
- `src/save.js` — 10 localStorage slots (`yamanote_dentetsu_save_N`). Save data is the whole scene state as plain JSON (board, properties, players, target, month/year, etc. — no functions, so it round-trips directly). Both the in-game save modal (`openSaveModal`, top-right/top-left "セーブ"/"タイトルへ" buttons) and the title screen's load modal read/write through this module.

## Speed setting

`this.speedLevel` (1-10, default 5, persisted in `this.registry`) scales every `this.delay(ms, cb)` call (animation ticks, CPU turn pause, settlement pause, etc.) via `this.speedFactor = speedLevel / 5` and `delay = ms * speedFactor`. **Lower number = faster** (shorter delay) per explicit user preference — this is the opposite of what you'd naively guess from a "speed" label, so don't "fix" it back to `ms / speedFactor`. Selected via a dialog (`openSpeedModal`, top-right "はやさ" button) showing all 10 levels in a grid, not a simple cycle button (an earlier 3-value cycle button was replaced with this).

## HUD layout gotchas

The board fills nearly the whole screen, so HUD elements are wedged into whatever empty space the hexagon layout leaves, computed from `this.layout` (`points`, `chuoPoints`, `buttonWidth/Height`, `centerX`) rather than hardcoded pixels:

- Player list + turn highlight: centered, in the gap above 四ツ谷/御茶ノ水.
- Dice button + card hand: centered, in the gap below 四ツ谷/御茶ノ水.
- Mute/Save/Speed buttons: top-right, laid out right-to-left by measuring each text's width (`layoutTopRow`); a mirrored "タイトルへ" shortcut (same action as Save, opens the same modal) sits top-left.
- Log/message text: below 品川, at the very bottom of the canvas — it was tried at the same height as 大崎/高輪ゲートウェイ first and overlapped their station-name text, since that gap is only ~6px tall.
- Player tokens are offset left of each station's button center (`tokenBaseOffsetX`) so they don't cover the station name; your own token additionally gets a pulsing gold ring (`createToken`) so it's distinguishable from the 3 CPU tokens at a glance.
- Small event-cell squares (blue/red/card) sit outside the station button on the straight left/right columns (`outwardOffsetX`, compares cell x to `centerX`), but the two cells that are literally the 新宿⇄四ツ谷 and 御茶ノ水⇄神田 seams are left unshifted so they sit exactly on the seam.
