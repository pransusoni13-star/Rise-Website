/* ================================================================
   RISE — Become 1% Better Every Day
   Production JavaScript
   Vanilla JS only. No dependencies. No frameworks.
   ================================================================ */

'use strict';

/* ================================================================
   0. UTILITIES
   ================================================================ */

/**
 * Returns true if the user has requested reduced motion at the OS level.
 * Used to skip/shorten decorative animation across the whole file.
 */
function prefersReducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Clamp a number between a min and max value.
 */
function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

/**
 * Lightweight debounce — delays invoking `fn` until `wait` ms have
 * elapsed since the last call. Used for expensive scroll/resize work.
 */
function debounce(fn, wait) {
  let timeoutId;
  return function debounced(...args) {
    window.clearTimeout(timeoutId);
    timeoutId = window.setTimeout(() => fn.apply(this, args), wait);
  };
}

/**
 * Lightweight throttle — ensures `fn` runs at most once every `limit` ms,
 * with a trailing call so the final scroll position is never missed.
 */
function throttle(fn, limit) {
  let inThrottle = false;
  let lastArgs = null;
  return function throttled(...args) {
    if (!inThrottle) {
      fn.apply(this, args);
      inThrottle = true;
      window.setTimeout(() => {
        inThrottle = false;
        if (lastArgs) {
          fn.apply(this, lastArgs);
          lastArgs = null;
        }
      }, limit);
    } else {
      lastArgs = args;
    }
  };
}

/* ================================================================
   1. LOADING SCREEN
   ================================================================ */
const LoadingScreen = (() => {
  const screenEl = document.getElementById('loading-screen');
  const barFillEl = document.getElementById('loading-bar-fill');
  const percentEl = document.getElementById('loading-percent');

  let progress = 0;
  let intervalId = null;

  function updateUI() {
    if (barFillEl) barFillEl.style.width = `${progress}%`;
    if (percentEl) percentEl.textContent = `${Math.round(progress)}%`;
  }

  function tick() {
    // Ease toward 90% quickly, then wait for window `load` to finish it off.
    const increment = progress < 60 ? Math.random() * 12 + 4 : Math.random() * 3 + 1;
    progress = clamp(progress + increment, 0, 90);
    updateUI();
  }

  function finish() {
    window.clearInterval(intervalId);
    progress = 100;
    updateUI();

    window.setTimeout(() => {
      if (screenEl) {
        screenEl.classList.add('is-hidden');
        // Prevent the loading screen from trapping focus / being tabbable once hidden.
        screenEl.setAttribute('aria-hidden', 'true');
      }
      document.body.classList.remove('is-loading');
      document.body.classList.add('is-loaded');
      // Kick off entrance-dependent modules only once the loader is gone.
      document.dispatchEvent(new CustomEvent('rise:loaded'));
    }, 400);
  }

  function init() {
    if (!screenEl) return;
    document.body.classList.add('is-loading');

    if (prefersReducedMotion()) {
      finish();
      return;
    }

    intervalId = window.setInterval(tick, 180);

    // Failsafe: never let the loader hang forever if `load` fires late.
    const failsafeId = window.setTimeout(finish, 4000);

    window.addEventListener(
      'load',
      () => {
        window.clearTimeout(failsafeId);
        finish();
      },
      { once: true }
    );
  }

  return { init };
})();

/* ================================================================
   2. NAVBAR — SCROLL TRANSITION, ACTIVE LINK, MOBILE MENU
   ================================================================ */
