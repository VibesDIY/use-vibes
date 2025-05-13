// Re-export everything from call-ai
export * from 'call-ai';

// Export ImgGen component
export { default as ImgGen } from './components/ImgGen.js';
export type { ImgGenProps } from './components/ImgGen.js';

// Export useVibes and its types
export { useVibes, type UseVibesConfig, type VibesApp } from './useVibes.js';
