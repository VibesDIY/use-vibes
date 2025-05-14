import { useState } from 'react'
import { ImgGen } from 'use-vibes'
import { useFireproof } from 'use-fireproof'
import type { DocBase, DocFileMeta } from 'use-fireproof'
import './App.css'

// Define interface for image documents
interface ImageDocument extends DocBase {
  type: 'image';
  prompt: string;
  created?: number;
  _files?: Record<string, File | DocFileMeta>;
}

function App() {
  const [inputPrompt, setInputPrompt] = useState('')
  const [activePrompt, setActivePrompt] = useState('')
  const [isGenerating, setIsGenerating] = useState(false)
  
  // Use Fireproof to query all images
  const { useLiveQuery } = useFireproof("ImgGen")

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputPrompt(e.target.value)
  }

  const handleGenerate = () => {
    if (!inputPrompt.trim()) return
    // Set the active prompt that gets passed to ImgGen only when button is clicked
    setActivePrompt(inputPrompt)
    setIsGenerating(true)
    // ImgGen will call onLoad or onError when generation completes
  }
  
  const handleImageLoad = () => {
    console.log('Image generation completed!')
    setIsGenerating(false)
  }
  
  const handleImageError = (error: Error) => {
    console.error('Image generation failed:', error)
    setIsGenerating(false)
  }

  // Get all documents with type: 'image'
  const { docs: imageDocuments } = useLiveQuery<ImageDocument>('type', { key: 'image' })

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
          onLoad={handleImageLoad}
          onError={handleImageError}
        />
      </div>
      
      {/* Display list of previously generated images */}
      <div className="history-container">
        <h2>Image History</h2>
        <ul>
          {imageDocuments.length > 0 ? 
            imageDocuments.map(doc => (
              <li key={doc._id}>
                {JSON.stringify({...doc, _files: undefined})}
              </li>
            )) : 
            <li>No images generated yet</li>
          }
        </ul>
      </div>
    </div>
  )
}

export default App
