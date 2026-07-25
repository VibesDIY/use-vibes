import React from 'react';

// The favoriting affordance, as one clean inline mark shared across every view so
// the gesture reads the same everywhere. A crisp star (not an emoji): filled =
// picked, hairline outline = not picked, half-filled = some-of-many picked (the
// "favorite the whole band" toggle). Sized in `em` and drawn in `currentColor`, so
// it inherits the button's font-size and color at every call site.
export default function FavMark({ filled, half }) {
  const d =
    'M12 2.6l2.94 5.96 6.58.96-4.76 4.64 1.12 6.55L12 18.2l-5.88 3.1 1.12-6.55L2.48 10.1l6.58-.96L12 2.6z';
  const common = {
    viewBox: '0 0 24 24',
    width: '1em',
    height: '1em',
    'aria-hidden': 'true',
    style: { display: 'inline-block', verticalAlign: '-0.125em' },
  };
  if (half) {
    return (
      <svg {...common}>
        <path
          d={d}
          fill="currentColor"
          fillOpacity="0.4"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <path
        d={d}
        fill={filled ? 'currentColor' : 'none'}
        stroke="currentColor"
        strokeWidth={filled ? '0' : '1.6'}
        strokeLinejoin="round"
      />
    </svg>
  );
}
