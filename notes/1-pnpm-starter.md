# Step 1: PNPM Starter for Buildless ESM TypeScript Module

## Goal
Create a modern buildless pnpm setup for shipping a vanilla browser TypeScript module using pure ESM that works directly with JSR.

## Tasks
1. Initialize package with proper ESM configuration:
   - Create package.json with `type: "module"` and proper exports field
   - Set up TypeScript configuration for ESM output (`moduleResolution: "NodeNext"`)
   - No bundler required - use TypeScript's direct ESM output
   - Configure package.json exports to expose entry points

2. Directory structure:
   ```
   /src
     /index.ts       # Main entry point
     /core           # Core functionality
     /utils          # Utility functions
   /tests            # Unit tests
   /.github          # GitHub workflows (publishing, testing)
   ```

3. Setup scripts in package.json:
   - `build`: Simply run TypeScript compiler (`tsc`)
   - `test`: Run test suite
   - `lint`: Run linting
   - `prerelease`: Run tests and type checking before release
   - `typecheck`: Run type checking without emitting files

4. Dependencies:
   - TypeScript (as a dev dependency)
   - Testing framework (vitest recommended)
   - ESLint for linting
   - No bundlers required

5. Configuration files:
   - tsconfig.json (with `"module": "NodeNext"` and `"moduleResolution": "NodeNext"`)
   - .eslintrc.js
   - .gitignore (include node_modules/)

6. package.json configuration:
   ```json
   {
     "name": "my-package",
     "version": "0.1.0",
     "type": "module",
     "main": "./src/index.ts",
     "exports": {
       ".": {
         "types": "./src/index.ts",
         "import": "./src/index.ts"
       }
     },
     "publishConfig": {
       "exports": {
         "types": "./dist/index.d.ts",
         "import": "./dist/index.js"
       }
     }
   }
   ```

## Expected Output
A buildless TypeScript ESM module that:
- Can be imported directly without bundling
- Works with modern JSR and npm ecosystem
- Has proper TypeScript types
- Is ready for tree-shaking by consumer bundlers
- Follows best practices for modern JavaScript packages
- Requires minimal setup and maintenance
