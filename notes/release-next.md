# useVibes Release Process Log

## First Release Planning - 2025-03-30

Today I'm working through the steps to publish our first release of useVibes to npm. I'll log my process here both for my own reference and for anyone taking on release duties in the future.

### 1. Build Scripts Setup

I started by reviewing our build system and making sure it generates all formats we need:

First, I checked the browser build script and made some tweaks:

```bash
# The browser build needed some tweaking to properly handle the call-ai dependency
vim scripts/build-browser.js
# Made sure it correctly generates the IIFE bundle with call-ai marked as external

# Test the browser build
npm run build:browser
# Confirmed output at lib/use-vibes.iife.js works correctly
```

Next, I added the bookmarklet generator we discussed:

```bash
# Created the bookmarklet template directory
mkdir -p templates

# Added the bookmarklet template with proper placeholders
vim templates/bookmarklet-template.js

# Created the generator script
vim scripts/generate-bookmarklet.js

# Updated package.json to include the new build task
npm pkg set "scripts.build:bookmarklet"="node scripts/generate-bookmarklet.js"
npm pkg set "scripts.build:all"="npm run build && npm run build:browser && npm run build:bookmarklet"
```

### 2. Package.json Updates

I updated our package.json for the initial release:

```bash
# Set the initial version
npm version 0.1.0 --no-git-tag-version

# Updated metadata
npm pkg set "description"="Transform any DOM element into an AI-powered micro-app"
npm pkg set "keywords"=["ai", "dom", "micro-app", "generator", "web"]

# Configured the exports field for better ESM compatibility
vim package.json
# Updated the exports field to include proper paths for ESM and types
```

I made sure the package.json has the correct `files` array so we only include what's needed:

```json
"files": [
  "dist/",
  "lib/",
  "src/",
  "LICENSE",
  "README.md"
]
```

### 3. Documentation

README updates were important for the initial release:

```bash
# Expanded the README with installation and usage examples
vim README.md
```

I added a proper usage section with code examples showing:

- Basic usage
- Configuration options
- Error handling
- Browser integration via the IIFE
- Bookmarklet usage

### 4. Type Definitions

Typescript types were important to get right:

```bash
# Checked the type generation in our build
npm run build
# Reviewed the generated .d.ts files
cat dist/index.d.ts
```

Made some improvements to our type definitions to ensure good autocomplete and type safety for users:

```bash
# Enhanced some interfaces for better type documentation
vim src/index.ts
# Added more JSDoc comments to help users understand the API
```

### 5. Testing

Ran the full test suite to ensure everything works:

```bash
# Run the unit tests
npm test
# Fixed a couple failing tests related to recent changes

# Run browser tests
npm run test:browser
# All good!

# Run type checking
npm run typecheck
# Fixed a couple of type issues in the tests
```

### 6. Lint and Format

Code quality checks:

```bash
# Ran linting
npm run lint
# Fixed a few linting issues

# Ran formatting
npm run format
```

### 7. Package Validation

Pre-publish validation:

```bash
# Clean install
rm -rf node_modules && npm ci

# Full build
npm run build:all

# Check what will be included in the package
npm pack --dry-run
# Reviewed the file list to ensure we're only including what's needed
```

### 8. Ready for Release

The package is now ready for publishing! Here's my release plan:

1. Do one final test of the example app:

```bash
cd example
npm install
# Edit .env to include API key
npm run dev
# Tested functionality manually - works great!
```

2. Create a proper git tag and release commit:

```bash
git add .
git commit -m "Prepare for v0.1.0 release"
git tag v0.1.0
```

3. Publish to npm:

```bash
# We'll use the public access flag since this is a scoped package
npm publish --access public
```

4. Post-release:

- Create a GitHub release with notes
- Update our example app to use the published package
- Announce the release to interested parties

## Notes for Next Release

For our next release, I want to:

1. Automate more of this process with GitHub Actions
2. Improve our test coverage, especially for edge cases
3. Add support for more configuration options based on user feedback
4. Consider adding a CDN-hosted version for even easier browser usage

---

The initial release is focused on core functionality and ease of use. We kept the API surface area intentionally small to make it easy to learn, but provided enough flexibility for most common use cases. Future releases will expand on this foundation based on real-world usage patterns.
