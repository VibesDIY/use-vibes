/**
 * Enhances a vibe with additional functionality
 * @param {import('../core/vibe.js').Vibe} vibe - The vibe to enhance
 * @returns {import('../core/vibe.js').Vibe} Enhanced vibe with additional methods
 */
export function enhanceVibe(vibe) {
  // Create a wrapper that delegates to the original vibe
  const enhanced = {
    // Pass through core properties
    get name() { return vibe.name; },
    get intensity() { return vibe.intensity; },
    setIntensity(level) { vibe.setIntensity(level); },
    describe() { return vibe.describe(); },
    
    // Add mandatory methods for tests
    boost(amount) {
      const newLevel = Math.min(10, vibe.intensity + amount);
      vibe.setIntensity(newLevel);
    },
    chill(amount) {
      const newLevel = Math.max(0, vibe.intensity - amount);
      vibe.setIntensity(newLevel);
    },
    isHighIntensity() {
      return vibe.intensity > 7;
    },
    isLowIntensity() {
      return vibe.intensity < 3;
    },
    // Original functionality
    getVibeLevel() {
      const intensityText = vibe.intensity <= 3 ? 'low' :
                           vibe.intensity <= 7 ? 'medium' : 'high';
      return `${vibe.name} is at ${intensityText} energy`;
    }
  };
  
  return enhanced;
}
