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
      // Call useVibes with the prompt
      await useVibes(outputElement, {
        prompt: prompt,
      });
    } catch (error) {
      console.error('Error applying vibes:', error);
      outputElement.innerHTML = `<p class="error">Error: ${error.message}</p>`;
    }
  });
});