const Navbar = (() => {
  const navbarEl = document.getElementById('navbar');
  const mobileMenuBtn = document.getElementById('mobile-menu-btn');
  const mobileMenuEl = document.getElementById('mobile-menu');
  const mobileNavLinks = document.querySelectorAll('.mobile-nav-link');
  const navLinks = document.querySelectorAll('.nav-link[data-section]');
  const sections = [];

  let isMobileMenuOpen = false;

  function handleScroll() {
    if (!navbarEl) return;
    const scrolled = window.scrollY > 24;
    navbarEl.classList.toggle('is-scrolled', scrolled);
  }

  function openMobileMenu() {
    isMobileMenuOpen = true;
    mobileMenuEl.classList.add('is-open');
    mobileMenuBtn.classList.add('is-active');
    mobileMenuBtn.setAttribute('aria-expanded', 'true');
    mobileMenuBtn.setAttribute('aria-label', 'Close menu');
    mobileMenuEl.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
  }

  function closeMobileMenu() {
    isMobileMenuOpen = false;
    mobileMenuEl.classList.remove('is-open');
    mobileMenuBtn.classList.remove('is-active');
    mobileMenuBtn.setAttribute('aria-expanded', 'false');
    mobileMenuBtn.setAttribute('aria-label', 'Open menu');
    mobileMenuEl.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
  }

  function toggleMobileMenu() {
    if (isMobileMenuOpen) {
      closeMobileMenu();
    } else {
      openMobileMenu();
    }
  }

  /**
   * Tracks which section is currently in view and toggles the
   * `.is-active` class on the matching nav link.
   */
  function buildSectionMap() {
    navLinks.forEach((link) => {
      const id = link.getAttribute('data-section');
      const target = document.getElementById(id);
      if (target) {
        sections.push({ id, link, target });
      }
    });
  }

  function updateActiveLink() {
    if (sections.length === 0) return;

    const scrollPos = window.scrollY + window.innerHeight * 0.35;
    let currentId = null;

    sections.forEach(({ id, target }) => {
      const top = target.offsetTop;
      const bottom = top + target.offsetHeight;
      if (scrollPos >= top && scrollPos < bottom) {
        currentId = id;
      }
    });

    sections.forEach(({ id, link }) => {
      link.classList.toggle('is-active', id === currentId);
    });
  }

  function init() {
    if (!navbarEl) return;

    handleScroll();
    window.addEventListener('scroll', throttle(handleScroll, 80), { passive: true });

    buildSectionMap();
    updateActiveLink();
    window.addEventListener('scroll', throttle(updateActiveLink, 120), { passive: true });

    if (mobileMenuBtn && mobileMenuEl) {
      mobileMenuBtn.addEventListener('click', toggleMobileMenu);

      mobileNavLinks.forEach((link) => {
        link.addEventListener('click', closeMobileMenu);
      });

      // Close on Escape for keyboard users.
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && isMobileMenuOpen) {
          closeMobileMenu();
          mobileMenuBtn.focus();
        }
      });

      // Close if the viewport is resized back to desktop width.
      window.addEventListener(
        'resize',
        debounce(() => {
          if (window.innerWidth > 768 && isMobileMenuOpen) {
            closeMobileMenu();
          }
        }, 150)
      );
    }
  }

  return { init };
})();

/* ================================================================
   3. SMOOTH SCROLLING FOR ANCHOR LINKS
   ================================================================ */
const SmoothScroll = (() => {
  function handleClick(e) {
    const href = this.getAttribute('href');
    if (!href || href === '#' || href.length < 2) return;

    const target = document.querySelector(href);
    if (!target) return;

    e.preventDefault();

    const navbarHeight = document.getElementById('navbar')?.offsetHeight || 80;
    const targetPosition = target.getBoundingClientRect().top + window.scrollY - navbarHeight + 1;

    window.scrollTo({
      top: targetPosition,
      behavior: prefersReducedMotion() ? 'auto' : 'smooth',
    });

    // Move focus to the target for keyboard/screen-reader users, without
    // adding it permanently to the tab order.
    if (!target.hasAttribute('tabindex')) {
      target.setAttribute('tabindex', '-1');
    }
    target.focus({ preventScroll: true });
  }

  function init() {
    const links = document.querySelectorAll('a[href^="#"]');
    links.forEach((link) => link.addEventListener('click', handleClick));
  }

  return { init };
})();

/* ================================================================
   4. SCROLL REVEAL (Intersection Observer)
   ================================================================ */
const ScrollReveal = (() => {
  function init() {
    const revealEls = document.querySelectorAll('[data-reveal]');
    if (revealEls.length === 0) return;

    if (prefersReducedMotion() || !('IntersectionObserver' in window)) {
      revealEls.forEach((el) => el.classList.add('is-visible'));
      return;
    }

    const observer = new IntersectionObserver(
      (entries, obs) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible');
            obs.unobserve(entry.target);
          }
        });
      },
      {
        threshold: 0.15,
        rootMargin: '0px 0px -60px 0px',
      }
    );

    revealEls.forEach((el) => observer.observe(el));
  }

  return { init };
})();

/* ================================================================
   5. ANIMATED COUNTERS
   ================================================================ */
