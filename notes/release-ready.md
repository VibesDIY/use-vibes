# Release Readiness Checklist for useVibes

This document outlines the tasks required to prepare useVibes for publishing to npm as a professional-grade package.

## Build Requirements

- [ ] **ESM Module Build**
  - [ ] Verify TypeScript compilation settings in `tsconfig.json`
  - [ ] Ensure proper ESM exports in `package.json`
  - [ ] Generate declaration files (`.d.ts`)
  - [ ] Run build: `npm run build`

- [ ] **IIFE Browser Build**
  - [ ] Review the browser build script (`scripts/build-browser.js`)
  - [ ] Ensure proper bundling of dependencies (excluding ones marked as external)
  - [ ] Verify browser compatibility (check for browser-specific APIs)
  - [ ] Run build: `npm run build:browser`
  - [ ] Test IIFE build in browser environments

- [ ] **Bookmarklet**
  - [ ] Create `scripts/generate-bookmarklet.js` as outlined in `notes/injecting.md`
  - [ ] Create `templates/bookmarklet-template.js` with the bookmarklet source code
  - [ ] Add `build:bookmarklet` script to `package.json`
  - [ ] Run build: `npm run build:bookmarklet`
  - [ ] Test the generated bookmarklet

- [ ] **Combined Build Process**
  - [ ] Add a unified build script: `"build:all": "npm run build && npm run build:browser && npm run build:bookmarklet"`

## Testing

- [ ] **Unit Tests**
  - [ ] Ensure comprehensive test coverage for all core functionality
  - [ ] Run tests: `npm test`
  - [ ] Fix any failing tests

- [ ] **Browser Tests**
  - [ ] Verify the browser test setup with Playwright
  - [ ] Test in multiple browsers (Chrome, Firefox, Safari)
  - [ ] Run browser tests: `npm run test:browser`
  - [ ] Fix any failing tests

- [ ] **Integration Tests**
  - [ ] Test with the example application
  - [ ] Verify the bookmarklet works correctly
  - [ ] Test with different types of DOM elements and prompts

- [ ] **Type Checking**
  - [ ] Run TypeScript type checking: `npm run typecheck`
  - [ ] Fix any type errors

## Documentation

- [ ] **README.md**
  - [ ] Update with final installation instructions
  - [ ] Add comprehensive API documentation
  - [ ] Include examples for different use cases
  - [ ] Document configuration options
  - [ ] Add section about the bookmarklet
  - [ ] Include browser compatibility information

- [ ] **API Documentation**
  - [ ] Add JSDoc comments to all public methods and interfaces
  - [ ] Generate API docs if using a documentation tool

- [ ] **Example Code**
  - [ ] Update the example app to use the published package (after initial release)
  - [ ] Ensure examples are clear and well-documented
  - [ ] Include a variety of use cases

- [ ] **Demos**
  - [ ] Create demo pages showcasing different features
  - [ ] Host demos on GitHub Pages or similar

## Package Configuration

- [ ] **package.json**
  - [ ] Update to final version (e.g., `1.0.0` for initial release)
  - [ ] Verify package name availability on npm
  - [ ] Update description, keywords, and author information
  - [ ] Configure `main`, `module`, and `types` fields correctly
  - [ ] Set proper `exports` configuration for ESM and types
  - [ ] Review dependencies and move dev-only packages to `devDependencies`
  - [ ] Add appropriate `files` array to limit what gets published

  ```json
  "files": [
    "dist/",
    "src/",
    "LICENSE",
    "README.md"
  ]
  ```

- [ ] **.npmignore**
  - [ ] Create or update to exclude test files, fixtures, and docs
  - [ ] Ensure critical files are not excluded (check exclusions against `files` array)

- [ ] **LICENSE**
  - [ ] Verify license file exists and is correctly specified in `package.json`

## Quality Assurance

- [ ] **Linting**
  - [ ] Run ESLint: `npm run lint`
  - [ ] Fix any linting issues: `npm run lint:fix`

- [ ] **Code Formatting**
  - [ ] Run Prettier: `npm run format`
  - [ ] Ensure consistent code style

- [ ] **Bundle Size Analysis**
  - [ ] Analyze bundle size for browser builds
  - [ ] Optimize if needed (tree-shaking, code splitting, etc.)

- [ ] **Dependency Audit**
  - [ ] Run `npm audit` to check for security vulnerabilities
  - [ ] Fix or document any issues

## Pre-Publish Checklist

- [ ] **Version Bump**
  - [ ] Update version in `package.json`
  - [ ] Create version commit and tag

- [ ] **Changelog**
  - [ ] Create or update CHANGELOG.md with release notes
  - [ ] Document breaking changes, new features, and bug fixes

- [ ] **Final Validation**
  - [ ] Clean install and build: `rm -rf node_modules && npm ci && npm run build:all`
  - [ ] Run full test suite: `npm run validate` (should include tests, type checking, and linting)
  - [ ] Manually test the example app
  - [ ] Test the package with `npm pack` and verify contents

## Publishing

- [ ] **Dry Run**
  - [ ] Run `npm publish --dry-run` to verify package contents
  - [ ] Review the files that would be published

- [ ] **Publish to npm**
  - [ ] Run `npm publish` (use `--tag beta` for pre-releases)
  - [ ] Verify the package is available on npm

- [ ] **Post-Publish**
  - [ ] Create GitHub release with release notes
  - [ ] Update example to use the published package
  - [ ] Announce the release in relevant channels

## Continuous Integration

- [ ] **CI/CD Setup**
  - [ ] Configure GitHub Actions or similar CI for:
    - [ ] Running tests on each PR
    - [ ] Linting and type checking
    - [ ] Automated publishing for tagged releases

## Next Steps

- [ ] Plan for ongoing maintenance
- [ ] Set up issue templates and contribution guidelines
- [ ] Document the release process for future updates

---

This checklist provides a comprehensive framework for preparing useVibes for publication to npm. Work through each section methodically to ensure a professional and reliable package release.
