# Use-Vibes Style System

This document outlines the styling architecture and implementation plan for the `use-vibes` package components, with a focus on simplifying and making styles more maintainable and customizable.

## Current Styling Pain Points

- **Heavy use of large inline-style objects** – Many components contain extensive inline style objects with hardcoded colors (`#333`, `rgba(255,255,255,.5)`), font-weights, borders, etc.
- **Repeated style snippets** across multiple files (`ImgGenDisplay`, `ImgGenPlaceholder`, `ImageOverlay`, etc.)
- **Lack of theme adaptability** – Inline colors override the parent page, making widgets look "foreign" if the host site uses a dark theme or a custom brand palette
- **Limited style customization** – Only the outermost `<ImgGen>` exposes a generic `className`; descendants are not easily style-able without deep copying components

## New Styling Architecture

### A. CSS Custom Properties + Classes

Replace most inline objects with **CSS classes backed by CSS custom properties** (variables):
- Variables inherit automatically, allowing host pages to change colors/fonts with minimal overrides
- Reduces bundle size by eliminating redundant style objects
- No additional dependencies (no CSS-in-JS library required)

### B. Semantic HTML Structure

Use more semantic HTML elements where appropriate:
- `figure` + `figcaption` pattern for the image+prompt combination
- `progress` element for the progress bar
- `dialog` (or ARIA-equivalent div) for the delete-confirmation pop-up
- Note: We cannot change the `ImgFile` component as it comes from the `use-fireproof` package

### C. Component Customization API

Expose a **"classes" prop object** similar to Material-UI:

```ts
type ImgGenClasses = {
  root?: string;
  container?: string; 
  overlay?: string;
  progress?: string;
  placeholder?: string;
  error?: string;
  // etc.
};

<ImgGen classes={{ overlay: 'my-overlay', container: 'rounded-xl' }} />
```

If users don't provide these props, the defaults maintain the current look and feel.

### D. CSS Variable Theming System

Allow **style overrides with CSS variables** (zero runtime cost):

```css
:root {
  --imggen-overlay-bg: rgba(255, 255, 255, 0.5);
  --imggen-text-color: #333;
  --imggen-accent: #0066cc;
  --imggen-border-radius: 8px;
  --imggen-font-weight: 500;
  /* etc. */
}

/* Dark theme example */
.dark-theme {
  --imggen-overlay-bg: rgba(0, 0, 0, 0.6);
  --imggen-text-color: #fafafa;
  --imggen-accent: #4d94ff;
}
```

## Implementation Plan

1. **Create a central CSS file** (`src/components/ImgGen.css`):
   - Define the base classes: `.imggen-root`, `.imggen-container`, `.imggen-overlay`, etc.
   - Set default CSS variables with sensible fallbacks 
   - Ensure only **layout-critical** properties stay inline (e.g. `width: ${progress}%`)

2. **Update JSX files**:
   - Strip large inline style objects, replace with class names
   - Accept a `classes` prop (default `{}`) and merge using a utility function:
     ```js
     className={clsx('imggen-overlay', classes.overlay)}
     ```
   - Implement the `progress` element with appropriate ARIA attributes
   - Ensure semantic HTML structure where possible

3. **Utility functions**:
   - Create a simple helper to merge class names (either use an existing library or implement a minimal version)

4. **Documentation**:
   - Add clear examples in README.md
   - Document all CSS variables for theming
   - Provide simple examples of both basic and advanced customization

## Migration & Backward Compatibility

- No required changes for existing users; default variables replicate current fixed colors
- Existing `className` prop continues to work (mapped to `classes.root`)
- Inline dynamic styles (e.g., progress width) remain, so behavior is untouched

## Usage Examples

### Basic Usage (unchanged)

```jsx
<ImgGen 
  prompt="A beautiful mountain landscape"
  className="my-image"
/>
```

### Light Theming with CSS Variables

```jsx
<div style={{ "--imggen-accent": "rebeccapurple" }}>
  <ImgGen prompt="A beautiful mountain landscape" />
</div>
```

### Component-Level Customization

```jsx
<ImgGen 
  prompt="A beautiful mountain landscape"
  classes={{
    root: "my-custom-root",
    overlay: "dark-overlay rounded-lg",
    progress: "thin-progress"
  }}
/>
```

### Full Theme Customization

```css
/* In your CSS file */
.my-app {
  --imggen-overlay-bg: rgba(25, 25, 25, 0.7);
  --imggen-text-color: #ffffff;
  --imggen-accent: #ff9900;
  --imggen-border-radius: 12px;
  --imggen-font: 'Poppins', sans-serif;
}
```

```jsx
<div className="my-app">
  <ImgGen prompt="A beautiful mountain landscape" />
</div>
```

## Future Enhancements

- Provide pre-made "dark" and "light" theme CSS files for quick adoption
- Ship TypeScript `ImgGenTheme` type for autocompletion of variable names
- Consider component-specific theme options (e.g., button variants)
