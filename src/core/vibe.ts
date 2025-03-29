/**
 * Vibe interface represents the core functionality
 */
export interface Vibe {
  /** The name of the vibe */
  name: string;
  /** The intensity level of the vibe */
  intensity: number;
  /** Set the intensity of the vibe */
  setIntensity(level: number): void;
  /** Get a description of the current vibe */
  describe(): string;
}

/**
 * Creates a new vibe with the given name
 * @param name - Name for the vibe
 * @returns A new Vibe instance
 */
export function createVibe(name: string): Vibe {
  let intensityLevel = 5; // Default intensity
  
  return {
    name,
    get intensity() {
      return intensityLevel;
    },
    setIntensity(level: number) {
      if (level < 0 || level > 10) {
        throw new Error('Intensity must be between 0 and 10');
      }
      intensityLevel = level;
    },
    describe() {
      return `${name} vibe at intensity ${intensityLevel}`;
    }
  };
}
