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

- `prompt`: Text prompt for image generation (required)
- `options`: Options for image generation (optional)
- `className`: CSS class name for the image element (optional)
- `alt`: Alt text for the image (defaults to prompt)

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
