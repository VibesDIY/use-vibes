import { useEffect, useState } from 'react';
import { ImgGen } from 'use-vibes';
import { useFireproof } from 'use-fireproof';
import type { DocBase, DocFileMeta } from 'use-fireproof';
import './App.css';

// Define interface for image documents
interface ImageDocument extends DocBase {
  type: 'image';
  prompt: string;
  created?: number;
  _files?: Record<string, File | DocFileMeta>;
}

function App() {
  const [inputPrompt, setInputPrompt] = useState('');
  const [activePrompt, setActivePrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [selectedImageId, setSelectedImageId] = useState<string | undefined>();
  const [quality, setQuality] = useState<'low' | 'medium' | 'high' | 'auto'>('low');

  // Use Fireproof to query all images
  const { useLiveQuery } = useFireproof('ImgGen');

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputPrompt(e.target.value);
  };

  const handleQualityChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseInt(e.target.value);
    const qualityMap: Record<number, 'low' | 'medium' | 'high' | 'auto'> = {
      0: 'low',
      1: 'medium',
      2: 'high',
      3: 'auto',
    };
    setQuality(qualityMap[value]);
  };

  const handleGenerate = (e?: React.FormEvent) => {
    // Prevent default form submission if event exists
    if (e) e.preventDefault();

    if (!inputPrompt.trim()) return;
    // Set the active prompt that gets passed to ImgGen only when button is clicked
    setActivePrompt(inputPrompt.trim());
    setSelectedImageId(undefined);
    setIsGenerating(true);
  };

  const handleImageLoad = () => {
    setIsGenerating(false);
  };

  const handleImageError = (error: Error) => {
    console.error('Image generation failed:', error);
    setIsGenerating(false);
  };

  // Get all documents with type: 'image'
  const { docs: imageDocuments } = useLiveQuery<ImageDocument>('type', {
    key: 'image',
    descending: true,
  });

  return (
    <div className="container">
      <h1>Simple Image Generator</h1>
      <form onSubmit={handleGenerate} className="input-container">
        <input
          type="text"
          value={inputPrompt}
          onChange={handleInputChange}
          placeholder="Enter your image prompt here..."
          className="prompt-input"
        />
        <div className="quality-slider-container">
          <div className="slider-header">
            <label>
              Quality: <span className="quality-value">{quality}</span>
            </label>
          </div>
          <input
            type="range"
            min="0"
            max="3"
            step="1"
            value={['low', 'medium', 'high', 'auto'].indexOf(quality)}
            onChange={handleQualityChange}
            className="quality-slider"
            style={{ width: '100%' }}
          />
          <div
            className="quality-labels"
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              width: '100%',
              marginTop: '8px',
            }}
          >
            <span className={quality === 'low' ? 'active' : ''} style={{ textAlign: 'center' }}>
              Low
            </span>
            <span className={quality === 'medium' ? 'active' : ''} style={{ textAlign: 'center' }}>
              Medium
            </span>
            <span className={quality === 'high' ? 'active' : ''} style={{ textAlign: 'center' }}>
              High
            </span>
            <span className={quality === 'auto' ? 'active' : ''} style={{ textAlign: 'center' }}>
              Auto
            </span>
          </div>
        </div>
        <button
          type="submit"
          className="generate-button"
          disabled={isGenerating || !inputPrompt.trim()}
        >
          {isGenerating ? 'Generating...' : 'Generate Image'}
        </button>
      </form>

      <div className="img-wrapper">
        <ImgGen
          prompt={activePrompt}
          _id={selectedImageId}
          options={{
            quality: quality,
            imgUrl: 'https://vibecode.garden',
            size: '1024x1024',
          }}
          onComplete={handleImageLoad}
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
                <div className="thumbnail-container">
                  <ImgGen
                    _id={doc._id}
                    className="thumbnail-img"
                    options={{
                      quality: quality,
                      imgUrl: 'https://vibecode.garden',
                      size: '1024x1024',
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
