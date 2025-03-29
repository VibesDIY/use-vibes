# use-vibes Test Fixtures

This directory contains HTML test fixtures for testing the `use-vibes` module.

## Directory Structure

```
/fixtures
  /basic
    /hello-world.html    # Simple hello world test
  /index.html            # Index page listing all fixtures
  /README.md             # This file
```

## Running the Tests

1. Start the fixture server:
   ```bash
   pnpm serve
   ```

2. Access the fixtures in your browser:
   - Index page: http://localhost:3000/
   - Hello World test: http://localhost:3000/basic/hello-world.html

3. Run automated tests:
   ```bash
   # Run headless tests
   pnpm test:browser
   
   # Run with visible browser (for debugging)
   pnpm test:browser:headed
   
   # Run with Playwright debugger
   pnpm test:browser:debug
   ```

## Adding New Fixtures

When adding new fixtures:

1. Create your HTML file in the appropriate directory
2. Update the index.html page to link to your fixture
3. Add corresponding tests in `/tests/browser/`
