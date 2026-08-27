import React from 'react';
import { createRoot } from 'react-dom/client';
import LiquidGlass from 'liquid-glass-react';
import saveIcon from '../assets/save-transparent-centered.png';
import trimIcon from '../assets/trim-transparent-centered.png';
import discardIcon from '../assets/discard-transparent-centered.png';
import '../app.js';
import './liquid-float.css';

// The source icons include uneven transparent margins. Use centered cut-outs so
// the visible glyph, rather than only its image canvas, is centered in each menu button.
[
  ['#floatSaveButton img', saveIcon],
  ['#floatTrimButton img', trimIcon],
  ['#floatDiscardButton img', discardIcon],
].forEach(([selector, source]) => {
  const image = document.querySelector(selector);
  if (image) image.src = source;
});

const mount = document.getElementById('floatReactMount');

if (mount) {
  createRoot(mount).render(
    <LiquidGlass
      className="liquid-float-surface"
      displacementScale={64}
      blurAmount={0.08}
      saturation={112}
      aberrationIntensity={1.35}
      elasticity={0.23}
      cornerRadius={72}
      padding="0"
      mode="shader"
      overLight
    >
      <div className="liquid-float-fill" />
    </LiquidGlass>,
  );
}
