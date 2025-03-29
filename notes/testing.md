# Testing Strategy for use-vibes

## Testing Goals

1. **Verify Core Functionality**
   - Confirm that the `useVibes` module can correctly attach to DOM elements
   - Verify that DOM elements can be modified as expected (content, style)
   - Ensure the module returns the proper app instance structure with container and chat interface

2. **Test Across Different Environments**
   - Cross-browser testing (Chromium, Firefox, WebKit)
   - Various DOM structures and complexities
   - Different configuration options

3. **Error Handling and Edge Cases**
   - Invalid selectors or non-existent elements
   - Various input validation
   - Handling of asynchronous operations
   - Performance with large DOM structures

4. **Integration Testing**
   - Test with real-world web pages
   - Test interaction with other scripts and libraries
   - Verify preservation of existing page functionality

## Testing Infrastructure

### Tools and Frameworks
- **Vitest**: For unit testing JavaScript/TypeScript functions
- **Playwright**: For browser-based testing with cross-browser support
- **Vite**: For serving test fixtures locally

### Test Types

#### 1. Unit Tests
- Test individual functions and components
- Focus on pure logic components like vibe.ts and enhancer.js
- Mocked DOM environment when necessary

#### 2. Integration Tests
- Test interactions between components
- Verify module imports and exports work correctly
- Test bundling and distribution formats

#### 3. Browser Tests
- Test actual DOM manipulation in real browsers
- Verify visual and functional correctness
- Test performance and browser compatibility

### Test Fixtures

#### Simple Fixtures
- **Hello World**: Basic test of DOM attachment and modification
- **Styled Elements**: Testing style modifications
- **Complex DOM**: Testing with nested elements and complex structures

#### Real-world Web Page Archives
Archive the following pages for complex testing scenarios:
1. **Craigslist SF Home Page** (https://sfbay.craigslist.org/)
   - Tests with classified listings layout
   - Handle varying content types and structures
   
2. **Wikipedia Permalink Page** (https://en.wikipedia.org/wiki/Permalink)
   - Content-heavy pages with various structures
   - Testing with tables, references, and complex formatting
   
3. **Google News** (https://news.google.com/)
   - Dynamic content loading
   - Complex layout with cards and interactive elements
   
4. **Hacker News** (https://news.ycombinator.com/)
   - Simple but interactive forum layout
   - Testing with comment threads and navigation

#### Archiving Requirements
- Archives must preserve JavaScript functionality
- CSS styling must be maintained
- Interactive elements should work as expected
- All assets should be properly referenced locally

#### Archiving Tools Options
- **SingleFile**: Browser extension for complete single-file HTML archives
- **HTTrack**: For downloading complete websites with directory structure
- **Playwright/Puppeteer**: For custom scripts to capture page state
- **MHTML Format**: Browser's built-in save feature
- **Wget with --page-requisites**: Command-line tool for complete page downloads

## Test Implementation Plan

### Phase 1: Basic Testing (Completed)
- ✅ Set up testing infrastructure
- ✅ Implement Hello World test
- ✅ Configure Playwright for cross-browser testing
- ✅ Implement basic DOM manipulation tests

### Phase 2: Enhanced Testing
- Implement unit tests for core functionality
- Create more complex test fixtures
- Add more comprehensive browser tests
- Test configurations and options

### Phase 3: Real-world Testing
- Archive real-world web pages for testing
- Implement tests using archived pages
- Test with various DOM complexities and structures
- Performance testing with large pages

### Phase 4: CI/CD Integration
- Set up continuous integration testing
- Automate cross-browser testing
- Create test reporting and visualizations
- Monitor test coverage and quality

## Running Tests

```bash
# Run unit tests
pnpm test

# Watch mode for unit tests
pnpm test:watch

# Run browser tests (headless)
pnpm test:browser

# Run browser tests with visible browsers
pnpm test:browser:headed

# Run browser tests with debugger
pnpm test:browser:debug

# Start fixture server for manual testing
pnpm serve
```

## Conclusion

This testing strategy ensures that use-vibes will work reliably across different browsers and web page structures, handling various edge cases and providing a consistent experience. The combination of unit tests, integration tests, and browser-based tests provides comprehensive coverage of the module's functionality.
