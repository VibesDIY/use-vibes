import { useEffect, useState } from 'react'
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
  const [selectedImageId, setSelectedImageId] = useState<string | undefined>()
  
  // Use Fireproof to query all images
  const { useLiveQuery } = useFireproof("ImgGen")

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputPrompt(e.target.value)
  }

  const handleGenerate = () => {
    if (!inputPrompt.trim()) return
    // Set the active prompt that gets passed to ImgGen only when button is clicked
    setActivePrompt(inputPrompt)
    setSelectedImageId(undefined)
    setIsGenerating(true)
    // ImgGen will call onLoad or onError when generation completes
  }
  
  const handleImageLoad = () => {
    setIsGenerating(false)
  }
  
  const handleImageError = (error: Error) => {
    console.error('Image generation failed:', error)
    setIsGenerating(false)
  }

  // Get all documents with type: 'image'
  const { docs: imageDocuments } = useLiveQuery<ImageDocument>('type', { key: 'image' })

  useEffect(() => {
    console.log('activePrompt', activePrompt)
    console.log('selectedImageId', selectedImageId)
  }, [activePrompt, selectedImageId])

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
      
      <div className="img-wrapper">
        <ImgGen 
          prompt={activePrompt}
          _id={selectedImageId}
          options={{
            imgUrl: 'https://vibecode.garden',
            size: '1024x1024'
          }}
          onLoad={handleImageLoad}
          onError={handleImageError}
        />
      </div>
      
      {/* Display previously generated images */}
      {imageDocuments.length > 0 && (
        <div className="history">
          <h3>Previously Generated Images</h3>
          <div className="image-grid">
            {imageDocuments.map((doc) => (
              <div key={doc._id} className="image-item">
                <div 
                  className="thumbnail-container"
                  onClick={() => {
                    // Load the selected image by ID in the main viewer
                    setSelectedImageId(doc._id);
                    // Clear the active prompt when loading by ID
                    setActivePrompt('');
                  }}
                >
                  <ImgGen 
                    _id={doc._id} 
                    alt={doc.prompt}
                    className="thumbnail-img"
                  />
                </div>
                <div className="prompt-text">{doc.prompt}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export default App
