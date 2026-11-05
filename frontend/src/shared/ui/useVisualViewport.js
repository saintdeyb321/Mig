import { useEffect } from 'react';

// One shared visual listener, even with nested dialogs. No business or persisted state.
let consumers = 0, dispose;
export function useVisualViewport() {
  useEffect(() => {
    if (consumers++ === 0) {
      const viewport = window.visualViewport, style = document.documentElement.style;
      let frame;
      const update = () => {
        frame = undefined;
        const height = viewport?.height ?? window.innerHeight, top = viewport?.offsetTop ?? 0;
        style.setProperty('--ui-viewport-height', `${height}px`);
        style.setProperty('--ui-viewport-top', `${top}px`);
        style.setProperty('--ui-keyboard-inset', `${Math.max(0, window.innerHeight - height - top)}px`);
      };
      const schedule = () => { if (frame === undefined) frame = requestAnimationFrame(update); };
      update();
      window.addEventListener('resize', schedule);
      viewport?.addEventListener('resize', schedule); viewport?.addEventListener('scroll', schedule);
      dispose = () => {
        cancelAnimationFrame(frame); window.removeEventListener('resize', schedule);
        viewport?.removeEventListener('resize', schedule); viewport?.removeEventListener('scroll', schedule);
        for (const name of ['--ui-viewport-height', '--ui-viewport-top', '--ui-keyboard-inset']) style.removeProperty(name);
      };
    }
    return () => { if (--consumers === 0) dispose(); };
  }, []);
}
