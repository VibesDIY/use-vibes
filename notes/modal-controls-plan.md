# Image Generation Component Refactoring Plan

This plan outlines a step-by-step approach to refactor the current ImgGen components into the cleaner architecture described in `modal-controls.md`.

## High-Level Refactor Plan

### 0. Inventory & Spike (½ day)
1. List every file that currently references `ImageOverlay`, `ImgGenDisplay`, `ImgGenPlaceholder`, `DeleteConfirmationOverlay`, the progress bar, and the "enableDelete / insideModal" prop.  
2. Note which pieces are used **only** in modal, **only** in display, or in **both**.  
3. Write tiny spike components (`PromptBar`, `ControlsBar`, `ImgGenModal`) with stub JSX and existing CSS classes so you can hot-swap quickly.

### 1. Isolate **PromptBar** (½ day)
1. Cut the top-of-overlay prompt section into its own component:
   ```tsx
   <PromptBar
     prompt={promptText}
     editedPrompt={editedPrompt}
     onEditStart={setEditedPrompt}
     onSave={handlePromptEdit}
   />
   ```
2. Keep double-click–to-edit logic inside `PromptBar`.  
3. Move the prompt-specific CSS selectors (`.imggen-prompt`, edit state colors, etc.) to `PromptBar.scss`.

Result: `ImageOverlay` shrinks and prompt code moves out of the way.

### 2. Extract **ControlsBar** (1 day)
1. Copy the bottom controls row (delete, version nav, regen button, progress bar) into `ControlsBar`:
   ```tsx
   <ControlsBar
     onDelete={toggleDeleteConfirm}
     onDeleteConfirm={handleDeleteConfirm}
     onDeleteCancel={handleCancelDelete}
     isDeleteConfirmOpen={isDeleteConfirmOpen}
     onPrev={handlePrevVersion}
     onNext={handleNextVersion}
     onRegenerate={handleRefresh}
     versionInfo={{ index: versionIndex, total: totalVersions }}
     progress={progress}
     statusText={statusText}
   />
   ```
2. DeleteConfirmation logic **stays** inside `ControlsBar`; when active it swaps normal controls for the confirmation UI.  
3. Make progress bar span the full height of `ControlsBar` (use `.imggen-progress` with `height: 100%`).  

### 3. Create **ImgGenModal** (1 day)
1. Replace the existing "backdrop + ImageOverlay" composite with a dedicated `ImgGenModal`.
2. Layout:
   ```
   ┌────────── ImgGenModal ──────────┐
   │                                 │
   │           Full Image            │
   │┌───────── ControlsArea ───────┐ │
   ││ PromptBar                    │ │
   ││ ControlsBar (progress bg)    │ │
   │└───────────────────────────────┘ │
   └─────────────────────────────────┘
   ```
3. Import `PromptBar` and `ControlsBar` instead of `ImageOverlay`.  
4. Kill the `insideModal` / `enableDelete` prop—modal-only features live inside the modal now.

### 4. Slim **ImgGenDisplay** (½ day)
1. States:
   * `empty`
   * `generating`
   * `error`
   * `complete`
   * `regenerating` (flag only; can be true while in modal or if user closed modal mid-regen)
2. UI in each state:  
   * `generating` → grey box + inline progress & prompt  
   * `error`      → error illustration + retry button  
   * `complete`   → thumbnail + **round expand button** (only interactive element)
3. Remove any overlay logic from `ImgGenDisplay`; it only opens `ImgGenModal`.

### 5. Clean CSS (½ day)
1. Delete obsolete selectors (`.imggen-info-button`, old overlay classes).  
2. Co-locate new component-specific styles (`PromptBar.scss`, `ControlsBar.scss`); re-export them in `ImgGen.css` if global variables are needed.

### 6. Type & Prop Cleanup (½ day)
1. Remove `enableDelete` / `insideModal` props everywhere.  
2. Introduce a single `ImgGenState` union type to share between display & modal.  
3. Delete vestigial helpers (toggleOverlay, showOverlay, etc.).

### 7. Test Pass (1 day)
1. Rewrite/rename tests to match new components:
   * `ImgGenDisplay.test.tsx`
   * `ImgGenModal.test.tsx`
   * `PromptBar.test.tsx`
   * `ControlsBar.test.tsx`
2. Ensure mocks for `callAI` & `imageGen` still work in browser tests.

### 8. Incremental Merge Strategy
* Create new files **alongside** old ones.
* Flip feature flags (or temporary prop) so you can toggle between legacy overlay and new modal during QA.
* Once new stack is verified, delete `ImageOverlay`, `ImgGenPlaceholder`, and related CSS.

