# use-vibes

A lightweight library that transforms any DOM element into an AI-powered micro-app.

## Installation

```bash
pnpm add use-vibes
```

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
