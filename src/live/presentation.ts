/** Follow the space available to the native modal, including the iOS keyboard. */
export function followVoiceViewport(host: HTMLElement, onWidth: (width: number) => void): () => void {
  const win = host.ownerDocument.defaultView;
  if (!win) return () => {};
  const visual = win.visualViewport;
  let frame = 0;
  const measure = () => {
    frame = 0;
    const rect = host.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const left = Math.max(rect.left, visual?.offsetLeft ?? 0);
    const top = Math.max(rect.top, visual?.offsetTop ?? 0);
    const width = Math.min(rect.right, (visual?.offsetLeft ?? 0) + (visual?.width ?? win.innerWidth)) - left;
    const height = Math.min(rect.bottom, (visual?.offsetTop ?? 0) + (visual?.height ?? win.innerHeight)) - top;
    if (width <= 0 || height <= 0) return;
    host.style.setProperty('--fjgduo-voice-left', `${left - rect.left}px`);
    host.style.setProperty('--fjgduo-voice-top', `${top - rect.top}px`);
    host.style.setProperty('--fjgduo-voice-width', `${width}px`);
    host.style.setProperty('--fjgduo-voice-height', `${height}px`);
    host.classList.toggle('fjgduo-vault-live-keyboard', rect.height - height > 80);
    onWidth(width);
  };
  const schedule = () => { if (!frame) frame = win.requestAnimationFrame(measure); };
  const observer = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(schedule);
  observer?.observe(host);
  win.addEventListener('resize', schedule);
  visual?.addEventListener('resize', schedule);
  visual?.addEventListener('scroll', schedule);
  measure();
  return () => {
    if (frame) win.cancelAnimationFrame(frame);
    observer?.disconnect();
    win.removeEventListener('resize', schedule);
    visual?.removeEventListener('resize', schedule);
    visual?.removeEventListener('scroll', schedule);
  };
}
