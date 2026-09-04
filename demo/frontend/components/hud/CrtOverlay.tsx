"use client";

// Fixed, pointer-events:none overlays. The grid sits behind everything (z-0),
// the CRT scanline/vignette on top (z-60). Both pure CSS (see globals.css).
export function HudBackground() {
  return <div className="hud-grid" aria-hidden />;
}
export function CrtOverlay() {
  return <div className="crt" aria-hidden />;
}
