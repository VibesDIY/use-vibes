import { useState } from 'react'
import { ImgGen } from 'use-vibes'
import './App.css'

function App() {
  const [inputPrompt, setInputPrompt] = useState('')
  const [activePrompt, setActivePrompt] = useState('')
  const [isGenerating, setIsGenerating] = useState(false)

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputPrompt(e.target.value)
  }

  const handleGenerate = () => {
    if (!inputPrompt.trim()) return
    // Set the active prompt that gets passed to ImgGen only when button is clicked
    setActivePrompt(inputPrompt)
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
          value={inputPrompt}
          onChange={handleInputChange}
          placeholder="Enter your image prompt here..."
          className="prompt-input"
        />
        <button 
          onClick={handleGenerate} 
          className="generate-button"
          disabled={isGenerating || !inputPrompt.trim()}
        >
          {isGenerating ? 'Generating...' : 'Generate'}
        </button>
      </div>
      
      <div className="image-container" >
        <ImgGen 
          prompt={activePrompt}
          options={{
            imgUrl: 'https://vibecode.garden',
            size: '1024x1024'
          }}
        />
      </div>
    </div>
  )
}

export default App
