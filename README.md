# use-vibes

A lightweight library that transforms any DOM element into an AI-powered micro-app.

## Installation

```bash
pnpm add use-vibes
```

### CSS Loading

The ImgGen component requires CSS styles. You can include them in two ways:

#### Option A: Explicit CSS link (recommended for production)

Add a CSS link tag to your HTML:

```html
<link rel="stylesheet" href="/node_modules/use-vibes/dist/components/ImgGen.css">
```

Or for ESM/CDN environments like importmap scenarios:

```html
<link rel="stylesheet" href="https://esm.sh/use-vibes@0.3.0/components/ImgGen.css"> 
```

#### Option B: Automatic CSS loading (convenient for prototyping)

Import the style-loader early in your application:

```js
import 'use-vibes/style-loader'; // Auto-loads CSS when imported
```

This approach is perfect for quick prototypes but for production sites, Option A gives you better control over CSS loading order and timing.

## Components

### ImgGen

A React component for generating images with AI:

```jsx
import { ImgGen } from 'use-vibes';

function MyComponent() {
  return (
    <div>
      <ImgGen prompt="A sunset over mountains" />
    </div>
  );
}
```

#### Props

- `prompt`: Text prompt for image generation (required unless `_id` is provided)
- `_id`: Document ID to load a specific image instead of generating a new one
- `options`: Options for image generation (optional)
- `className`: CSS class name for the image element (optional)
- `alt`: Alt text for the image (defaults to prompt)
- `overlay`: Whether to show overlay controls and info button (default: `true`)
- `database`: Database name or instance to use for storing images (default: `'ImgGen'`)
- `onLoad`: Callback when image load completes successfully
- `onError`: Callback when image load fails, receives the error as parameter
- `onDelete`: Callback when an image is deleted, receives the document ID
- `onPromptEdit`: Callback when the prompt is edited, receives document ID and new prompt
- `classes`: Object containing custom CSS classes for styling component parts (see Styling section)

#### Features

##### Overlay Controls

By default, the ImgGen component shows an info button in the bottom-left corner. Clicking it reveals an overlay with:

- The prompt text (double-clickable to edit)
- Version navigation buttons (if multiple versions exist)
- Refresh button to generate a new version
- Delete button

Setting `overlay={false}` will hide all these controls, showing only the image.

##### Prompt Editing

Double-click the prompt text in the overlay to edit it. Press Enter to submit changes and regenerate the image with the new prompt.

#### Styling

The ImgGen component uses CSS custom properties (variables) for styling, making it easy to customize the appearance while maintaining consistency. There are two primary ways to customize styling:

##### 1. CSS Variables

Override the default styles by setting CSS custom properties in your CSS:

```css
/* In your CSS file */
:root {
  --imggen-text-color: #222;
  --imggen-overlay-bg: rgba(245, 245, 245, 0.85);
  --imggen-accent: #0088ff;
  --imggen-border-radius: 4px;
}

/* Dark theme example */
.dark-theme {
  --imggen-text-color: #f0f0f0;
  --imggen-overlay-bg: rgba(25, 25, 25, 0.85);
  --imggen-accent: #66b2ff;
}
```

##### 2. Custom Classes

For more granular control, provide a `classes` object with custom CSS classes for specific component parts:

```jsx
<ImgGen 
  prompt="A futuristic cityscape"
  classes={{
    root: 'my-custom-container',
    image: 'rounded-xl shadow-lg',
    overlay: 'bg-slate-800/70 text-white',
    progress: 'h-2 bg-green-500',
    button: 'hover:bg-blue-600',
  }}
/>
```

The component uses these classes in addition to the default ones, allowing you to extend or override styles as needed.

##### Available CSS Variables

| Variable | Default | Description |
| --- | --- | --- |
| `--imggen-text-color` | `#333` | Main text color |
| `--imggen-background` | `#333333` | Background color for placeholder |
| `--imggen-overlay-bg` | `rgba(255, 255, 255, 0.5)` | Overlay panel background |
| `--imggen-accent` | `#0066cc` | Accent color (progress bar, etc.) |
| `--imggen-error-text` | `#ff6666` | Error message text color |
| `--imggen-border-radius` | `8px` | Border radius for containers |
| `--imggen-button-bg` | `rgba(255, 255, 255, 0.7)` | Button background color |
| `--imggen-font-size` | `14px` | Default font size |

##### Available Class Slots

| Class Property | Description |
| --- | --- |
| `root` | Main container element |
| `image` | The image element |
| `container` | Container for image and controls |
| `overlay` | Overlay panel with controls |
| `progress` | Progress indicator |
| `placeholder` | Placeholder shown during loading |
| `error` | Error message container |
| `controls` | Control buttons container |
| `button` | Individual buttons |
| `prompt` | Prompt text/input container |
| `deleteOverlay` | Delete confirmation dialog |

## Development

```bash
# Install dependencies
pnpm install

# Build the library
pnpm build

# Run tests
pnpm test
```

## License

MIT
