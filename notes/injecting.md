# Testing useVibes on Any Website with a Bookmarklet

This guide explains how to create a bookmarklet that lets you test useVibes on any website by injecting it into the page and applying it to a clicked element.

## Creating the Bookmarklet

### Step 1: Bundle useVibes for Browser Use

First, ensure you have a browser-ready version of useVibes:

1. Run the browser build script:

   ```
   npm run build:browser
   ```

2. This should generate a file in the `lib` directory (e.g., `lib/use-vibes.iife.js`) that we'll use in our bookmarklet.

### Step 2: Create the Bookmarklet Code

Create a JavaScript snippet that:

1. Loads the useVibes library
2. Lets the user click on an element
3. Asks for a prompt using `prompt()`
4. Applies useVibes to the clicked element

```javascript
(function () {
  // Function to load a script dynamically
  function loadScript(url, callback) {
    const script = document.createElement('script');
    script.src = url;
    script.onload = callback;
    document.head.appendChild(script);
  }

  // URL to your hosted useVibes IIFE build
  const useVibesScriptUrl = 'https://your-hosted-path/use-vibes.iife.js';

  // Set API key for call-ai (required)
  window.CALLAI_API_KEY = 'your-api-key-here';

  // Select mode message
  alert('useVibes Injector: Click on any element to apply vibes to it.');

  // Flag to track if we're in selection mode
  let isSelecting = true;

  // Click handler for selecting an element
  function handleClick(e) {
    if (!isSelecting) return;

    // Prevent the default click action
    e.preventDefault();
    e.stopPropagation();

    // Get the clicked element
    const target = e.target;

    // Highlight the selected element
    const originalOutline = target.style.outline;
    target.style.outline = '3px solid red';

    // Ask for the prompt
    const promptText = prompt(
      'Enter a prompt for useVibes:',
      'Create a beautiful element with blue styling'
    );

    if (promptText) {
      // Apply useVibes to the clicked element
      useVibes(target, {
        prompt: promptText,
      })
        .then((app) => {
          console.log('useVibes applied successfully!', app);
        })
        .catch((err) => {
          console.error('Error applying useVibes:', err);
          alert('Error: ' + err.message);
        });
    } else {
      // Reset the outline if canceled
      target.style.outline = originalOutline;
    }

    // Exit selection mode
    isSelecting = false;
    document.removeEventListener('click', handleClick, true);
  }

  // Load useVibes library and then activate element selection
  loadScript(useVibesScriptUrl, function () {
    if (typeof useVibes !== 'function') {
      alert('useVibes library not loaded correctly!');
      return;
    }

    // Start element selection
    document.addEventListener('click', handleClick, true);
  });
})();
```

### Step 3: Convert to a Bookmarklet

To turn this into a bookmarklet:

