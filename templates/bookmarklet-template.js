// useVibes Bookmarklet Template
// This will be minified and converted to a bookmarklet

(function() { // eslint-disable-line no-unused-vars
  // Function to load a script dynamically
  function loadScript(url, callback) {
    const script = document.createElement('script');
    script.src = url;
    script.onload = callback;
    document.head.appendChild(script);
  }

  // URL to your hosted useVibes IIFE build
  // This will be replaced by the user with their own hosted version
  const useVibesScriptUrl = 'https://unpkg.com/use-vibes@latest/lib/use-vibes.iife.js';
  
  // Set API key for call-ai (required)
  // User will need to replace this with their own API key
  window.CALLAI_API_KEY = 'YOUR_API_KEY_HERE';

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
      // eslint-disable-next-line no-undef
      useVibes(target, {
        prompt: promptText,
      }).then(app => {
        // eslint-disable-next-line no-console
        console.log('useVibes applied successfully!', app);
      }).catch(err => {
        // eslint-disable-next-line no-console
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
  loadScript(useVibesScriptUrl, function() {
    // eslint-disable-next-line no-undef
    if (typeof useVibes !== 'function') {
      alert('useVibes library not loaded correctly!');
      return;
    }
    
    // Start element selection
    document.addEventListener('click', handleClick, true);
  });
})();
