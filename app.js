(() => {
  'use strict';

  const scene = document.querySelector('.scene');
  const pages = [...document.querySelectorAll('.page')];
  const links = [...document.querySelectorAll('.page-nav a')];
  const status = document.querySelector('#page-status');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const count = pages.length;
  const modulo = (value) => ((value % count) + count) % count;
  const pageFromHash = () => {
    const match = /^#page-([1-4])$/.exec(window.location.hash);
    return match ? Number(match[1]) - 1 : 0;
  };

  let current = pageFromHash();
  let desired = current;
  let direction = 1;
  let running = false;
  let generation = 0;
  let animations = [];
  let restorePageFocus = false;
  let pointerStart = null;
  let lastWidth = scene.clientWidth;
  let lastHeight = scene.clientHeight;

  function updateNavigation() {
    links.forEach((link, index) => {
      if (index === desired) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    });
    status.textContent = current === desired
      ? `第 ${current + 1} 頁，共 ${count} 頁`
      : `正在切換至第 ${desired + 1} 頁`;
  }

  function settle(index) {
    current = index;
    scene.dataset.background = pages[current].id;
    pages.forEach((page, pageIndex) => {
      const active = pageIndex === current;
      page.hidden = !active;
      page.inert = !active;
      page.setAttribute('aria-hidden', String(!active));
    });
    if (restorePageFocus) {
      pages[current].querySelector('h2').focus({ preventScroll: true });
      restorePageFocus = false;
    }
    updateNavigation();
  }

  function arcFrames(incoming, sign, radiusX, radiusY) {
    const frames = [];
    for (let sample = 0; sample <= 40; sample += 1) {
      const t = sample / 40;
      const angle = t * Math.PI / 2;
      // Two quarter ellipses form the east -> zenith -> west solar arc.
      const x = incoming ? -sign * radiusX * Math.cos(angle) : sign * radiusX * Math.sin(angle);
      const y = incoming ? radiusY * (1 - Math.sin(angle)) : radiusY * (1 - Math.cos(angle));
      frames.push({
        offset: t,
        transform: `translate(calc(-50% + ${x.toFixed(3)}px), calc(-50% + ${y.toFixed(3)}px))`,
        opacity: incoming ? Math.min(1, t * 3) : Math.min(1, (1 - t) * 3),
      });
    }
    return frames;
  }

  async function animateToDesired() {
    if (running) return;
    running = true;
    const thisGeneration = generation;
    try {
      while (current !== desired && thisGeneration === generation) {
        const target = desired;
        restorePageFocus ||= pages.some((page) => page.contains(document.activeElement));
        if (reducedMotion.matches || typeof pages[current].animate !== 'function') {
          settle(target);
          continue;
        }
        const outgoing = pages[current];
        const incoming = pages[target];
        outgoing.inert = true;
        outgoing.setAttribute('aria-hidden', 'true');
        incoming.hidden = false;
        incoming.inert = true;
        incoming.setAttribute('aria-hidden', 'true');
        scene.dataset.background = incoming.id;
        const radiusX = (scene.clientWidth + incoming.offsetWidth) / 2 + 24;
        const radiusY = scene.clientHeight * .76;
        const timing = { duration: 1050, easing: 'cubic-bezier(.4, 0, .25, 1)', fill: 'both' };
        animations = [
          outgoing.animate(arcFrames(false, direction, radiusX, radiusY), timing),
          incoming.animate(arcFrames(true, direction, radiusX, radiusY), timing),
        ];
        await Promise.all(animations.map((animation) => animation.finished.catch(() => {})));
        if (thisGeneration !== generation) return;
        // Hide the outgoing background before clearing its final transform.
        settle(target);
        animations.forEach((animation) => animation.cancel());
        animations = [];
      }
    } finally {
      if (thisGeneration === generation) running = false;
    }
  }

  function requestPage(index, sign, writeHistory = true) {
    desired = modulo(index);
    direction = sign;
    if (writeHistory) {
      const hash = `#page-${desired + 1}`;
      if (window.location.hash !== hash) window.history.pushState(null, '', hash);
    }
    updateNavigation();
    void animateToDesired();
  }

  function step(sign) { requestPage(desired + sign, sign); }

  function goTo(index, writeHistory = true) {
    const forward = modulo(index - desired);
    requestPage(index, forward > count / 2 ? -1 : 1, writeHistory);
  }

  function finishImmediately() {
    generation += 1;
    animations.forEach((animation) => animation.cancel());
    animations = [];
    running = false;
    settle(desired);
  }

  document.querySelector('#previous').addEventListener('click', () => step(-1));
  document.querySelector('#next').addEventListener('click', () => step(1));
  links.forEach((link, index) => link.addEventListener('click', (event) => {
    if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || event.button !== 0) return;
    event.preventDefault();
    goTo(index);
  }));

  document.addEventListener('keydown', (event) => {
    if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey ||
        event.target.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="slider"]')) return;
    if (event.key === 'ArrowRight') { event.preventDefault(); step(1); }
    if (event.key === 'ArrowLeft') { event.preventDefault(); step(-1); }
  });

  scene.addEventListener('pointerdown', (event) => {
    if (!event.isPrimary || event.button !== 0 ||
        event.target.closest('a, button, input, textarea, select, [contenteditable="true"]')) return;
    pointerStart = { x: event.clientX, y: event.clientY, id: event.pointerId };
    scene.setPointerCapture(event.pointerId);
  });
  scene.addEventListener('pointerup', (event) => {
    if (!pointerStart || pointerStart.id !== event.pointerId) return;
    const dx = event.clientX - pointerStart.x;
    const dy = event.clientY - pointerStart.y;
    pointerStart = null;
    if (Math.abs(dx) >= 45 && Math.abs(dx) > Math.abs(dy) * 1.4) step(dx < 0 ? 1 : -1);
  });
  scene.addEventListener('pointercancel', () => { pointerStart = null; });
  scene.addEventListener('lostpointercapture', () => { pointerStart = null; });

  window.addEventListener('hashchange', () => goTo(pageFromHash(), false));
  reducedMotion.addEventListener('change', finishImmediately);
  new ResizeObserver(() => {
    const width = scene.clientWidth;
    const height = scene.clientHeight;
    if (width !== lastWidth || height !== lastHeight) {
      lastWidth = width;
      lastHeight = height;
      if (running) finishImmediately();
    }
  }).observe(scene);

  settle(current);
})();
