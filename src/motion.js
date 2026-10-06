// Original dependency-free adaptation of the Magic UI Blur Fade interaction.
// Core content stays visible if scripting, observers, or animation are unavailable.
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const tiles = [...document.querySelectorAll('.space-tile')];

if (!reducedMotion.matches && 'IntersectionObserver' in window) {
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        // Unobserve first: scrolling back, fast scrolls and repeated visits never loop.
        observer.unobserve(entry.target);
        if (!reducedMotion.matches) entry.target.classList.add('is-revealing');
      }
    },
    { threshold: 0.12 },
  );
  for (const tile of tiles) {
    observer.observe(tile);
    tile.addEventListener('animationend', () => tile.classList.remove('is-revealing'), {
      once: true,
    });
  }
  reducedMotion.addEventListener('change', (event) => {
    if (!event.matches) return;
    observer.disconnect();
    for (const tile of tiles) tile.classList.remove('is-revealing');
  });
}

// Browser-native lazy loading can fetch distant cards early. Materialize originals
// only near the viewport; noscript carries the same authentic images without JS.
function revealWorkPhoto(card) {
  const template = card.querySelector('.work-image-template');
  if (template) template.replaceWith(template.content.cloneNode(true));
}
document.documentElement.classList.add('work-photos-enabled');
const photoCards = document.querySelectorAll('.work-photo');
if ('IntersectionObserver' in window) {
  const photoObserver = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        revealWorkPhoto(entry.target);
        photoObserver.unobserve(entry.target);
      }
    },
    { rootMargin: '200px' },
  );
  photoCards.forEach((card) => photoObserver.observe(card));
} else photoCards.forEach(revealWorkPhoto);

const tools = document.querySelector('.gallery-tools');
// Authentic source cards stay readable and linked while the optional canvas is active.
if (tools?.dataset.contentStatus === 'ready') {
  const toggle = document.querySelector('.gallery-toggle');
  const status = document.querySelector('.gallery-status');
  const interactive = document.querySelector('#interactive-gallery');
  const grid = document.querySelector('.work-grid');
  const surface = document.querySelector('.art-gallery');
  const descriptions = document.querySelector('#gallery-photo-descriptions');
  const items = [...grid.querySelectorAll('[data-gallery-item]')];
  for (const source of items) {
    const item = document.createElement('li');
    item.textContent =
      (
        source.querySelector('img') ||
        source.querySelector('template')?.content.querySelector('img')
      )?.alt || source.textContent.trim();
    descriptions.append(item);
  }
  let gallery;
  let generation = 0;

  function closeGallery(message = '') {
    generation += 1;
    const focusInside = interactive.contains(document.activeElement);
    gallery?.dispose();
    gallery = null;
    interactive.hidden = true;
    grid.hidden = false;
    toggle.disabled = false;
    toggle.textContent = 'Explorar galería';
    toggle.setAttribute('aria-expanded', 'false');
    status.textContent = message;
    if (focusInside) toggle.focus({ preventScroll: true });
  }

  if (!reducedMotion.matches) tools.hidden = false;
  toggle.addEventListener('click', async () => {
    if (gallery) {
      closeGallery();
      return;
    }
    const current = ++generation;
    toggle.disabled = true;
    status.textContent = 'Preparando la galería…';
    try {
      photoCards.forEach(revealWorkPhoto);
      const { mountArtGallery } = await import('./art-gallery.js');
      if (current !== generation || reducedMotion.matches) return;
      const mounted = await mountArtGallery(surface, items, () => {
        closeGallery(
          'La galería interactiva no está disponible. Podés ver las fotos y reseñas debajo.',
        );
      });
      if (current !== generation || reducedMotion.matches) {
        mounted.dispose();
        return;
      }
      gallery = mounted;
      // The authoritative source cards remain accessible below the canvas.
      interactive.hidden = false;
      toggle.textContent = 'Cerrar exploración';
      toggle.setAttribute('aria-expanded', 'true');
      status.textContent = '';
      surface.focus({ preventScroll: true });
    } catch {
      if (current === generation)
        closeGallery(
          'La galería interactiva no está disponible. Podés ver las fotos y reseñas debajo.',
        );
    } finally {
      if (current === generation) toggle.disabled = false;
    }
  });
  for (const button of document.querySelectorAll('[data-pan]')) {
    button.addEventListener('click', () =>
      gallery?.pan(...button.dataset.pan.split(',').map(Number)),
    );
  }
  document.querySelector('[data-reset]').addEventListener('click', () => gallery?.reset());
  reducedMotion.addEventListener('change', () => {
    if (reducedMotion.matches) {
      const focusInControls =
        tools.contains(document.activeElement) || interactive.contains(document.activeElement);
      closeGallery('Movimiento reducido: se muestra la cuadrícula.');
      if (focusInControls) document.querySelector('#work-heading').focus({ preventScroll: true });
    }
    tools.hidden = reducedMotion.matches;
  });
}
// Native adaptation of Devigner UI's Magnetic Button interaction.
// Devigner ships React + GSAP; this static site keeps the same pointer-field,
// label-parallax and reduced-motion behavior without adding a framework.
const magneticPointer = window.matchMedia('(hover: hover) and (pointer: fine)');