1. Minify the code using a tool like [minifier.org](https://minifier.org/)
2. Prepend `javascript:` to the minified code
3. Create a new bookmark in your browser and paste the entire string as the URL

For example:

```
javascript:(function(){function loadScript(url,callback){const script=document.createElement('script');script.src=url;script.onload=callback;document.head.appendChild(script);}const useVibesScriptUrl='https://your-hosted-path/use-vibes.iife.js';window.CALLAI_API_KEY='your-api-key-here';alert('useVibes Injector: Click on any element to apply vibes to it.');let isSelecting=true;function handleClick(e){if(!isSelecting)return;e.preventDefault();e.stopPropagation();const target=e.target;const originalOutline=target.style.outline;target.style.outline='3px solid red';const promptText=prompt('Enter a prompt for useVibes:','Create a beautiful element with blue styling');if(promptText){useVibes(target,{prompt:promptText}).then(app=>{console.log('useVibes applied successfully!',app);}).catch(err=>{console.error('Error applying useVibes:',err);alert('Error: '+err.message);});}else{target.style.outline=originalOutline;}isSelecting=false;document.removeEventListener('click',handleClick,true);}loadScript(useVibesScriptUrl,function(){if(typeof useVibes!=='function'){alert('useVibes library not loaded correctly!');return;}document.addEventListener('click',handleClick,true);});})();
```

## Hosting the useVibes Library

For the bookmarklet to work, you need to host the IIFE bundle (use-vibes.iife.js) on a web server. Options include:

1. GitHub Pages
2. Netlify
3. Vercel
4. AWS S3 with public access enabled

After hosting, update the `useVibesScriptUrl` in the bookmarklet code with the correct URL.

## Security Considerations

1. **API Key Handling**: Be very careful with your call-ai API key. In a production scenario, you should never hardcode it in a bookmarklet. Consider:

   - Using a proxy service that securely handles your API key
   - Creating a dedicated API key with usage limits for testing

2. **Cross-Origin Concerns**: Some websites may have Content Security Policies that prevent loading external scripts.

3. **Testing Environment**: Create a test page first before trying on production websites.

## Usage Instructions

1. Navigate to any website
2. Click your bookmarklet
3. Click on any element you want to enhance
4. Enter your prompt in the dialog
5. Watch as useVibes transforms the element

## Debugging Tips

If the bookmarklet doesn't work:

1. Open the browser console (F12) to check for errors
2. Verify that the useVibes script URL is correct and accessible
3. Make sure your API key is valid
4. Test on websites with less restrictive Content Security Policies

---

This is a development/testing tool only and should not be used in production without proper security considerations.

## Including the Bookmarklet in the npm Package

To make this bookmarklet available as part of the npm package release:

1. **Add a Bookmarklet Generation Script**:
   Create a script in the `scripts` directory (e.g., `scripts/generate-bookmarklet.js`) that:

   - Takes the bookmarklet code from a template
   - Minifies it
   - Prepends `javascript:`
   - Writes the result to the `dist` directory

   ```javascript
   // scripts/generate-bookmarklet.js
   const fs = require('fs');
   const path = require('path');
   const { minify } = require('terser');

   // Read the bookmarklet template
   const bookmarkletTemplate = fs.readFileSync(
     path.join(__dirname, '../templates/bookmarklet-template.js'),
     'utf8'
   );

   // Minify the code
   async function buildBookmarklet() {
     const minified = await minify(bookmarkletTemplate, { compress: true, mangle: true });
     const bookmarkletCode = `javascript:${minified.code}`;

     // Ensure dist directory exists
     const distDir = path.join(__dirname, '../dist');
     if (!fs.existsSync(distDir)) {
       fs.mkdirSync(distDir, { recursive: true });
     }

     // Write the HTML file with the bookmarklet
     const htmlContent = `
     <!DOCTYPE html>
     <html>
     <head>
       <title>useVibes Bookmarklet</title>
       <style>
         body { font-family: system-ui, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; }
         .bookmarklet { display: inline-block; padding: 8px 12px; background: #4a8feb; color: white; 
                          text-decoration: none; border-radius: 4px; margin: 20px 0; }
         code { background: #f5f5f5; padding: 2px 4px; border-radius: 4px; }
       </style>
     </head>
     <body>
       <h1>useVibes Bookmarklet</h1>
       <p>Drag this link to your bookmarks bar:</p>
       <a class="bookmarklet" href="${bookmarkletCode}">useVibes</a>
       <h2>Instructions</h2>
       <ol>
         <li>Drag the above link to your bookmarks bar</li>
         <li>Navigate to any website</li>
         <li>Click the bookmark</li>
         <li>Click on any element you want to enhance</li>
         <li>Enter your prompt</li>
       </ol>
       <p><strong>Note:</strong> Before using, edit the bookmarklet to update your API key and the URL to your hosted useVibes library.</p>
     </body>
     </html>
     `;

     fs.writeFileSync(path.join(distDir, 'bookmarklet.html'), htmlContent);
     console.log('Bookmarklet HTML file generated successfully!');

     // Also write a raw JS file with just the code
     fs.writeFileSync(path.join(distDir, 'bookmarklet.js'), bookmarkletCode);
   }

   buildBookmarklet().catch(console.error);
   ```

2. **Create the Bookmarklet Template**:
   Create a file at `templates/bookmarklet-template.js` with the bookmarklet code from this guide.

3. **Update package.json scripts**:
   Add the bookmarklet generation to your build process:

   ```json
   "scripts": {
     "build": "tsc",
     "build:browser": "node scripts/build-browser.js",
     "build:bookmarklet": "node scripts/generate-bookmarklet.js",
     "build:all": "npm run build && npm run build:browser && npm run build:bookmarklet",
     // ... other scripts
   }
   ```

4. **Update README and Documentation**:
   Add a section in your main README about the bookmarklet, pointing users to the HTML file in the dist directory.

5. **Add to .npmignore**:
   Make sure `templates/` is in your .npmignore file, but NOT `dist/bookmarklet.html` or `dist/bookmarklet.js`.

Now, when users install your package, they'll have access to a bookmarklet that they can easily configure with their own API key and hosted library URL.