const Counters = (() => {
  function animateCounter(el) {
    const target = parseFloat(el.getAttribute('data-target'), 10);
    const suffix = el.getAttribute('data-suffix') || '';
    if (Number.isNaN(target)) return;

    const duration = 1800;
    const startTime = performance.now();

    function easeOutExpo(t) {
      return t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
    }

    function frame(now) {
      const elapsed = now - startTime;
      const progress = clamp(elapsed / duration, 0, 1);
      const eased = easeOutExpo(progress);
      const current = Math.round(target * eased);

      el.textContent = `${current.toLocaleString('en-US')}${suffix}`;

      if (progress < 1) {
        window.requestAnimationFrame(frame);
      } else {
        el.textContent = `${target.toLocaleString('en-US')}${suffix}`;
      }
    }

    window.requestAnimationFrame(frame);
  }

  function init() {
    const counterEls = document.querySelectorAll('.counter');
    if (counterEls.length === 0) return;

    if (prefersReducedMotion() || !('IntersectionObserver' in window)) {
      counterEls.forEach((el) => {
        const target = el.getAttribute('data-target');
        const suffix = el.getAttribute('data-suffix') || '';
        el.textContent = `${Number(target).toLocaleString('en-US')}${suffix}`;
      });
      return;
    }

    const observer = new IntersectionObserver(
      (entries, obs) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            animateCounter(entry.target);
            obs.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.5 }
    );

    counterEls.forEach((el) => observer.observe(el));
  }

  return { init };
})();

/* ================================================================
   6. TYPING EFFECT (hero headline)
   ================================================================ */
const TypingEffect = (() => {
  const words = ['Day', 'Habit', 'Choice', 'Rep', 'Rise'];
  const el = document.getElementById('typing-text');

  const TYPE_SPEED = 90;
  const DELETE_SPEED = 55;
  const PAUSE_AFTER_TYPE = 1600;
  const PAUSE_AFTER_DELETE = 300;

  let wordIndex = 0;
  let charIndex = 0;
  let isDeleting = false;
  let timeoutId = null;

  function tick() {
    const currentWord = words[wordIndex];

    if (!isDeleting) {
      charIndex += 1;
      el.textContent = currentWord.slice(0, charIndex);

      if (charIndex === currentWord.length) {
        isDeleting = true;
        timeoutId = window.setTimeout(tick, PAUSE_AFTER_TYPE);
        return;
      }
      timeoutId = window.setTimeout(tick, TYPE_SPEED);
    } else {
      charIndex -= 1;
      el.textContent = currentWord.slice(0, charIndex);

      if (charIndex === 0) {
        isDeleting = false;
        wordIndex = (wordIndex + 1) % words.length;
        timeoutId = window.setTimeout(tick, PAUSE_AFTER_DELETE);
        return;
      }
      timeoutId = window.setTimeout(tick, DELETE_SPEED);
    }
  }

  function init() {
    if (!el) return;

    if (prefersReducedMotion()) {
      el.textContent = words[0];
      return;
    }

    el.textContent = '';
    timeoutId = window.setTimeout(tick, 500);
  }

  function destroy() {
    if (timeoutId) window.clearTimeout(timeoutId);
  }

  return { init, destroy };
})();

/* ================================================================
   7. MOUSE PARALLAX (hero floating shapes + cursor glow)
   ================================================================ */
const MouseParallax = (() => {
  const glowEl = document.getElementById('cursor-glow');
  const parallaxEls = document.querySelectorAll('[data-parallax]');
  let rafId = null;
  let pointerX = window.innerWidth / 2;
  let pointerY = window.innerHeight / 2;

  function handlePointerMove(e) {
    pointerX = e.clientX;
    pointerY = e.clientY;

    if (glowEl) glowEl.classList.add('is-active');

    if (!rafId) {
      rafId = window.requestAnimationFrame(render);
    }
  }

  function handlePointerLeave() {
    if (glowEl) glowEl.classList.remove('is-active');
  }

  function render() {
    rafId = null;

    if (glowEl) {
      glowEl.style.transform = `translate(${pointerX}px, ${pointerY}px) translate(-50%, -50%)`;
    }

    const centerX = window.innerWidth / 2;
    const centerY = window.innerHeight / 2;
    const offsetX = pointerX - centerX;
    const offsetY = pointerY - centerY;

    parallaxEls.forEach((el) => {
      const depth = parseFloat(el.getAttribute('data-parallax')) || 0.03;
      const moveX = offsetX * depth;
      const moveY = offsetY * depth;
      el.style.transform = `translate(${moveX}px, ${moveY}px)`;
    });
  }

  function init() {
    if (prefersReducedMotion()) return;
    if (!window.matchMedia('(hover: hover)').matches) return; // skip on touch devices

    window.addEventListener('pointermove', handlePointerMove, { passive: true });
    window.addEventListener('pointerleave', handlePointerLeave, { passive: true });
  }

  return { init };
})();

/* ================================================================
   8. FAQ ACCORDION
   ================================================================ */
