# useVibes - App Gen Anywhere

useVibes is a vanilla browser TypeScript module designed for an HTML inject-first approach to building AI-augmented micro-apps. It extracts the current state of the page by capturing the raw HTML (via document.body.innerHTML), the associated styles, and a visual snapshot using html2canvas. This repository serves as a starting point for building and shipping the useVibes product.

⸻

Overview
	•	Purpose:
Build a lightweight, agentic editor that transforms any div into a dynamic micro-app. The module leverages a minimal core—using Fireproof for local persistence and callAi for AI interactions—while preserving the page’s inherent structure and style.
	•	Architecture:
	•	HTML Injection-First: The library is injected into a page and operates on the current DOM state.
	•	Vanilla Browser Module: Written in TypeScript and built as an ESM module suitable for distribution via esm.sh/jsr style.

⸻

Directory Structure
	•	src/
Contains the source code for the useVibes library.
	•	fixtures/
A collection of HTML challenge files. These fixtures serve as test cases for validating that useVibes can handle a variety of page structures.
	•	docs/
Documentation directory which includes:
	•	llms.txt: A text file specifying the details and technical context for LLM integrations and other project guidelines.
	•	tests/
Browser tests to ensure proper functionality:
	1.	A test that verifies an HTML fixture loads correctly without invoking the library.
	2.	A test that confirms the useVibes library loads and performs a simple injection (e.g., injecting “hello world” into the page).

⸻

Prerequisites
	•	Node.js (v14 or higher)
	•	pnpm package manager
	•	A modern web browser for testing

⸻

Getting Started
	1.	Clone the Repository:

git clone https://github.com/fireproof-storage/use-vibes.git
cd use-vibes


	2.	Install Dependencies:

pnpm install


	3.	Build the Project:
The project is configured to compile the TypeScript source into an ESM module suitable for browser use.

pnpm run build



⸻

Testing

Fixture Loading Test

Ensure that HTML fixtures load correctly:
	1.	Open a test HTML file from the fixtures/ directory in your browser.
	2.	Verify that the page loads as expected without any library interference.

Library Injection Test

Verify that useVibes loads and executes a basic operation:
	1.	Create a simple test page that includes the built useVibes module.
	2.	Use the library to inject a “hello world” string into a target element. For example:

<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>useVibes Test</title>
  <script type="module" src="dist/use-vibes.js"></script>
</head>
<body>
  <div id="vibe-target"></div>
  <script type="module">
    import { useVibes } from './dist/use-vibes.js';
    // Basic injection test: inject "hello world"
    useVibes("#vibe-target", {
      prompt: "inject hello world",
      onInit: () => {
        document.querySelector("#vibe-target").innerHTML = "hello world";
      }
    });
  </script>
</body>
</html>


	3.	Open this page in your browser and confirm that “hello world” is injected into the target element.

⸻

Build and Deployment
	•	Build:
The build script compiles TypeScript into a browser-friendly ESM module. Check your package.json for the build command:

"scripts": {
  "build": "tsc --project tsconfig.json"
}


	•	Deployment:
The resulting module is designed for deployment via esm.sh or similar services and can be embedded directly into HTML pages using a script tag.

⸻

Next Steps
	1.	Vibe Check:
After completing the initial tests, review the results and gather feedback.
	2.	Iterate:
Use feedback to refine functionality and integration.
	3.	Expand:
Continue to develop additional features and tests, integrating further capabilities such as Fireproof, callAi, and more advanced micro-app interactions.

⸻

License

This project is open source. See the LICENSE file for details.

⸻

Contact

For questions, feedback, or contributions, please open an issue on the repository or contact the maintainers.
