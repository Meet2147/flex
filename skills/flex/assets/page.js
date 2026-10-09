// Clips load and play only while on screen. With reduced motion (or blocked autoplay) they wait for a tap.
(() => {
  const clips = [...document.querySelectorAll('video[data-src]')];
  if (!clips.length) return;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const manual = (video) => video.closest('.screen, .phone')?.classList.add('manual');

  const start = (video) => {
    if (!video.src) video.src = video.dataset.src;
    return video.play();
  };

  for (const video of clips) {
    const button = video.parentElement.querySelector('.play');
    button?.addEventListener('click', (event) => {
      event.preventDefault();
      if (video.paused) start(video).catch(() => {});
      else video.pause();
    });
    video.addEventListener('play', () => button && (button.textContent = '❚❚', button.setAttribute('aria-label', 'Pause clip')));
    video.addEventListener('pause', () => button && (button.textContent = '▶', button.setAttribute('aria-label', 'Play clip')));
    if (reduced) manual(video);
  }
  if (reduced || !('IntersectionObserver' in window)) return clips.forEach(manual);

  const observer = new IntersectionObserver(
    (entries) => {
      for (const { target: video, isIntersecting } of entries) {
        if (isIntersecting) start(video).catch(() => manual(video));
        else video.pause();
      }
    },
    { threshold: 0.45 },
  );
  clips.forEach((video) => observer.observe(video));
})();
