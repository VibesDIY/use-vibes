// Import from the installed package
import { useVibes } from 'use-vibes';

// Set the API key from environment variables
window.CALLAI_API_KEY = import.meta.env.VITE_CALLAI_API_KEY;

// Display warning if API key is missing
if (!window.CALLAI_API_KEY) {
  console.error('CALLAI_API_KEY is missing! Please set it in your .env file.');
}

document.addEventListener('DOMContentLoaded', () => {
  const outputElement = document.getElementById('output');
  const promptInput = document.getElementById('prompt-input');
  const submitBtn = document.getElementById('submit-btn');

  submitBtn.addEventListener('click', async () => {
    const prompt = promptInput.value.trim();
    if (!prompt) {
      outputElement.innerHTML = '<p class="error">Please enter a prompt</p>';
      return;
    }

    try {
      // Apply loading state
      outputElement.innerHTML = '<p>Applying vibes...</p>';
      
      // Call useVibes with the prompt and enable API exposing
      // Script execution happens automatically if returned by the AI
      const vibesApp = await useVibes(outputElement, {
        prompt: prompt + ' Include a script that demonstrates dynamic functionality.',
        exposeAPIs: true, // Enable API exposing to window object
      });
      
      // Log the vibesApp instance to console
      console.log('VibesApp instance created:', vibesApp);
      
      // Add info text about script execution
      const infoDiv = document.createElement('div');
      infoDiv.classList.add('script-info');
      infoDiv.innerHTML = '<p><small>✓ Any script returned by the AI has been automatically executed. APIs like callAI and useFireproof are available to scripts.</small></p>';
      outputElement.appendChild(infoDiv);
    } catch (error) {
      console.error('Error applying vibes:', error);
      outputElement.innerHTML = `<p class="error">Error: ${error.message}</p>`;
    }
  });
});