function mountMagneticButton(field) {
  const pill = field.querySelector('.magnetic-pill');
  const label = field.querySelector('.magnetic-label');
  if (!pill || !label) return;

  const strength = Number(field.dataset.strength || 3) / 20;
  const labelStrength = Number(field.dataset.labelStrength || 4) / 20;
  const fieldSize = Math.max(0, Number(field.dataset.field || 32));
  const tilt = Math.max(0, Number(field.dataset.tilt || 10));
  field.style.setProperty('--magnetic-field', `${fieldSize}px`);

  let pillX = 0;
  let pillY = 0;
  let labelX = 0;
  let labelY = 0;
  let rotateX = 0;
  let rotateY = 0;
  let targetPillX = 0;
  let targetPillY = 0;
  let targetLabelX = 0;
  let targetLabelY = 0;
  let targetRotateX = 0;
  let targetRotateY = 0;
  let frame = 0;

  const render = () => {
    frame = 0;
    const ease = 0.2;
    pillX += (targetPillX - pillX) * ease;
    pillY += (targetPillY - pillY) * ease;
    labelX += (targetLabelX - labelX) * ease;
    labelY += (targetLabelY - labelY) * ease;
    rotateX += (targetRotateX - rotateX) * ease;
    rotateY += (targetRotateY - rotateY) * ease;
    pill.style.transform = `translate3d(${pillX.toFixed(2)}px, ${pillY.toFixed(2)}px, 0)`;
    label.style.transform =
      `translate3d(${labelX.toFixed(2)}px, ${labelY.toFixed(2)}px, 0) ` +
      `perspective(800px) rotateX(${rotateX.toFixed(2)}deg) rotateY(${rotateY.toFixed(2)}deg)`;

    const moving =
      Math.abs(targetPillX - pillX) +
        Math.abs(targetPillY - pillY) +
        Math.abs(targetLabelX - labelX) +
        Math.abs(targetLabelY - labelY) +
        Math.abs(targetRotateX - rotateX) +
        Math.abs(targetRotateY - rotateY) >
      0.08;
    if (moving) frame = requestAnimationFrame(render);
  };

  const requestRender = () => {
    if (!frame) frame = requestAnimationFrame(render);
  };

  const reset = () => {
    targetPillX = 0;
    targetPillY = 0;
    targetLabelX = 0;
    targetLabelY = 0;
    targetRotateX = 0;
    targetRotateY = 0;
    requestRender();
  };

  const onMove = (event) => {
    if (reducedMotion.matches || !magneticPointer.matches) {
      reset();
      return;
    }
    const root = field.getBoundingClientRect();
    const x = event.clientX - (root.left + root.width / 2);
    const y = event.clientY - (root.top + root.height / 2);
    targetPillX = x * strength;
    targetPillY = y * strength;
    targetLabelX = x * labelStrength;
    targetLabelY = y * labelStrength;

    const pillRect = pill.getBoundingClientRect();
    const nx = (event.clientX - (pillRect.left + pillRect.width / 2)) / Math.max(1, pillRect.width / 2);
    const ny = (event.clientY - (pillRect.top + pillRect.height / 2)) / Math.max(1, pillRect.height / 2);
    targetRotateX = Math.max(-1, Math.min(1, -ny)) * tilt;
    targetRotateY = Math.max(-1, Math.min(1, nx)) * tilt;
    requestRender();
  };

  field.addEventListener('pointermove', onMove, { passive: true });
  field.addEventListener('pointerleave', reset);
  magneticPointer.addEventListener('change', reset);
  reducedMotion.addEventListener('change', reset);
}

document.querySelectorAll('[data-magnetic]').forEach(mountMagneticButton);

// Load the configured agenda on demand.
let bookingModule;
document.querySelector('[data-booking-open]')?.addEventListener('click', async (event) => {
  event.preventDefault();
  const trigger = event.currentTarget;
  try {
    bookingModule ||= import('./booking-live.js');
    const { openBooking } = await bookingModule;
    openBooking(trigger);
  } catch {
    bookingModule = null;
    document.querySelector('#booking-load-status').textContent =
      'No se pudo cargar la agenda. Recargá para intentar de nuevo o consultá en contacto.';
  }
});
