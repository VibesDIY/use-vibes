import { useState } from 'react'
import { ImgGen } from 'use-vibes/dist/components/ImgGen.js'
import './App.css'

function App() {
  const [prompt, setPrompt] = useState('')

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPrompt(e.target.value)
  }

  return (
    <div className="app-container">
      <div className="input-container">
        <input
          type="text"
          value={prompt}
          onChange={handleInputChange}
          placeholder="Enter your image prompt here..."
          className="prompt-input"
        />
      </div>
      <div className="image-container">
        <ImgGen prompt={prompt} />
      </div>
    </div>
  )
}

export default App
