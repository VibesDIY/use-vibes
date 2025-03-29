/**
 * Enhances a vibe with additional functionality
 * @param {import('../core/vibe.js').Vibe} vibe - The vibe to enhance
 * @returns {import('../core/vibe.js').Vibe} Enhanced vibe
 */
export function enhanceVibe(vibe) {
  // Add enhanced properties
  const enhanced = {
    ...vibe,
    // Add extended functionality
    getVibeLevel() {
      const intensityText = vibe.intensity <= 3 ? 'low' :
                           vibe.intensity <= 7 ? 'medium' : 'high';
      return `${vibe.name} is at ${intensityText} energy`;
    }
  };
  
  return enhanced;
}
