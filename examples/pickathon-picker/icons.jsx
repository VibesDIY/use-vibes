import React from 'react';

// Inline Feather-style icons so the UI reads as vector marks, not emoji glyphs.
// Every icon inherits color via `currentColor` and sizes off the `size` prop
// (default 20), matching the external-link / trash icons already used in the views.

const base = (size) => ({
  width: size,
  height: size,
  viewBox: '0 0 24 24',
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
});

const HEART_PATH =
  'M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 1 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z';

// state: 'full' (filled), 'half' (left half filled — the "some faved" band state),
// or 'empty' (outline only).
export function HeartIcon({ state = 'empty', size = 20, className = '' }) {
  if (state === 'half') {
    return (
      <svg {...base(size)} className={className} aria-hidden="true">
        <defs>
          <clipPath id="pk-heart-half">
            <rect x="0" y="0" width="12" height="24" />
          </clipPath>
        </defs>
        <path d={HEART_PATH} fill="currentColor" clipPath="url(#pk-heart-half)" />
        <path d={HEART_PATH} fill="none" stroke="currentColor" strokeWidth="2" />
      </svg>
    );
  }
  const filled = state === 'full';
  return (
    <svg {...base(size)} className={className} aria-hidden="true">
      <path
        d={HEART_PATH}
        fill={filled ? 'currentColor' : 'none'}
        stroke="currentColor"
        strokeWidth="2"
      />
    </svg>
  );
}

export function StarIcon({ size = 16, className = '' }) {
  return (
    <svg {...base(size)} className={className} aria-hidden="true">
      <path
        d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"
        fill="currentColor"
        stroke="currentColor"
        strokeWidth="1.5"
      />
    </svg>
  );
}

export function ClipboardIcon({ size = 20, className = '' }) {
  return (
    <svg
      {...base(size)}
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
    >
      <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
      <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
    </svg>
  );
}

export function CheckIcon({ size = 20, className = '' }) {
  return (
    <svg
      {...base(size)}
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}