const FaqAccordion = (() => {
  function toggleItem(item, button, allItems) {
    const isOpen = item.classList.contains('is-open');

    // Close any other open item (single-open accordion behaviour).
    allItems.forEach((other) => {
      if (other !== item && other.classList.contains('is-open')) {
        other.classList.remove('is-open');
        other.querySelector('.faq-question')?.setAttribute('aria-expanded', 'false');
      }
    });

    item.classList.toggle('is-open', !isOpen);
    button.setAttribute('aria-expanded', String(!isOpen));
  }

  function init() {
    const items = document.querySelectorAll('.faq-item');
    if (items.length === 0) return;

    items.forEach((item) => {
      const button = item.querySelector('.faq-question');
      if (!button) return;

      button.addEventListener('click', () => toggleItem(item, button, items));
    });
  }

  return { init };
})();

/* ================================================================
   9. HOW-IT-WORKS PROGRESS LINE
   ================================================================ */
const StepsProgressLine = (() => {
  function init() {
    const track = document.querySelector('.steps-track');
    const fillEl = document.getElementById('steps-line-fill');
    if (!track || !fillEl) return;

    if (prefersReducedMotion() || !('IntersectionObserver' in window)) {
      fillEl.style.width = '100%';
      return;
    }

    const observer = new IntersectionObserver(
      (entries, obs) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            fillEl.style.width = '100%';
            obs.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.3 }
    );

    observer.observe(track);
  }

  return { init };
})();

/* ================================================================
   10. WAITLIST FORM VALIDATION + SUBMISSION
   ================================================================ */
const WaitlistForm = (() => {
  const formEl = document.getElementById('waitlist-form');
  const nameInput = document.getElementById('waitlist-name');
  const emailInput = document.getElementById('waitlist-email');
  const nameError = document.getElementById('name-error');
  const emailError = document.getElementById('email-error');
  const submitBtn = document.getElementById('waitlist-submit');
  const successEl = document.getElementById('waitlist-success');
  const noteEl = document.querySelector('.waitlist-note');

  const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  function setFieldError(input, errorEl, message) {
    input.classList.toggle('is-invalid', Boolean(message));
    input.setAttribute('aria-invalid', message ? 'true' : 'false');
    if (errorEl) errorEl.textContent = message || '';
  }

  function validateName() {
    const value = nameInput.value.trim();
    if (value.length === 0) {
      setFieldError(nameInput, nameError, 'Please enter your name.');
      return false;
    }
    if (value.length < 2) {
      setFieldError(nameInput, nameError, 'That name looks a little short.');
      return false;
    }
    setFieldError(nameInput, nameError, '');
    return true;
  }

  function validateEmail() {
    const value = emailInput.value.trim();
    if (value.length === 0) {
      setFieldError(emailInput, emailError, 'Please enter your email.');
      return false;
    }
    if (!EMAIL_REGEX.test(value)) {
      setFieldError(emailInput, emailError, 'Please enter a valid email address.');
      return false;
    }
    setFieldError(emailInput, emailError, '');
    return true;
  }

  function setLoading(isLoading) {
    if (!submitBtn) return;
    submitBtn.classList.toggle('is-loading', isLoading);
    submitBtn.disabled = isLoading;
  }

  function showSuccess() {
    if (formEl) formEl.classList.add('is-hidden');
    if (noteEl) noteEl.classList.add('is-hidden');
    if (successEl) successEl.classList.add('is-visible');
    Toast.show('Welcome to RISE — you\u2019re officially on the list.');
  }

  /**
   * Simulates a network submission. Swap this out for a real fetch()
   * call to your backend / ESP (e.g. Mailchimp, ConvertKit, Supabase).
   */
  function submitToServer(payload) {
    return new Promise((resolve) => {
      window.setTimeout(() => {
        resolve({ ok: true, waitlistNumber: 2848, ...payload });
      }, 1200);
    });
  }

  async function handleSubmit(e) {
    e.preventDefault();

    const isNameValid = validateName();
    const isEmailValid = validateEmail();

    if (!isNameValid || !isEmailValid) {
      const firstInvalid = !isNameValid ? nameInput : emailInput;
      firstInvalid.focus();
      Toast.show('Please fix the highlighted fields.', true);
      return;
    }

    setLoading(true);

    try {
      await submitToServer({
        name: nameInput.value.trim(),
        email: emailInput.value.trim(),
      });
      showSuccess();
    } catch (err) {
      Toast.show('Something went wrong. Please try again.', true);
    } finally {
      setLoading(false);
    }
  }

  function init() {
    if (!formEl) return;

    formEl.addEventListener('submit', handleSubmit);

    nameInput.addEventListener('blur', validateName);
    emailInput.addEventListener('blur', validateEmail);

    // Clear the error state as soon as the person starts fixing it.
    nameInput.addEventListener('input', () => {
      if (nameInput.classList.contains('is-invalid')) validateName();
    });
    emailInput.addEventListener('input', () => {
      if (emailInput.classList.contains('is-invalid')) validateEmail();
    });
  }

  return { init };
})();

