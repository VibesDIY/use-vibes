# Image Generation Component Enhancement Plan

## Current Status

The current `ImgGen` component and related utilities (`ImgGenUtils`) support four basic states:
1. **Prompt Waiting** - When no prompt or ID is provided
2. **Loading** - Displays a placeholder with progress indicator during image generation
3. **Loaded Image** - Displays the generated image once available with a small "ⓘ Info" button visible at the bottom
4. **Error** - Displays an error message if image generation fails

## Missing Interactive States to Implement

### State 4: Caption Overlay
- When user clicks the "ⓘ Info" button (already visible in State 3):
- Create an overlay div (positioned absolutely at the bottom of the image)
- Include prompt text at the top of the overlay
- Include control buttons (refresh, version history) on the bottom line
- Display delete button (✕) in the top-right corner of the image (only visible in this state)

### State 5: Multiple Image Versions
- Implement version history tracking when new versions are generated
- Enable left/right arrow navigation buttons (◀︎ ▶︎)
- Display current version indicator (e.g., "2 of 3")
- Implement refresh button (⟳) functionality to generate new versions

### State 6: Deletion Confirmation
- Implement delete (✕) button functionality
- Create a confirmation overlay with:
  - Semi-transparent dark background
  - Confirmation text: "Delete image? This can't be undone."
  - Two buttons: "Cancel" and "Delete"

## Implementation Steps

1. **Extend ImgGenDisplay Component**:
   - Add "ⓘ Info" button to the basic image display (State 3)
   - Add delete button to the top-right corner (only when overlay is visible)
   - Add state variables for overlay visibility and version management
   - Implement caption overlay with fade animations (CSS transitions)

2. **Create Version Management**:
   - Track image versions in an array
   - Store version history in the Fireproof database
   - Implement navigation between versions

3. **Implement Delete Functionality**:
   - Create confirmation overlay component
   - Handle delete confirmation/cancellation actions
   - Implement document deletion from database

4. **New/Modified Components**:
   - `ImgGenOverlay`: For displaying caption and controls
   - `ImgGenDeleteConfirmation`: For delete confirmation
   - `ImgGenVersionControls`: For version navigation

## Component Architecture

```tsx
<ImgGen>
  └── <ImgGenDisplay>
      ├── <ImgFile /> (from use-fireproof)
      ├── <DeleteButton />
      ├── <ImgGenOverlay>
      │   ├── <PromptDisplay />
      │   └── <ControlsBar>
      │       ├── <InfoButton />
      │       ├── <VersionNavigation />
      │       └── <RefreshButton />
      └── <DeleteConfirmation /> (conditionally rendered)
```

## CSS Considerations

- Use transition-opacity for fade animations
- Implement hover states for all interactive elements
- Ensure version buttons are properly disabled when no additional versions exist
- Use backdrop-blur for overlay background as shown in the mockup

## Testing Approach

- Verify all six states function correctly
- Test version navigation with multiple generated images
- Ensure proper error handling for regeneration failures
- Verify delete confirmation works as expected

## Implementation Timeline

1. Create the overlay component with info button
2. Implement version management and navigation
3. Add delete confirmation functionality
4. Finalize styling to match the mockup