## Effort Estimate
| Phase | Effort |
|-------|-------|
| 0 Inventory | 0.5d |
| 1 PromptBar | 0.5d |
| 2 ControlsBar | 1d |
| 3 ImgGenModal | 1d |
| 4 ImgGenDisplay | 0.5d |
| 5 CSS cleanup | 0.5d |
| 6 Types/Props | 0.5d |
| 7 Tests | 1d |
| **Total** | **~5d** |

## Translation Cheatsheet
| Old name / prop | New location |
|-----------------|-------------|
| `ImageOverlay` (modal & generating) | **ImgGenModal** (modal) **+** `ImgGenDisplay` (generating) |
| `enableDelete` / `insideModal` | **removed** – delete lives only in modal |
| Prompt UI JSX | **PromptBar** |
| Bottom controls JSX | **ControlsBar** |
| Progress logic (non-modal) | `ImgGenDisplay` *(Generating state)* |
| Progress logic (modal regen) | `ControlsBar` background |

Follow this roadmap sequentially to arrive at the cleaner, component-focused architecture without breaking the existing public API or user experience.

## Evening Cleanup Plan (One-Night Version)

### "No-Regression" Cleanup Roadmap  
Objective: ship tidier code **without breaking** existing behaviour.  
Time-box: one evening (≈ 6 h).  
Strategy: refactor in *thin, test-backed slices*—each slice compiles, runs, and keeps current UI/UX intact.

### 1 · Stabilise Baseline (30 min)

1. `pnpm test` → all green (or document existing failures).  
2. Commit **baseline** branch `cleanup/base-<date>` so you can bisect if needed.

### 2 · Introduce New Leaf Components (PromptBar & ControlsBar) (1 h)

1. **Copy, don't move** code from `ImageOverlay` into:  
   • `src/components/PromptBar.tsx` – view *and* edit mode.  
   • `src/components/ControlsBar.tsx` – full delete logic, version nav, regen, progress.  
2. Export them and add *unit tests* that mount each in isolation.  
   ```tsx
   render(<PromptBar prompt="foo" … />)
   expect(screen.getByText('foo')).toBeVisible()
   ```  
3. Ensure `ImageOverlay` continues to import **old JSX**; no behaviour change yet.

Commit slice.

### 3 · Refactor ImageOverlay to *use* New Parts (1 h)

1. Swap prompt & controls markup for `<PromptBar … />` + `<ControlsBar … />`.  
2. Pass same props that were previously inline (no new state plumbing).  
3. Delete now-unused chunks inside `ImageOverlay`.  
4. Ensure progress bar shows in both main image and modal (currently only visible on main image).
5. Run tests + manual smoke (generating → modal → delete etc.).

Commit slice.

### 4 · Extract ImgGenModal (1.5 h)

1. Move backdrop + figure markup from `ImgGenDisplay` into **new** `ImgGenModal.tsx`.  
2. Inside modal, keep `<PromptBar>` & `<ControlsBar>`.  
3. `ImgGenDisplay` now only toggles `showModal` and passes required props.  
4. Keep *old* generating overlay path untouched.  
5. Update tests:  
   * modal opens & closes  
   * controls still fire callbacks.

Commit slice.

### 5 · Simplify Props (insideModal → delete) (45 min)

1. Because delete now lives only in modal, nuke `insideModal` / `enableDelete`.  
2. Fix types & snapshots.  
3. Grep for the old prop names to be sure they're gone.  
4. CI tests green.

Commit slice.

### 6 · Generating State Cleanup (45 min)

1. Replace overlay-based generating view with simple `<div class="imggen-placeholder">`.  
2. Re-use `<PromptBar>` for prompt + progress.  
3. Remove `ImgGenPlaceholder.tsx` entirely.  
4. Tests: generating state shows progress, no regressions.

Commit slice.

### 7 · CSS Hygiene (30 min)

1. Delete unused classes: `.imggen-info-button`, old overlay bits.  
2. Co-locate new SCSS per component, keep variables in `ImgGen.css`.  
3. Run `pnpm lint:css`.

Commit slice.

### 8 · Final QA + Docs (30 min)

1. Full manual flow (generate → expand → edit prompt → regen → delete).  
2. Cross-browser spot-check (Chrome/Safari).  
3. Update `modal-controls.md` to reflect final file names.  
4. Merge branch to `main`.

### Ordering Rationale

• Each slice is **vertical**—touches JS, TS types, tests, and CSS only where needed, so nothing half-wired gets merged.  
• Tests at every step prevent regressions.  
• By keeping old components until the very end, the visible UI never breaks.

Tackle slices 1-3 tonight; you'll already have cleaner, componentised internals without behaviour change—good enough to demo. If time allows, push into slices 4-5 to eliminate the last confusing props.
