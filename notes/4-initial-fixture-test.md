# Step 4: Initial Browser Fixture Test

## Goal

Create a clean initial browser test to verify that our fixture HTML pages load correctly, without using our library yet.

## Tasks

1. Create a simple test runner:

   ```
   /tests
     /browser
       /fixtures-test.js  # Test script
       /fixtures-test.html # Test runner HTML
   ```

2. Test runner functionality:

   - Load each fixture in an iframe
   - Verify that the page loads correctly
   - Check for expected elements (by ID or data attributes)
   - Log results to console and UI

3. Test script should:

   - Iterate through available fixtures
   - Load each fixture
   - Run basic assertions
   - Report success/failure

4. Setup testing environment:

   - Use a local development server (e.g., Vite, http-server)
   - Configure script to run the server and open the test page
   - Create npm script for running the tests

5. Document the testing process:
   - How to run the tests
   - How to interpret results
   - How to add new fixture tests

## Expected Output

A functional browser test setup that can load our fixture HTML pages and verify they're working correctly. This establishes the foundation for the next step, which will involve testing our actual library.
