# Image Generation Overlay Refinement

## Current Behavior vs Desired Behavior

**Current:** If no ID is set, a deterministic ID is generated from the prompt. This means the same prompt will always retrieve the same document.

**Desired:** Let Fireproof auto-assign IDs. This allows users to make the same prompt multiple times and get distinct documents each time, which is more intuitive.

## Key Changes

1. **Doc-ID Behavior**

   - Stop synthesizing `_id` from `prompt`
   - Let Fireproof assign the `_id` when only `prompt` is provided
   - When `_id` is supplied, continue working with that document (for refreshes)

2. **Document Schema**

   ```typescript
   type ImgGenDoc = {
     _id: string;
     _files: Record<string, File | DocFileMeta>; // v1, v2 ...
     versions: Array<{ id: string; created: number; promptKey: string }>;
     currentVersion: number; // index into versions
     prompts: Record<string, { text: string; created: number }>; // p1, p2 ...
     currentPromptKey: string; // usually "p1"
     created: number;
   };
   ```

3. **Component Contract**
   - `ImgGen`:
     - `prompt` prop is required only when `_id` is undefined
     - If both are passed, `_id` takes precedence, and the external `prompt` is ignored
   - `onRegen` continues to append a new image version
   - Future: An internal prompt-edit UI can later add a new `promptKey` for edited prompts

## Files/Modules Affected

- **Hooks**

  - `src/hooks/image-gen/use-image-gen.ts`
  - `src/hooks/image-gen/types.ts` (new `ImgGenDoc`)

- **Components**

  - `src/components/ImgGen.tsx` (prop handling)
  - `src/components/ImgGenUtils.tsx` / `ImgGenDisplay` (prompt display logic)

- **Tests**

  - Update existing tests to remove deterministic ID expectations
  - Add new tests:
    - Same prompt twice → two docs with different IDs
    - Refresh creates new version on correct doc
    - `prompt` prop ignored when `_id` is present

- **Examples**
  - `examples/react-example/src/App.tsx` is already compatible; no changes needed.

## Implementation Plan

1. **Types**

   - Add `ImgGenDoc`, `PromptEntry`, etc. in `types.ts`

2. **useImageGen**

   - Adjust "create-or-load" branch:
     - If `_id` undefined → `fireproof.add({ prompts:…, currentPromptKey:'p1', …})`
     - Remove hash/deterministic-ID logic
   - On refresh:
     - Create new `vN` file
     - Push `{id:'vN', …, promptKey:currentPromptKey}` to `versions`

3. **Components**

   - `ImgGen` prop validation: warn (dev-only) if both `_id` & `prompt` supplied
   - `ImgGenDisplay` shows prompt from `document.prompts[document.currentPromptKey].text`

4. **Tests**

   - Update deterministic-ID assertions
   - Add test cases for new behavior

5. **Documentation**
   - Document new schema in code and README

## Considerations

- UI should clearly show the _current_ prompt even after multiple versions
- Storage efficiency: While prompts are deduplicated within a document, this will accept multiple documents with the same prompt
- Future enhancement: prompt editing UI (out of scope for this refactor)
- The examples/react-example/src/App.tsx doesn't need changes as it's already compatible with the new approach

## Benefits

- More intuitive behavior for users (one prompt call = one document)
- Refreshes add versions to the correct document regardless of prompt duplication
- Opens path for prompt editing in the future
- Clearer separation of concerns: documents own their prompts
