// scripts/generate-bookmarklet.js
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { minify } from 'terser';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Read the bookmarklet template
const bookmarkletTemplatePath = path.join(__dirname, '../templates/bookmarklet-template.js');
const bookmarkletTemplate = fs.readFileSync(bookmarkletTemplatePath, 'utf8');

// Minify the code
async function buildBookmarklet() {
  // eslint-disable-next-line no-console
  console.log('Building bookmarklet...');
  try {
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
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { 
      font-family: system-ui, -apple-system, BlinkMacSystemFont, sans-serif;
      max-width: 800px;
      margin: 0 auto;
      padding: 20px;
      line-height: 1.6;
    }
    .bookmarklet { 
      display: inline-block;
      padding: 8px 12px;
      background: #4a8feb;
      color: white;
      text-decoration: none;
      border-radius: 4px;
      margin: 20px 0;
      font-weight: bold;
    }
    .bookmarklet:hover {
      background: #3a7edb;
    }
    code {
      background: #f5f5f5;
      padding: 2px 4px;
      border-radius: 4px;
      font-family: monospace;
    }
    pre {
      background: #f5f5f5;
      padding: 15px;
      border-radius: 4px;
      overflow-x: auto;
    }
    .note {
      background: #fffde7;
      border-left: 4px solid #ffeb3b;
      padding: 10px 15px;
      margin: 20px 0;
    }
  </style>
</head>
<body>
  <h1>useVibes Bookmarklet</h1>
  <p>This bookmarklet allows you to test useVibes on any website. Before using, you'll need to:</p>
  <ol>
    <li>Host the useVibes IIFE bundle on a web server or CDN</li>
    <li>Get your API key for call-ai</li>
  </ol>
  
  <div class="note">
    <strong>Important:</strong> You will need to edit this bookmarklet to replace <code>YOUR_API_KEY_HERE</code> with your actual API key, and update the script URL if needed.
  </div>
  
  <h2>Installation</h2>
  <p>Drag this link to your bookmarks bar:</p>
  <a class="bookmarklet" href="${bookmarkletCode}">useVibes</a>
  
  <h2>Usage Instructions</h2>
  <ol>
    <li>Drag the above link to your bookmarks bar</li>
    <li>Navigate to any website</li>
    <li>Click the bookmark</li>
    <li>Click on any element you want to enhance</li>
    <li>Enter your prompt when prompted</li>
    <li>Watch as useVibes transforms the element</li>
  </ol>
  
  <h2>How to Customize</h2>
  <p>To edit the bookmarklet with your API key:</p>
  <ol>
    <li>Right-click on the bookmarklet in your bookmarks bar</li>
    <li>Select "Edit" or "Properties"</li>
    <li>Find <code>CALLAI_API_KEY='YOUR_API_KEY_HERE'</code> and replace with your actual key</li>
    <li>Find <code>useVibesScriptUrl='https://unpkg.com/use-vibes@latest/lib/use-vibes.iife.js'</code> and update if needed</li>
  </ol>
  
  <h2>Bookmarklet Code</h2>
  <p>You can also manually create the bookmarklet with this code:</p>
  <pre>${bookmarkletCode}</pre>
</body>
</html>
    `;

    fs.writeFileSync(path.join(distDir, 'bookmarklet.html'), htmlContent);
    // eslint-disable-next-line no-console
    console.log('Bookmarklet HTML file generated at: dist/bookmarklet.html');

    // Also write a raw JS file with just the code
    fs.writeFileSync(path.join(distDir, 'bookmarklet.js'), bookmarkletCode);
    // eslint-disable-next-line no-console
    console.log('Bookmarklet JS file generated at: dist/bookmarklet.js');
  } catch (error) {
    console.error('Error building bookmarklet:', error);
    process.exit(1);
  }
}

buildBookmarklet();
