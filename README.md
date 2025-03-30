# useVibes - App Gen Anywhere

[![npm version](https://img.shields.io/npm/v/use-vibes.svg)](https://www.npmjs.com/package/use-vibes)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

useVibes is a vanilla browser TypeScript module that transforms any DOM element into an AI-augmented micro-app using an HTML inject-first approach. It leverages the current page's HTML context to create a rich environment for dynamic content generation, powered by the call-ai library.

---

## Overview

- **Purpose**: Transform any DOM element into a self-contained, AI-driven micro-app by extracting and utilizing the page's inherent state.
- **Core Features**:
  - **Inject-First Approach**: Operates directly on the existing page by capturing document.body.innerHTML, the associated CSS, and a visual snapshot via html2canvas.
  - **Context-Aware Transformation**: Uses the page's current state as a germ to generate dynamic content.
  - **Promise-Based API**: Returns an app instance once the micro-app is injected.
  - **Ongoing Chat Interface**: The app instance provides a chat interface to facilitate live, interactive sessions.

---

## Installation

### npm

```bash
npm install use-vibes
```

### yarn

```bash
yarn add use-vibes
```

### pnpm

```bash
pnpm add use-vibes
```

## Basic Usage

```javascript
import { useVibes } from 'use-vibes';

// Set the API key for call-ai (required)
window.CALLAI_API_KEY = 'your-api-key-here';

// Get target element (can be a CSS selector string or DOM element)
const target = document.getElementById('my-app-container');

// Apply useVibes to the target with a prompt
useVibes(target, {
  prompt: 'Create a beautiful hello world message with blue styling'
}).then(app => {
  console.log('App created:', app);
}).catch(error => {
  console.error('Error creating app:', error);
});
```

### Return Value

The function returns a Promise that resolves to an app instance with the following properties:

- **container**: The DOM element into which the micro-app has been injected
- **database**: An optional property for state management (may be undefined)

## Browser Usage

### IIFE Bundle

If you want to use useVibes directly in the browser without a build step, you can use the IIFE bundle:

```html
<script src="https://unpkg.com/use-vibes@latest/lib/use-vibes.iife.js"></script>
<script>
  // Set API key
  window.CALLAI_API_KEY = 'your-api-key-here';

  // Now the global useVibes function is available
  useVibes(document.getElementById('my-element'), {
    prompt: 'Create a beautiful hello world message'
  });
</script>
```

### Bookmarklet

The useVibes package also includes a bookmarklet that allows you to test useVibes on any website:

1. After installing the package, you'll find a `bookmarklet.html` file in the `dist` directory
2. Open this file in your browser
3. Drag the bookmarklet link to your bookmarks bar
4. Navigate to any website, click the bookmarklet, then click on any element you want to enhance
5. Enter your prompt when prompted

You'll need to edit the bookmarklet to include your API key. See the HTML file for detailed instructions.

### Example

```javascript
import { useVibes } from 'useVibes';

useVibes("#app", { prompt: "create a todo list with emojis" })
  .then((app) => {
    console.log("Micro-app created successfully!");

    // Log the container element
    console.log("Injected into:", app.container);

    // If a database is later configured, it can be accessed via app.database
    if (app.database) {
      console.log("Database configured as:", app.database);
    }

    // Use the chat interface to send a message to the AI
    app.chat.sendMessage("Hello, vibe!")
      .then(() => console.log("Message sent successfully"))
      .catch((err) => console.error("Error sending message:", err));
  })
  .catch((error) => {
    console.error("Error during injection:", error);
  });
```

---

## Quick Start

1. **Include the Module**: Import or bundle useVibes as an ESM module in your project.
2. **Prepare Your HTML**: Ensure your page includes a target element (e.g., `<div id="app"></div>`) for the micro-app.
3. **Initialize useVibes**: Call useVibes with your target and configuration. The module will capture the page's state, transform it based on your prompt, and inject the resulting micro-app into your target element.

---

## Architecture Overview

- **Purpose**: Build a lightweight, agentic editor that transforms any div into a dynamic micro-app. The module leverages a minimal core—using Fireproof for local persistence and callAi for AI interactions—while preserving the page's inherent structure and style.
- **Architecture**:
  - **HTML Injection-First**: The library is injected into a page and operates on the current DOM state.
  - **Vanilla Browser Module**: Written in TypeScript and built as an ESM module suitable for distribution via esm.sh/jsr style.

---

## Directory Structure

- **src/**: Contains the source code for the useVibes library.
- **fixtures/**: A collection of HTML challenge files. These fixtures serve as test cases for validating that useVibes can handle a variety of page structures.
- **docs/**: Documentation directory which includes:
  - **llms.txt**: A text file specifying the details and technical context for LLM integrations and other project guidelines.
- **tests/**: Browser tests to ensure proper functionality:
  1. A test that verifies an HTML fixture loads correctly without invoking the library.
  2. A test that confirms the useVibes library loads and performs a simple injection (e.g., injecting "hello world" into the page).

---

## Prerequisites

- Node.js (v14 or higher)
- pnpm package manager
- A modern web browser for testing

---

## Getting Started

1. **Clone the Repository**:
   ```
   git clone https://github.com/fireproof-storage/use-vibes.git
   cd use-vibes
   ```

2. **Install Dependencies**:
   ```
   pnpm install
   ```

3. **Build the Project**:
   The project is configured to compile the TypeScript source into an ESM module suitable for browser use.
   ```
   pnpm run build
   ```

---

## Testing

### Fixture Loading Test

Ensure that HTML fixtures load correctly:
1. Open a test HTML file from the fixtures/ directory in your browser.
2. Verify that the page loads as expected without any library interference.

### Library Injection Test

Verify that useVibes loads and executes a basic operation:
1. Create a simple test page that includes the built useVibes module.
2. Use the library to inject a "hello world" string into a target element. For example:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>useVibes Test</title>
  <!-- Direct ESM import from source during development -->
  <script type="module">
    // Import directly from source files
    import useVibe from './src/index.js';
  </script>
</head>
<body>
  <div id="vibe-target"></div>
  <script type="module">
    // Direct import
    import useVibe from './src/index.js';
    
    // Create a new vibe
    const vibe = useVibe('HelloWorld');
    
    // Basic injection test
    document.querySelector("#vibe-target").innerHTML = vibe.describe();
  </script>
</body>
</html>
```

3. Open this page in your browser and confirm that "hello world" is injected into the target element.

---

## Build and Deployment

- **Buildless ESM Approach**: This project uses a modern buildless ESM approach. TypeScript source files are directly imported during development, and TypeScript compiler is only used for type checking and generating type definitions. This avoids complex bundling processes while leveraging the native ESM support in modern browsers and Node.js environments.

  ```json
  "scripts": {
    "build": "tsc",
    "typecheck": "tsc --noEmit"
  }
  ```

- **Deployment**: Direct imports from source files are supported during development. For production, TypeScript is compiled to JavaScript while maintaining ESM imports. The package can be published to npm or JSR for easy consumption via ESM imports.

---

## Next Steps

1. **Vibe Check**: After completing the initial tests, review the results and gather feedback.
2. **Iterate**: Use feedback to refine functionality and integration.
3. **Expand**: Continue to develop additional features and tests, integrating further capabilities such as Fireproof, callAi, and more advanced micro-app interactions.

---

## License

This project is open source. See the LICENSE file for details.

---

## Contact

For questions, feedback, or contributions, please open an issue on the repository or contact the maintainers.
