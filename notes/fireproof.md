# Fireproof Integration for use-vibes

## Implementation Plan

- Install the `use-fireproof` module
- Stop using local storage
- Implement database as an optional prop

## Database Prop Specification

The component should accept an optional `database` prop that can be either:
- A string (default: "ImgGen")
- A Fireproof database instance

This is the same type as the first argument to the `useFireproof` hook, so we can pass it through directly.

## Document Structure for Images

Images should be saved in documents with the following structure:

```json
{
  "_id": "img:${promptHash}",
  "type": "image",
  "prompt": "The prompt used to generate the image",
  "_files": {
    // File attachments data
  }
}
```

## Working with Files in Fireproof

Fireproof has built-in support for file attachments. Files are encrypted by default and synced on-demand.

### Attaching Files to Documents

Files can be attached to a document using the `_files` property:

```html
<input accept="image/*" title="save to Fireproof" type="file" id="files" multiple>
```

```js
function handleFiles() {
  const fileList = this.files;
  const doc = {
    type: "files",
    _files: {}
  };
  for (const file of fileList) {
    // Assign each File object to the document
    doc._files[file.name] = file; 
  }
  database.put(doc);
}

document.getElementById("files").addEventListener("change", handleFiles, false);
```

### Retrieving File Attachments

When loading a document with attachments, you can retrieve each attachment's actual File object:

```js
const doc = await database.get("my-doc-id");
for (const fileName in doc._files) {
  const meta = doc._files[fileName];
  if (meta.file) {
    const fileObj = await meta.file();
    console.log("Loaded file:", fileObj.name);
  }
}
```

## Using ImgFile Component

The `ImgFile` component exported from `use-fireproof` can be used to display file objects:

```jsx
import { useFireproof, ImgFile } from "use-fireproof";

<ImgFile file={doc._files.uploaded} alt="Uploaded Image" className="w-full h-auto rounded" />
```

This component should replace the `<img>` tag in `src/components/ImgGen.tsx`.
