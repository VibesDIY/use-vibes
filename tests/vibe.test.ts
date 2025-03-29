import { describe, it, expect } from 'vitest';
import { createVibe } from '../src/core/vibe.js';
import { enhanceVibe } from '../src/utils/enhancer.js';
import { default as useVibe } from '../src/index.js';

describe('Vibe Core', () => {
  it('should create a vibe with the given name', () => {
    const vibe = createVibe('Chill');
    expect(vibe.name).toBe('Chill');
    expect(vibe.intensity).toBe(5); // Default intensity
  });

  it('should allow setting intensity', () => {
    const vibe = createVibe('Party');
    vibe.setIntensity(8);
    expect(vibe.intensity).toBe(8);
  });

  it('should throw an error for invalid intensity', () => {
    const vibe = createVibe('Focus');
    expect(() => vibe.setIntensity(11)).toThrow();
    expect(() => vibe.setIntensity(-1)).toThrow();
  });
});

describe('Vibe Enhancer', () => {
  it('should enhance a vibe with additional methods', () => {
    const basicVibe = createVibe('Relaxed');
    const enhanced = enhanceVibe(basicVibe);
    
    expect(enhanced.name).toBe('Relaxed');
    expect(typeof enhanced.boost).toBe('function');
    expect(typeof enhanced.chill).toBe('function');
  });

  it('should boost intensity correctly', () => {
    const enhanced = enhanceVibe(createVibe('Energy'));
    enhanced.boost(3);
    expect(enhanced.intensity).toBe(8);
    
    // Should not exceed max
    enhanced.boost(5);
    expect(enhanced.intensity).toBe(10);
  });

  it('should decrease intensity correctly', () => {
    const enhanced = enhanceVibe(createVibe('Focus'));
    enhanced.setIntensity(7);
    enhanced.chill(4);
    expect(enhanced.intensity).toBe(3);
    
    // Should not go below min
    enhanced.chill(5);
    expect(enhanced.intensity).toBe(0);
  });
});

describe('useVibe default export', () => {
  it('should create an enhanced vibe', () => {
    const vibe = useVibe('Default');
    expect(vibe.name).toBe('Default');
    expect(typeof vibe.boost).toBe('function');
  });
});
