# use-vibes

A lightweight library that transforms any DOM element into an AI-powered micro-app.

## Installation

```bash
pnpm add use-vibes
```

## Basic Usage

```jsx
import { ImgGen } from 'use-vibes';
import 'use-vibes/style-loader'; // Quick setup for CSS

function MyComponent() {
  return <ImgGen prompt="A futuristic cityscape with flying cars" />;
}
```

For image manipulation using base64 data:

```jsx
import { base64ToFile } from 'use-vibes';

// Convert API response to a File object
const imageFile = base64ToFile(imageResponse.data[0].b64_json, 'my-image.png');
```

See the [usage guide](./notes/usage.md) and [features document](./notes/features.md) for complete documentation.

### Browser Compatibility

This library is compatible with all modern browsers that support React 18+ and ES6 features.

## License

MIT+Apache