/* ================================================================
   11. TOAST NOTIFICATIONS
   ================================================================ */
const Toast = (() => {
  const toastEl = document.getElementById('toast');
  let hideTimeoutId = null;

  function show(message, isError = false) {
    if (!toastEl) return;

    toastEl.textContent = message;
    toastEl.classList.toggle('is-error', isError);
    toastEl.classList.add('is-visible');

    window.clearTimeout(hideTimeoutId);
    hideTimeoutId = window.setTimeout(() => {
      toastEl.classList.remove('is-visible');
    }, 3600);
  }

  return { show };
})();

/* ================================================================
   12. BACK TO TOP BUTTON
   ================================================================ */
const BackToTop = (() => {
  const btnEl = document.getElementById('back-to-top');

  function handleScroll() {
    if (!btnEl) return;
    btnEl.classList.toggle('is-visible', window.scrollY > 640);
  }

  function scrollToTop() {
    window.scrollTo({
      top: 0,
      behavior: prefersReducedMotion() ? 'auto' : 'smooth',
    });
  }

  function init() {
    if (!btnEl) return;

    handleScroll();
    window.addEventListener('scroll', throttle(handleScroll, 100), { passive: true });
    btnEl.addEventListener('click', scrollToTop);
  }

  return { init };
})();

/* ================================================================
   13. TRUSTED-BY MARQUEE — PAUSE ON HOVER / FOCUS
   ================================================================ */
const Marquee = (() => {
  function init() {
    const track = document.querySelector('.marquee-track');
    const wrapper = document.querySelector('.trusted-marquee');
    if (!track || !wrapper) return;

    wrapper.addEventListener('mouseenter', () => {
      track.style.animationPlayState = 'paused';
    });
    wrapper.addEventListener('mouseleave', () => {
      track.style.animationPlayState = 'running';
    });
  }

  return { init };
})();

/* ================================================================
   14. DYNAMIC FOOTER YEAR
   ================================================================ */
const FooterYear = (() => {
  function init() {
    const yearEl = document.getElementById('current-year');
    if (yearEl) {
      yearEl.textContent = new Date().getFullYear().toString();
    }
  }

  return { init };
})();

/* ================================================================
   15. LAZY LOADING SAFETY NET
   ================================================================ */
const LazyLoadFallback = (() => {
  /**
   * Modern browsers already honor the `loading="lazy"` attribute set in
   * the HTML. This module is a safety net for the rare browser that
   * doesn't support native lazy loading — it swaps `data-src` if present
   * and otherwise does nothing, since the native attribute already covers
   * every image on this page.
   */
  function init() {
    if ('loading' in HTMLImageElement.prototype) return;

    const lazyImages = document.querySelectorAll('img[loading="lazy"]');
    if (lazyImages.length === 0 || !('IntersectionObserver' in window)) return;

    const observer = new IntersectionObserver((entries, obs) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          const img = entry.target;
          const dataSrc = img.getAttribute('data-src');
          if (dataSrc) img.src = dataSrc;
          obs.unobserve(img);
        }
      });
    });

    lazyImages.forEach((img) => observer.observe(img));
  }

  return { init };
})();

/* ================================================================
   16. KEYBOARD NAVIGATION POLISH
   ================================================================ */
const KeyboardPolish = (() => {
  /**
   * Adds a `.user-is-tabbing` class to <body> only when the person is
   * navigating via keyboard, so mouse users don't see focus rings from
   * incidental clicks. Complements the CSS `:focus-visible` selector.
   */
  function init() {
    function handleFirstTab(e) {
      if (e.key === 'Tab') {
        document.body.classList.add('user-is-tabbing');
        window.removeEventListener('keydown', handleFirstTab);
      }
    }
    window.addEventListener('keydown', handleFirstTab);
  }

  return { init };
})();

/* ================================================================
   INIT — RUN EVERYTHING ONCE THE DOM IS READY
   ================================================================ */
document.addEventListener('DOMContentLoaded', () => {
  LoadingScreen.init();
  Navbar.init();
  SmoothScroll.init();
  ScrollReveal.init();
  Counters.init();
  TypingEffect.init();
  MouseParallax.init();
  FaqAccordion.init();
  StepsProgressLine.init();
  WaitlistForm.init();
  BackToTop.init();
  Marquee.init();
  FooterYear.init();
  LazyLoadFallback.init();
  KeyboardPolish.init();
});