# Step 2: Archived Web Pages for Browser Testing

## Goal

Create a fixtures directory containing archived web pages from the internet for testing the useVibes module in realistic scenarios, plus one simple Hello World page.

## Web Pages to Archive

1. **Craigslist SF Home Page**

   - URL: https://sfbay.craigslist.org/
   - Represents a classifieds listing with complex layout
   - Contains various interactive elements

2. **Wikipedia Permalink Page**

   - URL: https://en.wikipedia.org/wiki/Permalink
   - Example of content-heavy page with references
   - Contains various article structures and navigation elements

3. **Google News**

   - URL: https://news.google.com/
   - Dynamic content loading
   - Complex layout with cards and multiple sections

4. **Hacker News**

   - URL: https://news.ycombinator.com/
   - Simple layout but with interactive elements
   - Good example of a forum/discussion page

5. **Hello World Page**
   - A simple custom HTML page
   - Minimal structure for basic testing

## Archiving Requirements

- Archives should preserve JavaScript functionality
- CSS styling must be maintained
- Interactive elements should work as expected
- Local assets should be properly referenced

## Archiving Tools Options

1. **SingleFile**

   - Browser extension that saves complete pages as single HTML files
   - Preserves CSS, images, fonts, and can execute scripts
   - GitHub: https://github.com/gildas-lormeau/SingleFile

2. **HTTrack**

   - Website copier that downloads complete websites to local directory
   - Maintains directory structure and converts links
   - Website: https://www.httrack.com/

3. **Playwright/Puppeteer**

   - Can be used to write custom scripts that capture full page state
   - Allows handling of JavaScript execution and state
   - Good for pages requiring authentication or interaction

4. **MHTML Format**

   - Browser's built-in "Save as Web Page, Complete" feature
   - Saves everything in a single MHTML file

5. **Wget with --page-requisites**
   - Command-line tool for downloading pages with all assets
   - Example: `wget --page-requisites --convert-links --span-hosts --adjust-extension https://example.com/`

## Directory Structure

```
/fixtures
  /web-archives
    /craigslist-sf       # Archived Craigslist SF page
    /wikipedia-permalink # Archived Wikipedia page
    /google-news         # Archived Google News
    /hacker-news         # Archived Hacker News
  /basic
    /hello-world.html    # Simple Hello World page
  /index.html            # Index listing all fixtures
```

## Next Steps

1. Select appropriate archiving tool based on needs
2. Create archives of each target website
3. Test each archive to ensure JavaScript execution works properly
4. Create the simple Hello World page
5. Build an index page to navigate the fixtures
