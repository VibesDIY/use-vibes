import { useState } from 'react'
import { ImgGen } from 'use-vibes'
import './App.css'

function App() {
  const [prompt, setPrompt] = useState('')
  const [isGenerating, setIsGenerating] = useState(false)

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPrompt(e.target.value)
  }

  const handleGenerate = () => {
    if (!prompt.trim()) return
    setIsGenerating(true)
    // Simulate image generation
    setTimeout(() => {
      setIsGenerating(false)
    }, 2000)
  }

  return (
    <div className="container">
      <h1>Simple Image Generator</h1>
      
      <div className="input-container">
        <input
          type="text"
          value={prompt}
          onChange={handleInputChange}
          placeholder="Enter your image prompt here..."
          className="prompt-input"
        />
        <button 
          onClick={handleGenerate} 
          className="generate-button"
          disabled={isGenerating || !prompt.trim()}
        >
          {isGenerating ? 'Generating...' : 'Generate'}
        </button>
      </div>
      
      <div className="image-container">
        <ImgGen prompt={prompt} />
      </div>
    </div>
  )
}

export default App
