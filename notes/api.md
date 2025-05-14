# useVibes API Documentation

useVibes is a vanilla browser TypeScript module that transforms a designated DOM element into an AI-augmented micro-app using an HTML inject-first approach. It leverages the current page's HTML, CSS, and a visual snapshot to create a rich context for dynamic content generation. The module returns an app instance with the transformed content based on a single prompt.

---

## Overview

- **Purpose:**
  Transform any DOM element into a self-contained, AI-driven micro-app by extracting and utilizing the page's inherent state.
- **Core Features:**
  - **Inject-First Approach:** Operates directly on the existing page by capturing document.body.innerHTML, the associated CSS, and a visual snapshot via html2canvas.
  - **Context-Aware Transformation:** Uses the page's current state as a germ to generate dynamic content.
  - **Promise-Based API:** Returns an app instance once the micro-app is injected.
  - **Single Prompt Processing:** Transforms content based on a single, comprehensive prompt.

---

## Usage

To use useVibes, simply call the function with a target element (CSS selector or DOM element) and a configuration object containing your prompt. The function returns a Promise that resolves to an app instance with the following properties:

- **container:**
  The DOM element into which the micro-app is injected.
- **database:**
  A configurable property that can later be set to indicate the database in use (if needed).

## Example

```typescript
import { useVibes } from 'useVibes';

useVibes('#app', { prompt: 'create a todo list with emojis' })
  .then((app) => {
    console.log('Micro-app created successfully!');

    // Log the container element
    console.log('Injected into:', app.container);

    // If a database is later configured, it can be accessed via app.database
    if (app.database) {
      console.log('Database configured as:', app.database);
    }
  })
  .catch((error) => {
    console.error('Error during injection:', error);
  });
```

---

## Quick Start

1. **Include the Module:**
   Import or bundle useVibes as an ESM module in your project.
2. **Prepare Your HTML:**
   Ensure your page includes a target element (e.g., `<div id="app"></div>`) for the micro-app.
3. **Initialize useVibes:**
   Call useVibes with your target and configuration. The module will capture the page's state, transform it based on your prompt, and inject the resulting micro-app into your target element.

---

This documentation provides the essential details to get started with useVibes, focusing on its inject-first approach, context-aware transformation, and promise-based API that returns an app instance with the transformed content.
