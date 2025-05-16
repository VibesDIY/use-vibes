# ImgGen Overlay Accessibility & Documentation

## Accessibility Improvements

### Focus Trapping

The current overlay implementation needs focus trapping to ensure keyboard users can't tab out of the modal dialog:

- Implement focus trapping when the overlay is open, capturing tab navigation within the modal
- When the overlay opens, focus should move to the first interactive element
- When the overlay closes, focus should return to the element that triggered it
- For the delete confirmation dialog, focus should start on the cancel button (safer default)

### Keyboard Navigation Enhancements

Current keyboard support includes:

- ESC: Close overlay
- Left/Right arrows: Navigate between versions

Additional keyboard shortcuts to implement:

- DELETE/BACKSPACE: Open delete confirmation when on image (with warning)
- ENTER/SPACE: On buttons to activate them
- R: Shortcut for refresh/regenerate action
- I: Toggle info panel/metadata display
- TAB: Properly cycle through all interactive elements

## Documentation Updates

### Code Documentation

- Add JSDoc comments for all major functions in `ImgGenUtils.tsx`
- Document keyboard shortcuts in component docstrings
- Add accessibility-related props and ARIA attributes descriptions

### User Documentation

- Update README with information about the overlay features
- Document the user interaction model:
  - Clicking for overlay
  - Version navigation
  - Keyboard shortcuts
  - Delete functionality

### Type Definitions

- Update `ImgGenDisplayProps` interface documentation
- Create clear documentation for the document schema changes

## Implementation Priority

1. Focus trapping (highest priority for accessibility)
2. Documentation of existing functionality
3. Additional keyboard shortcuts
4. Enhanced info display

## Resources

- [React Focus Trap](https://github.com/focus-trap/focus-trap-react) - Consider using this library
- [WAI-ARIA Modal Dialog Pattern](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/)
- [Keyboard Accessibility](https://www.w3.org/WAI/WCAG21/Understanding/keyboard.html)
