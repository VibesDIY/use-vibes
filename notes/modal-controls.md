# Image Generation Component Architecture

This document outlines a cleaner, more focused architecture for the image generation components, based on lessons learned from the current implementation.

## Core Components

### 1. ImgGenDisplay

The main container component that renders the image in its normal (non-modal) state.

#### States:
- **Empty**: When no image has been requested yet
- **Generating**: During initial image generation
- **Regenerating**: During image regeneration (happens only in modal, but state tracked here, if users closes modal during regeneration, this is important)
- **Error**: When generation fails
- **Complete**: When image is successfully generated

#### UI Elements:
- Image display with appropriate sizing
- Expand button (round button in corner to open modal)
- Generation progress indicator (only visible during Generating state)
- Error message (only visible during Error state)

#### Responsibilities:
- Maintains the document/image state
- Handles initial image generation requests
- Renders appropriate UI based on current state
- Opens the modal when expand button is clicked

### 2. ImgGenModal

Fullscreen modal component that provides expanded image view and all controls.

#### UI Elements:
- Full-size image display
- All controls below the image
- PromptBar at top of controls (displays prompt text, allows editing on double-click)
- ControlsBar below the prompt (contains delete and version controls)
- Progress indicator (shows inside ControlsBar when regenerating)

#### Responsibilities:
- Manages modal state (open/closed)
- Provides image deletion functionality
- Enables version navigation (prev/next)
- Handles image regeneration requests
- Enables prompt editing

### 3. PromptBar

Displays the prompt text and handles editing functionality.

#### States:
- **View**: Normal display of the prompt text
- **Edit**: Editable input field for modifying the prompt

#### Responsibilities:
- Displays current prompt text
- Toggles between view/edit modes on double-click
- Provides edit/save functionality for the prompt

### 4. ControlsBar

Contains all the control buttons for the image.

#### UI Elements:
- Delete button (left side)
- Version navigation controls (right side)
  - Previous version button
  - Version indicator (e.g., "2/3")
  - Next version button
- Regenerate button
- Progress indicator background (when regenerating)

#### Responsibilities:
- Triggers delete confirmation dialog
- Handles version navigation
- Initiates image regeneration

### 5. DeleteConfirmation

Modal dialog for confirming image deletion. Replaces the ControlsBar content when active.

#### Responsibilities:
- Displays confirmation message
- Provides confirm/cancel options
- Handles deletion logic when confirmed

## Data Flow

1. User initiates image generation → ImgGenDisplay shows Generating state
2. When generation completes → ImgGenDisplay shows Complete state with the image
3. User clicks expand → ImgGenModal opens with full image and controls
4. In modal, user can:
   - Edit prompt (via PromptBar) on save trigger regeneration
   - Navigate versions (via ControlsBar)
   - Regenerate image (via ControlsBar) → Shows progress in ControlsBar background
   - Delete image (via ControlsBar → DeleteConfirmation)
5. On modal close → Return to ImgGenDisplay view

## Styling Structure

- Each component has its own set of classes
- Progress indicators use a consistent style (imggen-progress)
- Modal elements are properly z-indexed to ensure correct layering
- Responsive design for different screen sizes

## Translation Guide from Old Code

| New Component/Concept | Old Code Equivalents |
|------------------------|----------------------|
| ImgGenDisplay | ImgGenDisplay (but with less functionality) |
| ImgGenModal | Fullscreen backdrop + ImageOverlay |
| PromptBar | Part of ImageOverlay's top section |
| ControlsBar | Part of ImageOverlay's bottom section |
| DeleteConfirmation | DeleteConfirmationOverlay |
| Image states | Implicit in ImgGenDisplay and ImgGenPlaceholder |
| insideModal prop | Previously enableDelete (confusing name), neither are needed anymore |
| Progress indicator | imggen-progress, appeared in multiple contexts |
