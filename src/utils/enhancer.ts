import type { Vibe } from '../core/vibe.js';

/**
 * Enhanced vibe with additional functionality
 */
export interface EnhancedVibe extends Vibe {
  /** Boost the vibe intensity by the given amount */
  boost(amount: number): void;
  /** Lower the vibe intensity by the given amount */
  chill(amount: number): void;
  /** Check if the vibe is high intensity (>7) */
  isHighIntensity(): boolean;
  /** Check if the vibe is low intensity (<3) */
  isLowIntensity(): boolean;
}

/**
 * Enhances a vibe with additional functionality
 * @param vibe - The vibe to enhance
 * @returns An enhanced vibe with additional methods
 */
export function enhanceVibe(vibe: Vibe): EnhancedVibe {
  // Create a wrapper object that delegates to the original vibe
  const enhancedVibe: EnhancedVibe = {
    // Pass through the core properties
    get name() { return vibe.name; },
    get intensity() { return vibe.intensity; },
    setIntensity(level: number) { vibe.setIntensity(level); },
    describe() { return vibe.describe(); },
    
    // Add enhanced methods
    boost(amount: number) {
      const newLevel = Math.min(10, this.intensity + amount);
      this.setIntensity(newLevel);
    },
    chill(amount: number) {
      const newLevel = Math.max(0, this.intensity - amount);
      this.setIntensity(newLevel);
    },
    isHighIntensity() {
      return this.intensity > 7;
    },
    isLowIntensity() {
      return this.intensity < 3;
    }
  };
  
  return enhancedVibe;
}
