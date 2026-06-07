# Login Page Glassmorphism Enhancement

**Date:** 2026-06-07
**Status:** approved

## Scope

Enhance the left-side form area of the login page (`AuthPanel.tsx`) to match the visual richness
of the right-side image carousel. Single-file change to `components/auth/AuthPanel.tsx`.

## Design Decisions

- **Style base:** Apple-style glassmorphism — minimal, elegant, high opacity
- **Color accent:** Theme-color glow in top-left corner of the glass card, transitioning with carousel
- **Micro-interactions:** brightness shift on button hover (no layout-affecting transforms),
  smooth focus ring transitions on inputs

## Visual Specification

### Glass Card
- `bg-white/75` — high opacity for light-mode visibility
- `backdrop-blur-2xl` — strong blur for depth separation
- `rounded-[24px]` — rounded corners
- `border border-black/5` — visible in all light-mode backgrounds
- `shadow-xl shadow-black/5` — subtle elevation

### Corner Glow
- A radial gradient overlay in the card's top-left corner (~1/4 area)
- Color: `var(--auth-gradient-from)` fading to transparent
- Opacity: ~0.3, so the glow is noticeable but not overpowering
- Transition: `transition-opacity duration-700` — synchronized with carousel cross-fade timing

### Micro-interactions
- Submit button hover: `brightness-110` (no scale, avoids layout shift per UX guidelines)
- Input focus: existing `ring-2` + `border-[--auth-accent]` with 200ms transition (already implemented)
- All transitions suppressed under `prefers-reduced-motion: reduce` (already implemented)

### Anti-patterns Avoided
- No scale transforms on hover (layout shift risk)
- No emoji icons
- No low-opacity glass in light mode
- No animation that doesn't respect reduced-motion

## Implementation Notes

- All theme color values sourced from existing CSS custom properties on `.auth-visual-theme`
- Corner glow uses inline `style` for the radial-gradient, leveraging `--auth-gradient-from`
- For carousel-driven color transitions: render two glow layers with cross-fade opacity, same pattern
  used by the image carousel
- Mobile (`< lg`): glass card still renders; carousel is hidden but page gradient + glow provide
  visual interest
