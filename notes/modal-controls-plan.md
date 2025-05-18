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
