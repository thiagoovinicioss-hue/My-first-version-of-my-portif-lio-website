import { PROJECTS } from './projects.js';
import { t, getLang, subscribe } from './i18n/index.js';

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

export class Carousel {
  constructor(root) {
    this.root = root;
    this.track = root.querySelector('#carouselTrack');
    this.prevBtn = root.querySelector('#carouselPrev');
    this.nextBtn = root.querySelector('#carouselNext');
    this.counter = root.querySelector('#carouselCounter');

    this.index = 0;
    this.cards = [];
    this.dragging = false;
    this.startX = 0;
    this.dragDX = 0;
    this.suppressClick = false;
    this.lastX = 0;
    this.lastT = 0;
    this.velocity = 0;

    this.render();
    this.bind();

    this.onResizeDebounced = this._debounce(() => this.update(), 120);
    window.addEventListener('resize', this.onResizeDebounced);
  }

  _debounce(fn, wait) {
    let timer;
    return (...args) => { window.clearTimeout(timer); timer = window.setTimeout(() => fn(...args), wait); };
  }

  render() {
    this.track.innerHTML = '';
    this.cards = PROJECTS.map((project, i) => {
      const lang = getLang();
      const desc = project.description[lang] || project.description.pt;
      const cat = project.category[lang] || project.category.pt;

      const article = document.createElement('article');
      article.className = 'carousel-card';
      article.setAttribute('aria-label', project.title);

      article.innerHTML = `
        <a class="card-preview" href="${project.url}" target="_blank" rel="noopener" tabindex="-1">
          <img src="${project.preview}" alt="" width="720" height="420" loading="lazy" decoding="async">
          <span class="card-preview-shade" aria-hidden="true"></span>
        </a>
        <div class="card-body">
          <span class="card-category">${cat}</span>
          <h3 class="card-title">${project.title}</h3>
          <p class="card-desc">${desc}</p>
          <a class="card-link" href="${project.url}" target="_blank" rel="noopener">
            <span>${t('carousel.view')}</span>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M7 17 17 7m0 0H8m9 0v9"/></svg>
          </a>
        </div>
      `;
      this.track.appendChild(article);
      return article;
    });

    this.liveRegion = document.createElement('p');
    this.liveRegion.className = 'sr-only';
    this.liveRegion.setAttribute('aria-live', 'polite');
    this.track.appendChild(this.liveRegion);

    this.update();
  }

