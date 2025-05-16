# Image Generation Component Enhancement Plan

## Current Status and Semantic State Model

The current `ImgGen` component and related utilities (`ImgGenUtils`) support these states:

| State Identifier | Description                                                                                    |
| ---------------- | ---------------------------------------------------------------------------------------------- |
| `PROMPT_WAITING` | When no prompt or ID is provided                                                               |
| `LOADING`        | Displays a placeholder with progress indicator during image generation                         |
| `READY`          | Displays the generated image once available with a small "ⓘ Info" button visible at the bottom |
| `ERROR`          | Displays an error message if image generation fails                                            |

## Missing Interactive States to Implement

### `OVERLAY_OPEN` (formerly State 4)

- When user clicks the "ⓘ Info" button (already visible in the `READY` state):
- Create an overlay div (positioned absolutely at the bottom of the image)
- Include prompt text at the top of the overlay
- Include control buttons (refresh, version history) on the bottom line
- Display delete button (✕) in the top-right corner of the image (only visible in this state)
- The delete button should also appear briefly on hover even when overlay is closed for discoverability

**When multiple versions exist:**

- Show version history navigation controls in the overlay
- Enable left/right arrow navigation buttons (◀︎ ▶︎) with keyboard support (← → arrow keys)
- Display current version indicator (e.g., "2 of 3") with appropriate ARIA attributes
- Implement refresh button (⟳) functionality to generate new versions
- Properly disable navigation buttons when at first/last version with visual indication

### `DELETE_CONFIRM` (formerly State 6)

- Implement delete (✕) button functionality
- Create a confirmation overlay with:
  - Semi-transparent dark background
  - Confirmation text: "Delete image? This can't be undone."
  - Two buttons: "Cancel" and "Delete"
  - Focus trap within modal for keyboard accessibility
  - ESC key should cancel deletion

## Implementation Steps

1. **Refactor Component Structure**:

   - Extract a new parent component `ImgGenViewer` to manage shared state
   - Move current `ImgGenDisplay` code inside it
   - Add state management with `useReducer` for state transitions
   - Implement proper keyboard accessibility (arrow keys, ESC)

2. **Add Overlay Components**:

   - Add "ⓘ Info" button to the basic image display (`READY` state)
   - Create `ImageFrame` component with hover-triggered delete button
   - Implement `CaptionOverlay` with fade animations using CSS transitions
   - Use `react-focus-lock` or equivalent for focus trapping in modals

3. **Create Version Management**:

   - Track image versions as `_files` in the document (as requested)
   - Implement navigation between versions with proper ARIA attributes
   - Add keyboard shortcut support (← → arrows for navigation)

4. **Implement Delete Functionality**:
   - Create `DeleteConfirmation` component with two-step confirmation
   - Add additional data layer confirmation as security precaution
   - Implement document deletion from database with proper cleanup

## Component Architecture

```tsx
<ImgGen>
  └── <ImgGenViewer> {/* New parent component for state management */}
      ├── <ImageFrame> {/* Image + hover controls */}
      │   ├── <ImgFile /> {/* from use-fireproof, wrapped in React.memo */}
      │   └── <DeleteButton /> {/* Only visible on hover or when overlay is open */}
      ├── <CaptionOverlay> {/* Controlled by isOverlayOpen state */}
      │   ├── <PromptDisplay /> {/* With appropriate escaping for security */}
      │   └── <ControlsBar>
      │       ├── <InfoButton aria-expanded={isOverlayOpen} />
      │       ├── <VersionNavigation aria-live="polite" />
      │       └── <RefreshButton />
      └── <DeleteConfirmation focusTrap /> {/* Modal with focus trap */}
```

## CSS & Accessibility Considerations

- Replace inline styles with Tailwind classes or CSS modules for maintainability
- Use `transition-opacity` and `duration-200` classes for animations
- Add `aria-label` to all buttons and `aria-live="polite"` to version counter
- Implement visible focus states with `focus-visible:outline-2 focus-visible:outline-offset-2`
- Ensure all interactive elements have proper roles and keyboard support
- Use `backdrop-blur-sm` for overlay background

## Testing Approach

- **Unit Tests**:

  - Test state management logic in isolation (useReducer actions)
  - Test version navigation utilities without DOM dependencies

- **Component Tests**:

  - Verify all states function correctly (`READY`, `OVERLAY_OPEN`, `DELETE_CONFIRM`)
  - Test conditional rendering of version controls when multiple versions exist
  - Test keyboard interactions (arrows, ESC, Tab trapping)
  - Ensure proper error handling for regeneration failures

- **Browser Tests**:
  - Mock `call-ai` with MSW or similar
  - Test the full flow from generation → overlay → version navigation → deletion
  - Avoid adding environment-specific flags in src/ code

## Incremental Implementation Plan

1. Refactor: Extract `ImgGenViewer` with state machine, keeping current functionality
2. Add overlay with info button and rudimentary controls
3. Implement version navigation between \_files in document
4. Add delete confirmation flow
5. Enhance with keyboard support and accessibility features
6. Replace inline styles with Tailwind classes

All code changes will follow pnpm scripts for linting and testing to ensure high quality.
