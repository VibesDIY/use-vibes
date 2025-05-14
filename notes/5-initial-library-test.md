# Step 5: Initial Library Test

## Goal

Create a clean initial browser test that verifies our library loads correctly and performs a simple operation (injecting "hello world" into the page).

## Tasks

1. Create a minimal library implementation:

   ```
   /src
     /index.ts           # Main entry point with useVibes function
   ```

2. Implement minimal functionality:

   - Create a basic useVibes function that accepts a selector and options
   - Implement "hello world" injection into the selected element
   - Export the function as both a named and default export

3. Create test files:

   ```
   /tests
     /browser
       /library-test.js   # Test script for the library
       /library-test.html # Test runner HTML
   ```

4. Test functionality:

   - Import the library
   - Select a target element
   - Call useVibes with minimal configuration
   - Verify "hello world" appears in the target element

5. Setup proper build and test scripts in package.json:

   - `pnpm run build`: Properly builds the project
   - `pnpm run test`: Runs tests including this initial test
   - Ensure proper integration with the smoke test system

6. Document the test:
   - How to run the test
   - Expected outcome
   - How to extend with more tests

## Expected Output

A minimal working implementation of the useVibes library that can be loaded in a browser and perform a simple injection operation. This verifies that our build system is working correctly and that the library can be used in a browser environment.
