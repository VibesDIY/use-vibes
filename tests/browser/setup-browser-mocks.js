// Mock implementation for the browser tests
// This script will be injected into the test page before any tests run

(function setupMocks() {
  // Flag to indicate mocks are initialized
  window.mockInitialized = true;

  // eslint-disable-next-line no-console
  console.log('-----------------------------------------------------------');
  // eslint-disable-next-line no-console
  console.log('🔧 MOCK SETUP: Setting up call-ai mocks for browser tests...');
  // eslint-disable-next-line no-console
  console.log('-----------------------------------------------------------');

  // Create a global debug flag to track what's happening with our mocks
  window.MOCK_DEBUG = {
    mockCallsCount: 0,
    lastPrompt: null,
    lastResponse: null,
  };

  // Mock the callAI function directly to ensure tests work correctly
  // This is the most reliable way to mock the call-ai module
  window.callAI = function mockCallAI(userPrompt, options = {}) {
    window.MOCK_DEBUG.mockCallsCount++;
    
    // eslint-disable-next-line no-console
    console.log('🔄 MOCK INTERCEPTED: callAI invoked - call #', window.MOCK_DEBUG.mockCallsCount);
    // eslint-disable-next-line no-console
    console.log('📝 MOCK PROMPT:', typeof userPrompt === 'string' ? userPrompt.substring(0, 100) + '...' : 'Non-string prompt');
    // eslint-disable-next-line no-console
    console.log('⚙️ MOCK OPTIONS:', JSON.stringify(options));
    
    // Store the prompt for debugging
    window.MOCK_DEBUG.lastPrompt = userPrompt;
    window.MOCK_DEBUG.lastOptions = options;
    
    // Extract the actual request from the longer prompt - more robust regex handling
    let extractedPrompt = 'Default prompt';
    
    if (typeof userPrompt === 'string') {
      const promptMatch = userPrompt.match(
        /Transform the HTML content based on this request:\s*([^\n]+)/
      );
      
      if (promptMatch && promptMatch[1]) {
        extractedPrompt = promptMatch[1].trim();
      } else if (userPrompt.includes('Alternative configuration test')) {
        extractedPrompt = 'Alternative configuration test';
      } else if (userPrompt.includes('error') || userPrompt.includes('fail')) {
        extractedPrompt = 'Error simulation test';
      } else {
        // Just use a substring as a fallback - don't let tests fail because of regex
        extractedPrompt = userPrompt.length > 50 ? userPrompt.substring(0, 50) + '...' : userPrompt;
      }
    }
    
    // eslint-disable-next-line no-console
    console.log('🔍 EXTRACTED PROMPT:', extractedPrompt);

    // Check if this is an error test case
    if (extractedPrompt.includes('error') || extractedPrompt.includes('fail')) {
      // eslint-disable-next-line no-console
      console.log('🚨 SIMULATING ERROR RESPONSE');
      return Promise.reject(new Error('Simulated error from mock callAI'));
    }

    // Create response based on the prompt content
    let htmlContent;
    let explanationText;
    
    if (extractedPrompt.includes('Alternative configuration')) {
      // Custom response for alternative config test
      htmlContent = `<div style="background-color: #fff8e1; padding: 10px; border: 2px solid #ffc107; border-radius: 5px;">
        <strong>🎭 Vibes received prompt:</strong> "Alternative configuration test"
        <br><small>(Alternative config mock response)</small>
      </div>`;
      explanationText = 'Mock explanation for alternative configuration';
    } else {
      // Default response
      htmlContent = `<div style="background-color: #eefbff; padding: 10px; border: 2px solid #0099cc; border-radius: 5px;">
        <strong>🎭 Vibes received prompt:</strong> "${extractedPrompt}"
        <br><small>(This is a mock response from browser test)</small>
      </div>`;
      explanationText = 'This is a mock explanation from the browser test';
    }
    
    // Create the response object in the exact format that useVibes expects
    const responseObj = {
      html: htmlContent,
      explanation: explanationText,
    };
    
    // Store the response for debugging
    window.MOCK_DEBUG.lastResponse = responseObj;
    
    // eslint-disable-next-line no-console
    console.log('✅ MOCK RESPONSE CREATED:', JSON.stringify(responseObj).substring(0, 100) + '...');
    
    // useVibes expects a Promise that resolves to a string (JSON)
    return Promise.resolve(JSON.stringify(responseObj));
  };

  // As a fallback, also mock fetch for any direct API calls
  // Store the original fetch
  window._originalFetch = window.fetch;

  // Mock the fetch API for call-ai
  window.fetch = async function mockedFetch(url, options) {
    // Check if this is a call to the AI API
    if (url && (url.includes('api.call-ai.com') || url.includes('api/v1/chat/completions'))) {
      // eslint-disable-next-line no-console
      console.log('Intercepted fetch call to:', url);

      // Parse the request body to get the prompt
      const requestBody = JSON.parse(options.body);
      let promptText = '';

      // Extract prompt from messages
      if (requestBody.messages && requestBody.messages.length > 0) {
        const lastMessage = requestBody.messages[requestBody.messages.length - 1];
        promptText = lastMessage.content || '';
      }

      // Create a properly formatted mock response
      const mockResponse = {
        choices: [
          {
            message: {
              role: 'assistant',
              content: JSON.stringify({
                html: `<div>🎭 Vibes received prompt: "${promptText}"</div>`,
                explanation: 'This is a mock explanation from the browser test',
              }),
            },
            index: 0,
          },
        ],
        id: 'mock-response-id',
        model: 'gpt-3.5-turbo',
        object: 'chat.completion',
      };

      // Return a Response object with the mock data
      return new Response(JSON.stringify(mockResponse), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // For any other fetch calls, use the original implementation
    return window._originalFetch(url, options);
  };

  // eslint-disable-next-line no-console
  console.log('-----------------------------------------------------------');
  // eslint-disable-next-line no-console
  console.log('✅ MOCK SETUP COMPLETE: All mocks for callAI and fetch API ready!');
  // eslint-disable-next-line no-console
  console.log('-----------------------------------------------------------');
})();