  bind() {
    this.prevBtn.addEventListener('click', () => this.go(this.index - 1));
    this.nextBtn.addEventListener('click', () => this.go(this.index + 1));

    this.root.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowLeft') { e.preventDefault(); this.go(this.index - 1); }
      if (e.key === 'ArrowRight') { e.preventDefault(); this.go(this.index + 1); }
      if (e.key === 'Home') { e.preventDefault(); this.go(0); }
      if (e.key === 'End') { e.preventDefault(); this.go(PROJECTS.length - 1); }
    });

    // Pointer / touch drag with velocity tracking for inertia-based snapping.
    this.pointerId = null;
    this.captured = false;
    this.root.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      if (e.target.closest('.carousel-nav')) return;
      if (this.rafId) { cancelAnimationFrame(this.rafId); this.rafId = null; }
      this.pointerId = e.pointerId;
      this.startX = e.clientX;
      this.lastX = e.clientX;
      this.dragDX = 0;
      this.velocity = 0;
      this.dragging = true;
      this.root.classList.add('is-dragging');
    });

    this.root.addEventListener('pointermove', (e) => {
      if (!this.dragging || e.pointerId !== this.pointerId) return;
      const now = performance.now();
      const dx = e.clientX - this.lastX;
      const dt = now - this.lastT;
      if (dt > 0) this.velocity = 0.7 * this.velocity + 0.3 * (dx / dt);
      this.lastX = e.clientX;
      this.lastT = now;
      this.dragDX = e.clientX - this.startX;
      if (!this.captured && Math.abs(this.dragDX) > 6) {
        this.captured = true;
        try { this.root.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
      }
      this.setDrag(this.dragDX);
    });

    const endDrag = (e) => {
      if (!this.dragging || (e.pointerId !== undefined && e.pointerId !== this.pointerId)) return;
      if (this.captured) {
        try { this.root.releasePointerCapture(this.pointerId); } catch (_) { /* ignore */ }
      }
      this.dragging = false;
      this.captured = false;
      this.pointerId = null;
      this.root.classList.remove('is-dragging');

      const dx = this.dragDX;
      const absV = Math.abs(this.velocity);
      let next = this.index;
      if (dx > 60 || this.velocity > 0.5) next = this.index - 1;
      else if (dx < -60 || this.velocity < -0.5) next = this.index + 1;

      if (next !== this.index) { this.suppressClick = true; this.go(next); }
      else { this.setDrag(0); }

      this.velocity = 0;
      this.dragDX = 0;
      window.setTimeout(() => { this.suppressClick = false; }, 250);
    };
    this.root.addEventListener('pointerup', endDrag);
    this.root.addEventListener('pointercancel', endDrag);

    this.track.addEventListener('click', (e) => {
      if (this.suppressClick) { e.preventDefault(); e.stopPropagation(); }
    }, true);

    // Clicking an adjacent (visible) card moves it to the center.
    this.root.addEventListener('click', (e) => {
      if (this.suppressClick) return;
      const card = e.target.closest('.carousel-card');
      if (!card || card.classList.contains('is-active')) return;
      const idx = this.cards.indexOf(card);
      if (idx === -1) return;
      e.preventDefault();
      if (e.target.closest('a')) return;
      this.go(idx);
    });

    subscribe(() => { if (!this.root.hidden) this.render(); });
  }

  setDrag(dx) {
    const active = this.cards[this.index];
    if (active) active.style.setProperty('--drag', `${dx}px`);
  }

  go(next) {
    const len = PROJECTS.length;
    this.index = (next + len) % len;
    this.update();
    this.root.setAttribute('aria-label', `${t('carousel.region')}: ${PROJECTS[this.index].title} (${this.index + 1} / ${len})`);
  }

  update() {
    const reduced = reducedMotion.matches;
    const mobile = this.root.clientWidth < 700;
    const len = PROJECTS.length;
    this.cards.forEach((card, i) => {
      let d = i - this.index;
      if (d > len / 2) d -= len;
      if (d < -len / 2) d += len;
      const dir = Math.sign(d);
      const abs = Math.abs(d);

      let x, z, ry, rx, opacity, zIndex, scale, y = 0;

      if (reduced) {
        // Reduced motion: keep the carousel usable and flat — no depth/rotation.
        const X = [0, 62, 125, 188];
        const OP = [1, 0.55, 0.28, 0.12];
        scale = 1; z = 0; ry = 0; rx = 0; y = 6;
        x = `${dir * X[abs]}%`;
        opacity = abs <= 3 ? OP[abs] : 0;
        zIndex = 30 - abs * 10;
      } else if (mobile) {
        // Mobile: center forward, one near card on each side, no farther cards.
        if (abs === 0) { x = '0%'; z = 140; ry = 0; rx = 0; opacity = 1; zIndex = 30; scale = 1; y = 0; }
        else if (abs === 1) { x = `${dir * 58}%`; z = -80; ry = dir * -30; rx = 4; opacity = 0.9; zIndex = 20; scale = 0.88; y = 16; }
        else { opacity = 0; scale = 1; x = `${dir * 90}%`; z = -220; ry = 0; rx = 4; zIndex = 10; y = 40; }
      } else {
        // Desktop: a curved gallery receding into depth.
        const X = [0, 70, 134, 194];   // translateX as % of card width, signed
        const Z = [260, 0, -320, -640]; // translateZ (px) — center is pulled toward the camera
        const RY = [0, 32, 54, 64];     // |rotateY| (deg); sides turn toward the center
        const RX = [0, 7, 10, 12];
        const OP = [1, 0.95, 0.62, 0.32];
        const ZI = [30, 20, 10, 5];
        if (abs <= 3) {
          x = `${dir * X[abs]}%`;
          z = Z[abs];
          ry = dir * -RY[abs];
          rx = RX[abs];
          opacity = OP[abs];
          zIndex = ZI[abs];
          scale = 1;
          y = abs * 14;
        } else { opacity = 0; scale = 1; x = `${dir * 220}%`; z = -900; ry = 0; rx = 10; zIndex = 1; y = 90; }
      }

      card.style.opacity = opacity;
      card.style.zIndex = zIndex;
      card.style.transform =
        `translate(-50%, -50%) translateX(calc(${x} + var(--drag, 0px))) translateY(${y}px) translateZ(${z}px) rotateX(${rx}deg) rotateY(${ry}deg)`;

      const hidden = abs > this.maxAbs() || opacity === 0;
      card.setAttribute('aria-hidden', hidden ? 'true' : 'false');
      card.classList.toggle('is-active', abs === 0);
      card.querySelectorAll('a').forEach((a) => { a.tabIndex = hidden ? -1 : 0; });
      card.style.pointerEvents = (hidden || (abs !== 0 && mobile)) ? 'none' : '';
    });

    this.counter.textContent = `${String(this.index + 1).padStart(2, '0')} / ${String(len).padStart(2, '0')}`;
    this.root.setAttribute('aria-label', PROJECTS[this.index].title);
    if (this.liveRegion) this.liveRegion.textContent = PROJECTS[this.index].title;

    this.resize();
  }

  maxAbs() {
    return reducedMotion.matches ? 3 : (this.root.clientWidth < 700 ? 1 : 3);
  }

  resize = () => {
    const active = this.cards[this.index];
    if (!active) return;
    const height = active.getBoundingClientRect().height;
    this.root.style.minHeight = `${Math.round(height + 110)}px`;
  };
}

export function initCarousel() {
  const el = document.querySelector('#carousel');
  if (!el) return null;
  return new Carousel(el);
}
