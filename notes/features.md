# ImgGen Component Features

This document outlines the key features and capabilities of the ImgGen component from use-vibes, focusing on what functionality it brings to applications.

## Core Features

### Interactive Image Generation

- **One-line Implementation**: Add AI image generation to any React app with minimal code

  ```jsx
  <ImgGen prompt="A sunset over mountains" />
  ```

- **Automatic Database Integration**: All images are automatically stored in Fireproof database with version history

  ```jsx
  // Custom database name
  <ImgGen prompt="Forest landscape" database="MyCustomDB" />

  // Or pass a database instance
  <ImgGen prompt="Forest landscape" database={myDbInstance} />
  ```

### Prompt Management

- **Prompt Versioning**: Tracks the history of different prompts used to generate an image

  - Uses a structured `prompts` object with timestamp-based keys
  - Maintains `currentPromptKey` to reference the active prompt

- **Prompt Editing**: Users can edit prompts directly in the overlay UI
  - Double-click the prompt text to edit
  - Press Enter to submit and regenerate with new prompt
  - App receives updates via `onPromptEdit` callback
  ```jsx
  <ImgGen
    prompt="Initial prompt"
    onPromptEdit={(id, newPrompt) => {
      console.log(`Document ${id} updated with new prompt: ${newPrompt}`);
    }}
  />
  ```

### Image Control & Manipulation

- **Image Regeneration**: One-click regeneration with the same or edited prompt

  - Preserves document history and adds new versions
  - Uses a unique `generationId` to trigger regeneration while maintaining context

- **Image Quality Control**: Set quality levels for output images

  ```jsx
  <ImgGen prompt="Detailed artwork" options={{ quality: 'high' }} />
  ```

- **Image Editing with Uploads**: Process existing images with AI

  ```jsx
  <ImgGen prompt="Turn this photo into a watercolor painting" images={[myImageFile]} />
  ```

- **Multiple Image Inputs**: Combine multiple images in one generation
  ```jsx
  <ImgGen prompt="Create a collage of these photos" images={[photo1, photo2, photo3]} />
  ```

### User Interface Components

- **Interactive Overlay**: Toggle-able information and controls overlay

  - Shows prompt text (editable)
  - Version navigation controls
  - Regenerate/refresh button
  - Delete button

  ```jsx
  // Disable overlay for a minimal UI
  <ImgGen prompt="Clean interface" overlay={false} />
  ```

- **Progress Visualization**: Shows generation progress with visual indicators

  - Progress bar updates in real-time
  - Automatic placeholder display during generation

- **Error Handling UI**: Clean error states with informative messages
  ```jsx
  <ImgGen
    prompt="Test error handling"
    onError={(error) => {
      console.error('Generation failed:', error.message);
    }}
  />
  ```

### File Management

- **File Upload Interface**: Built-in support for image uploads

  - Drag-and-drop capabilities
  - File selection dialog
  - Preview of uploaded content

- **Base64 Conversion**: Convert between base64 and File objects

  ```jsx
  import { base64ToFile } from 'use-vibes';

  // Convert API response to a File object
  const imageFile = base64ToFile(imageResponse.data[0].b64_json, 'my-image.png');
  ```

## Integration Features

### Event Callbacks

- **Generation Lifecycle Events**: Track the complete generation process
  ```jsx
  <ImgGen
    prompt="Track this generation"
    onComplete={() => console.log('Generation complete!')}
    onError={(error) => console.error('Generation failed:', error)}
    onDelete={(id) => console.log(`Document ${id} deleted`)}
    onDocumentCreated={(id) => console.log(`New document created: ${id}`)}
  />
  ```

### State Management

- **Loading States**: Component handles all loading states internally

  - Initial waiting state
  - Generation in progress state
  - Upload waiting state
  - Display state for completed images
  - Error state

- **Document Identity Tracking**: Smart re-mounting based on document changes
  - Uses internal `mountKey` system to ensure clean state transitions
  - Detects identity changes through document ID, prompt, or uploaded file documents

### UI Customization

- **Extensive Styling Options**: Multiple ways to customize appearance

  - CSS Variables for global styling

  ```css
  :root {
    --imggen-text-color: #222;
    --imggen-overlay-bg: rgba(245, 245, 245, 0.85);
    --imggen-accent: #0088ff;
    --imggen-border-radius: 4px;
  }
  ```

  - Custom classes for component-level styling

  ```jsx
  <ImgGen
    prompt="Styled component"
    classes={{
      root: 'my-custom-container',
      image: 'rounded-xl shadow-lg',
      overlay: 'bg-slate-800/70 text-white',
      progress: 'h-2 bg-green-500',
    }}
  />
  ```

### Gallery Integration

- **Thumbnail Support**: Easily create image galleries

  ```jsx
  <div className="image-grid">
    {imageDocuments.map((doc) => (
      <ImgGen key={doc._id} _id={doc._id} className="thumbnail" />
    ))}
  </div>
  ```

- **Document Reuse**: Load existing documents by ID
  ```jsx
  <ImgGen _id="existing-document-id" />
  ```

## Implementation Modes

The ImgGen component has several operational modes that it switches between automatically:

1. **Placeholder Mode**: Initial state when no prompt or document ID is provided
2. **Upload Waiting Mode**: When files are uploaded but waiting for a prompt
3. **Generating Mode**: During the image generation process
4. **Display Mode**: When showing a generated image with controls
5. **Error Mode**: When an error occurs during generation

The component automatically determines which mode to use based on the current state, providing a seamless experience for both developers and end-users.

## Advanced Usage

### Debug Mode

Enable debug mode to see detailed console logs about component state:

```jsx
<ImgGen prompt="Debug this" options={{ debug: true }} />
```

### Custom Image Sizing

Control output image dimensions with the size option:

```jsx
<ImgGen
  prompt="Landscape format"
  options={{ size: '1536x1024' }} // Landscape
/>

<ImgGen
  prompt="Portrait format"
  options={{ size: '1024x1536' }} // Portrait
/>
```
