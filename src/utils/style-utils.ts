/**
 * Utility functions for managing component styling
 */

/**
 * Combines multiple class names into a single string, filtering out falsy values
 * Similar to the popular 'classnames' or 'clsx' libraries but with minimal implementation
 * 
 * @example
 * // Returns "foo bar baz"
 * combineClasses('foo', 'bar', 'baz')
 * 
 * @example
 * // Returns "btn btn-primary"
 * combineClasses('btn', condition && 'btn-primary', false && 'btn-large')
 */
export function combineClasses(...classes: (string | boolean | null | undefined)[]): string {
  return classes.filter(Boolean).join(' ');
}

/**
 * Type definitions for component classes props pattern
 */
export interface ImgGenClasses {
  /** Root container class */
  root?: string;
  /** Image container class */
  container?: string;
  /** Image element class */
  image?: string;
  /** Overlay panel class */
  overlay?: string;
  /** Progress indicator class */
  progress?: string;
  /** Placeholder element class */
  placeholder?: string;
  /** Error container class */
  error?: string;
  /** Control buttons container class */
  controls?: string;
  /** Button class */
  button?: string;
  /** Prompt container class */
  prompt?: string;
  /** Delete confirmation overlay class */
  deleteOverlay?: string;
}

/**
 * Default empty classes object
 */
export const defaultClasses: ImgGenClasses = {};
