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

    // Pointer / touch drag (vertical page scroll stays native via touch-action: pan-y).
    // Pointer capture is only engaged after a real horizontal move — otherwise a
    // plain tap/click on a card link would be retargeted to the carousel root and
    // the browser would never open the project URL.
    this.pointerId = null;
    this.captured = false;
    this.root.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      if (e.target.closest('.carousel-nav')) return;
      this.pointerId = e.pointerId;
      this.startX = e.clientX;
      this.dragDX = 0;
      this.dragging = true;
    });

    this.root.addEventListener('pointermove', (e) => {
      if (!this.dragging || e.pointerId !== this.pointerId) return;
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
      if (dx > 60) { this.suppressClick = true; this.go(this.index - 1); }
      else if (dx < -60) { this.suppressClick = true; this.go(this.index + 1); }
      this.setDrag(0);
      this.dragDX = 0;
      window.setTimeout(() => { this.suppressClick = false; }, 250);
    };
    this.root.addEventListener('pointerup', endDrag);
    this.root.addEventListener('pointercancel', endDrag);

    this.track.addEventListener('click', (e) => {
      if (this.suppressClick) { e.preventDefault(); e.stopPropagation(); }
    }, true);

    subscribe(() => this.render());
  }

  setDrag(dx) {
    const active = this.cards[this.index];
    if (active) active.style.setProperty('--drag', `${dx}px`);
  }

  go(next) {
    const len = PROJECTS.length;
    this.index = (next + len) % len;
    this.update();
  }

  update() {
    const reduced = reducedMotion.matches;
    const mobile = this.root.clientWidth < 700;
    const maxAbs = mobile ? 2 : 3;
    this.cards.forEach((card, i) => {
      let offset = i - this.index;
      // normalize to shortest distance for smooth wrap
      const len = PROJECTS.length;
      if (offset > len / 2) offset -= len;
      if (offset < -len / 2) offset += len;

      const abs = Math.abs(offset);
      let opacity, z, scale, x, y, ry, rx, zIndex = 0;

      if (abs === 0) {
        opacity = 1; z = 0; scale = 1; x = '0%'; y = 0; ry = 0; rx = 0; zIndex = 30;
      } else if (abs === 1) {
        opacity = mobile ? 0.85 : 0.98;
        z = reduced ? -40 : mobile ? -90 : -170;
        scale = mobile ? 0.9 : 0.85;
        x = `${offset * (mobile ? 20 : 46)}%`;
        y = reduced ? -6 : mobile ? 10 : 26;
        ry = offset * -16; rx = mobile ? 2 : 5;
        zIndex = 20;
      } else if (abs === 2) {
        opacity = mobile ? 0 : 0.24;
        z = reduced ? -80 : -360;
        scale = 0.68;
        x = `${offset * 68}%`;
        y = reduced ? -12 : 56;
        ry = offset * -24; rx = 8;
        zIndex = 10;
      } else {
        opacity = 0;
        z = 0; scale = 0.5; x = `${offset * 80}%`; y = 80; ry = 0; rx = 0;
      }

      card.style.opacity = opacity;
      card.style.zIndex = zIndex;
      card.style.transform = `translate(-50%, -50%) translateX(calc(${x} + var(--drag, 0px))) translateY(${y}px) translateZ(${z}px) rotateX(${rx}deg) rotateY(${ry}deg) scale(${scale})`;

      const hidden = abs > maxAbs || opacity === 0;
      card.setAttribute('aria-hidden', hidden ? 'true' : 'false');
      card.classList.toggle('is-active', abs === 0);
      card.querySelectorAll('a').forEach((a) => { a.tabIndex = hidden ? -1 : 0; });
      card.style.pointerEvents = (hidden || abs !== 0 && mobile) ? 'none' : '';
    });

    this.counter.textContent = `${String(this.index + 1).padStart(2, '0')} / ${String(PROJECTS.length).padStart(2, '0')}`;
    this.root.setAttribute('aria-label', PROJECTS[this.index].title);
    if (this.liveRegion) this.liveRegion.textContent = PROJECTS[this.index].title;

    this.resize();
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