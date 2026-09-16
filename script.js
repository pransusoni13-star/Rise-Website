/* ================================================================
   RISE — Become 1% Better Every Day
   Production JavaScript
   Vanilla JS only. No dependencies. No frameworks.
   ================================================================ */

'use strict';

/* ================================================================
   0. UTILITIES
   ================================================================ */

function prefersReducedMotion() {
  return window.matchMedia(
    '(prefers-reduced-motion: reduce)'
  ).matches;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function debounce(fn, wait) {
  let timeoutId = null;

  return function debounced(...args) {
    window.clearTimeout(timeoutId);

    timeoutId = window.setTimeout(() => {
      fn.apply(this, args);
    }, wait);
  };
}

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
  const screenEl =
    document.getElementById('loading-screen');

  const barFillEl =
    document.getElementById('loading-bar-fill');

  const percentEl =
    document.getElementById('loading-percent');

  let progress = 0;
  let intervalId = null;
  let finished = false;

  function updateUI() {
    if (barFillEl) {
      barFillEl.style.width = `${progress}%`;
    }

    if (percentEl) {
      percentEl.textContent =
        `${Math.round(progress)}%`;
    }
  }

  function tick() {
    const increment =
      progress < 60
        ? Math.random() * 12 + 4
        : Math.random() * 3 + 1;

    progress = clamp(
      progress + increment,
      0,
      90
    );

    updateUI();
  }

  function finish() {
    if (finished) {
      return;
    }

    finished = true;

    if (intervalId !== null) {
      window.clearInterval(intervalId);
      intervalId = null;
    }

    progress = 100;
    updateUI();

    window.setTimeout(() => {
      if (screenEl) {
        screenEl.classList.add('is-hidden');
        screenEl.setAttribute(
          'aria-hidden',
          'true'
        );
      }

      document.body.classList.remove(
        'is-loading'
      );

      document.body.classList.add(
        'is-loaded'
      );

      document.dispatchEvent(
        new CustomEvent('rise:loaded')
      );
    }, 400);
  }

  function init() {
    if (!screenEl) {
      return;
    }

    document.body.classList.add(
      'is-loading'
    );

    if (prefersReducedMotion()) {
      finish();
      return;
    }

    intervalId = window.setInterval(
      tick,
      180
    );

    const failsafeId =
      window.setTimeout(
        finish,
        4000
      );

    window.addEventListener(
      'load',
      () => {
        window.clearTimeout(
          failsafeId
        );

        finish();
      },
      { once: true }
    );
  }

  return {
    init
  };
})();

/* ================================================================
   2. NAVBAR
   ================================================================ */

const Navbar = (() => {
  const navbarEl =
    document.getElementById('navbar');

  const mobileMenuBtn =
    document.getElementById(
      'mobile-menu-btn'
    );

  const mobileMenuEl =
    document.getElementById(
      'mobile-menu'
    );

  const mobileNavLinks =
    document.querySelectorAll(
      '.mobile-nav-link'
    );

  const navLinks =
    document.querySelectorAll(
      '.nav-link[data-section]'
    );

  const sections = [];

  let isMobileMenuOpen = false;

  function handleScroll() {
    if (!navbarEl) {
      return;
    }

    navbarEl.classList.toggle(
      'is-scrolled',
      window.scrollY > 24
    );
  }

  function openMobileMenu() {
    if (
      !mobileMenuEl ||
      !mobileMenuBtn
    ) {
      return;
    }

    isMobileMenuOpen = true;

    mobileMenuEl.classList.add(
      'is-open'
    );

    mobileMenuBtn.classList.add(
      'is-active'
    );

    mobileMenuBtn.setAttribute(
      'aria-expanded',
      'true'
    );

    mobileMenuBtn.setAttribute(
      'aria-label',
      'Close menu'
    );

    mobileMenuEl.setAttribute(
      'aria-hidden',
      'false'
    );

    document.body.style.overflow =
      'hidden';
  }

  function closeMobileMenu() {
    if (
      !mobileMenuEl ||
      !mobileMenuBtn
    ) {
      return;
    }

    isMobileMenuOpen = false;

    mobileMenuEl.classList.remove(
      'is-open'
    );

    mobileMenuBtn.classList.remove(
      'is-active'
    );

    mobileMenuBtn.setAttribute(
      'aria-expanded',
      'false'
    );

    mobileMenuBtn.setAttribute(
      'aria-label',
      'Open menu'
    );

    mobileMenuEl.setAttribute(
      'aria-hidden',
      'true'
    );

    document.body.style.overflow =
      '';
  }

  function toggleMobileMenu() {
    if (isMobileMenuOpen) {
      closeMobileMenu();
    } else {
      openMobileMenu();
    }
  }

  function buildSectionMap() {
    sections.length = 0;

    navLinks.forEach((link) => {
      const id =
        link.getAttribute(
          'data-section'
        );

      if (!id) {
        return;
      }

      const target =
        document.getElementById(id);

      if (target) {
        sections.push({
          id,
          link,
          target
        });
      }
    });
  }

  function updateActiveLink() {
    if (sections.length === 0) {
      return;
    }

    const scrollPos =
      window.scrollY +
      window.innerHeight * 0.35;

    let currentId = null;

    sections.forEach(
      ({ id, target }) => {
        const top =
          target.offsetTop;

        const bottom =
          top + target.offsetHeight;

        if (
          scrollPos >= top &&
          scrollPos < bottom
        ) {
          currentId = id;
        }
      }
    );

    sections.forEach(
      ({ id, link }) => {
        link.classList.toggle(
          'is-active',
          id === currentId
        );
      }
    );
  }

  function init() {
    if (!navbarEl) {
      return;
    }

    handleScroll();
    buildSectionMap();
    updateActiveLink();

    window.addEventListener(
      'scroll',
      throttle(
        handleScroll,
        80
      ),
      { passive: true }
    );

    window.addEventListener(
      'scroll',
      throttle(
        updateActiveLink,
        120
      ),
      { passive: true }
    );

    if (
      mobileMenuBtn &&
      mobileMenuEl
    ) {
      mobileMenuBtn.addEventListener(
        'click',
        toggleMobileMenu
      );

      mobileNavLinks.forEach(
        (link) => {
          link.addEventListener(
            'click',
            closeMobileMenu
          );
        }
      );

      document.addEventListener(
        'keydown',
        (e) => {
          if (
            e.key === 'Escape' &&
            isMobileMenuOpen
          ) {
            closeMobileMenu();
            mobileMenuBtn.focus();
          }
        }
      );

      window.addEventListener(
        'resize',
        debounce(() => {
          if (
            window.innerWidth > 768 &&
            isMobileMenuOpen
          ) {
            closeMobileMenu();
          }

          buildSectionMap();
          updateActiveLink();
        }, 150)
      );
    }
  }

  return {
    init
  };
})();

/* ================================================================
   3. SMOOTH SCROLLING
   ================================================================ */

const SmoothScroll = (() => {
  function handleClick(e) {
    const href =
      this.getAttribute('href');

    if (
      !href ||
      href === '#' ||
      href.length < 2
    ) {
      return;
    }

    let target;

    try {
      target =
        document.querySelector(href);
    } catch (_) {
      return;
    }

    if (!target) {
      return;
    }

    e.preventDefault();

    const navbarHeight =
      document.getElementById(
        'navbar'
      )?.offsetHeight || 80;

    const targetPosition =
      target.getBoundingClientRect()
        .top +
      window.scrollY -
      navbarHeight +
      1;

    window.scrollTo({
      top: Math.max(
        0,
        targetPosition
      ),
      behavior:
        prefersReducedMotion()
          ? 'auto'
          : 'smooth'
    });

    if (
      !target.hasAttribute(
        'tabindex'
      )
    ) {
      target.setAttribute(
        'tabindex',
        '-1'
      );
    }

    target.focus({
      preventScroll: true
    });
  }

  function init() {
    document
      .querySelectorAll(
        'a[href^="#"]'
      )
      .forEach((link) => {
        link.addEventListener(
          'click',
          handleClick
        );
      });
  }

  return {
    init
  };
})();

/* ================================================================
   4. SCROLL REVEAL
   ================================================================ */

const ScrollReveal = (() => {
  function init() {
    const revealEls =
      document.querySelectorAll(
        '[data-reveal]'
      );

    if (revealEls.length === 0) {
      return;
    }

    if (
      prefersReducedMotion() ||
      !('IntersectionObserver' in window)
    ) {
      revealEls.forEach((el) => {
        el.classList.add(
          'is-visible'
        );
      });

      return;
    }

    const observer =
      new IntersectionObserver(
        (entries, obs) => {
          entries.forEach(
            (entry) => {
              if (
                entry.isIntersecting
              ) {
                entry.target.classList.add(
                  'is-visible'
                );

                obs.unobserve(
                  entry.target
                );
              }
            }
          );
        },
        {
          threshold: 0.15,
          rootMargin:
            '0px 0px -60px 0px'
        }
      );

    revealEls.forEach((el) => {
      observer.observe(el);
    });
  }

  return {
    init
  };
})();

/* ================================================================
   5. ANIMATED COUNTERS
   ================================================================ */

const Counters = (() => {
  function animateCounter(el) {
    const target =
      parseFloat(
        el.getAttribute(
          'data-target'
        )
      );

    const suffix =
      el.getAttribute(
        'data-suffix'
      ) || '';

    if (Number.isNaN(target)) {
      return;
    }

    const duration = 1800;

    const startTime =
      performance.now();

    function easeOutExpo(t) {
      return t === 1
        ? 1
        : 1 -
          Math.pow(
            2,
            -10 * t
          );
    }

    function frame(now) {
      const elapsed =
        now - startTime;

      const progress =
        clamp(
          elapsed / duration,
          0,
          1
        );

      const eased =
        easeOutExpo(progress);

      const current =
        Math.round(
          target * eased
        );

      el.textContent =
        `${current.toLocaleString(
          'en-US'
        )}${suffix}`;

      if (progress < 1) {
        window.requestAnimationFrame(
          frame
        );
      } else {
        el.textContent =
          `${target.toLocaleString(
            'en-US'
          )}${suffix}`;
      }
    }

    window.requestAnimationFrame(
      frame
    );
  }

  function setFinalValue(el) {
    const target =
      parseFloat(
        el.getAttribute(
          'data-target'
        )
      );

    const suffix =
      el.getAttribute(
        'data-suffix'
      ) || '';

    if (Number.isNaN(target)) {
      return;
    }

    el.textContent =
      `${target.toLocaleString(
        'en-US'
      )}${suffix}`;
  }

  function init() {
    const counterEls =
      document.querySelectorAll(
        '.counter'
      );

    if (counterEls.length === 0) {
      return;
    }

    if (
      prefersReducedMotion() ||
      !('IntersectionObserver' in window)
    ) {
      counterEls.forEach(
        setFinalValue
      );

      return;
    }

    const observer =
      new IntersectionObserver(
        (entries, obs) => {
          entries.forEach(
            (entry) => {
              if (
                entry.isIntersecting
              ) {
                animateCounter(
                  entry.target
                );

                obs.unobserve(
                  entry.target
                );
              }
            }
          );
        },
        {
          threshold: 0.5
        }
      );

    counterEls.forEach((el) => {
      observer.observe(el);
    });
  }

  return {
    init
  };
})();

/* ================================================================
   6. TYPING EFFECT
   ================================================================ */

const TypingEffect = (() => {
  const words = [
    'Day',
    'Habit',
    'Choice',
    'Rep',
    'Rise'
  ];

  const el =
    document.getElementById(
      'typing-text'
    );

  const TYPE_SPEED = 90;
  const DELETE_SPEED = 55;
  const PAUSE_AFTER_TYPE = 1600;
  const PAUSE_AFTER_DELETE = 300;

  let wordIndex = 0;
  let charIndex = 0;
  let isDeleting = false;
  let timeoutId = null;

  function tick() {
    if (!el) {
      return;
    }

    const currentWord =
      words[wordIndex];

    if (!isDeleting) {
      charIndex += 1;

      el.textContent =
        currentWord.slice(
          0,
          charIndex
        );

      if (
        charIndex ===
        currentWord.length
      ) {
        isDeleting = true;

        timeoutId =
          window.setTimeout(
            tick,
            PAUSE_AFTER_TYPE
          );

        return;
      }

      timeoutId =
        window.setTimeout(
          tick,
          TYPE_SPEED
        );
    } else {
      charIndex -= 1;

      el.textContent =
        currentWord.slice(
          0,
          charIndex
        );

      if (charIndex === 0) {
        isDeleting = false;

        wordIndex =
          (wordIndex + 1) %
          words.length;

        timeoutId =
          window.setTimeout(
            tick,
            PAUSE_AFTER_DELETE
          );

        return;
      }

      timeoutId =
        window.setTimeout(
          tick,
          DELETE_SPEED
        );
    }
  }

  function init() {
    if (!el) {
      return;
    }

    if (prefersReducedMotion()) {
      el.textContent =
        words[0];

      return;
    }

    el.textContent = '';

    timeoutId =
      window.setTimeout(
        tick,
        500
      );
  }

  function destroy() {
    if (timeoutId !== null) {
      window.clearTimeout(
        timeoutId
      );

      timeoutId = null;
    }
  }

  return {
    init,
    destroy
  };
})();

/* ================================================================
   7. MOUSE PARALLAX
   ================================================================ */

const MouseParallax = (() => {
  const glowEl =
    document.getElementById(
      'cursor-glow'
    );

  const parallaxEls =
    document.querySelectorAll(
      '[data-parallax]'
    );

  let rafId = null;

  let pointerX =
    window.innerWidth / 2;

  let pointerY =
    window.innerHeight / 2;

  function handlePointerMove(e) {
    pointerX = e.clientX;
    pointerY = e.clientY;

    if (glowEl) {
      glowEl.classList.add(
        'is-active'
      );
    }

    if (rafId === null) {
      rafId =
        window.requestAnimationFrame(
          render
        );
    }
  }

  function handlePointerLeave() {
    if (glowEl) {
      glowEl.classList.remove(
        'is-active'
      );
    }
  }

  function render() {
    rafId = null;

    if (glowEl) {
      glowEl.style.transform =
        `translate(${pointerX}px, ${pointerY}px) translate(-50%, -50%)`;
    }

    const centerX =
      window.innerWidth / 2;

    const centerY =
      window.innerHeight / 2;

    const offsetX =
      pointerX - centerX;

    const offsetY =
      pointerY - centerY;

    parallaxEls.forEach((el) => {
      const depth =
        parseFloat(
          el.getAttribute(
            'data-parallax'
          )
        ) || 0.03;

      el.style.transform =
        `translate(${offsetX * depth}px, ${offsetY * depth}px)`;
    });
  }

  function init() {
    if (prefersReducedMotion()) {
      return;
    }

    if (
      !window.matchMedia(
        '(hover: hover)'
      ).matches
    ) {
      return;
    }

    window.addEventListener(
      'pointermove',
      handlePointerMove,
      { passive: true }
    );

    window.addEventListener(
      'pointerleave',
      handlePointerLeave,
      { passive: true }
    );
  }

  return {
    init
  };
})();

/* ================================================================
   8. FAQ ACCORDION
   ================================================================ */

const FaqAccordion = (() => {
  function toggleItem(
    item,
    button,
    allItems
  ) {
    const isOpen =
      item.classList.contains(
        'is-open'
      );

    allItems.forEach((other) => {
      if (
        other !== item &&
        other.classList.contains(
          'is-open'
        )
      ) {
        other.classList.remove(
          'is-open'
        );

        other
          .querySelector(
            '.faq-question'
          )
          ?.setAttribute(
            'aria-expanded',
            'false'
          );
      }
    });

    item.classList.toggle(
      'is-open',
      !isOpen
    );

    button.setAttribute(
      'aria-expanded',
      String(!isOpen)
    );
  }

  function init() {
    const items =
      document.querySelectorAll(
        '.faq-item'
      );

    if (items.length === 0) {
      return;
    }

    items.forEach((item) => {
      const button =
        item.querySelector(
          '.faq-question'
        );

      if (!button) {
        return;
      }

      button.addEventListener(
        'click',
        () =>
          toggleItem(
            item,
            button,
            items
          )
      );
    });
  }

  return {
    init
  };
})();

/* ================================================================
   9. HOW-IT-WORKS PROGRESS LINE
   ================================================================ */

const StepsProgressLine = (() => {
  function init() {
    const track =
      document.querySelector(
        '.steps-track'
      );

    const fillEl =
      document.getElementById(
        'steps-line-fill'
      );

    if (!track || !fillEl) {
      return;
    }

    if (
      prefersReducedMotion() ||
      !('IntersectionObserver' in window)
    ) {
      fillEl.style.width = '100%';
      return;
    }

    const observer =
      new IntersectionObserver(
        (entries, obs) => {
          entries.forEach(
            (entry) => {
              if (
                entry.isIntersecting
              ) {
                fillEl.style.width =
                  '100%';

                obs.unobserve(
                  entry.target
                );
              }
            }
          );
        },
        {
          threshold: 0.3
        }
      );

    observer.observe(track);
  }

  return {
    init
  };
})();

/* ================================================================
   10. WAITLIST FORM
   ================================================================ */

const WaitlistForm = (() => {
  const WAITLIST_ENDPOINT =
    '/api/waitlist';

  const formEl =
    document.getElementById(
      'waitlist-form'
    );

  const nameInput =
    document.getElementById(
      'waitlist-name'
    );

  const emailInput =
    document.getElementById(
      'waitlist-email'
    );

  const nameError =
    document.getElementById(
      'name-error'
    );

  const emailError =
    document.getElementById(
      'email-error'
    );

  const submitBtn =
    document.getElementById(
      'waitlist-submit'
    );

  const successEl =
    document.getElementById(
      'waitlist-success'
    );

  const noteEl =
    document.querySelector(
      '.waitlist-note'
    );

  const EMAIL_REGEX =
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  function setFieldError(
    input,
    errorEl,
    message = ''
  ) {
    if (!input) {
      return;
    }

    const hasError =
      Boolean(message);

    input.classList.toggle(
      'is-invalid',
      hasError
    );

    input.setAttribute(
      'aria-invalid',
      hasError
        ? 'true'
        : 'false'
    );

    if (errorEl) {
      errorEl.textContent =
        message;
    }
  }

  function validateName() {
    if (!nameInput) {
      return false;
    }

    const value =
      nameInput.value.trim();

    if (!value) {
      setFieldError(
        nameInput,
        nameError,
        'Please enter your name.'
      );

      return false;
    }

    if (value.length < 2) {
      setFieldError(
        nameInput,
        nameError,
        'That name looks a little short.'
      );

      return false;
    }

    setFieldError(
      nameInput,
      nameError
    );

    return true;
  }

  function validateEmail() {
    if (!emailInput) {
      return false;
    }

    const value =
      emailInput.value.trim();

    if (!value) {
      setFieldError(
        emailInput,
        emailError,
        'Please enter your email.'
      );

      return false;
    }

    if (!EMAIL_REGEX.test(value)) {
      setFieldError(
        emailInput,
        emailError,
        'Please enter a valid email address.'
      );

      return false;
    }

    setFieldError(
      emailInput,
      emailError
    );

    return true;
  }

  function setLoading(isLoading) {
    if (!submitBtn) {
      return;
    }

    submitBtn.classList.toggle(
      'is-loading',
      isLoading
    );

    submitBtn.disabled =
      isLoading;

    const textEl =
      submitBtn.querySelector(
        '.btn-text'
      );

    if (textEl) {
      textEl.textContent =
        isLoading
          ? 'Joining...'
          : 'Reserve My Spot';
    }

    submitBtn.setAttribute(
      'aria-busy',
      String(isLoading)
    );
  }

  function getErrorMessage(
    data,
    fallback
  ) {
    if (!data) {
      return fallback;
    }

    if (
      typeof data === 'string'
    ) {
      return data;
    }

    const possibleMessages = [
      data.message,
      data.error,
      data.details,
      data?.error?.message,
      data?.error?.error,
      data?.message?.message,
      data?.message?.error
    ];

    for (
      const value of possibleMessages
    ) {
      if (
        typeof value === 'string' &&
        value.trim()
      ) {
        return value.trim();
      }
    }

    return fallback;
  }

  function showSuccess(data) {
    if (formEl) {
      formEl.classList.add(
        'is-hidden'
      );
    }

    if (noteEl) {
      noteEl.classList.add(
        'is-hidden'
      );
    }

    if (!successEl) {
      return;
    }

    successEl.innerHTML = '';

    successEl.setAttribute(
      'role',
      'status'
    );

    successEl.setAttribute(
      'aria-live',
      'polite'
    );

    const icon =
      document.createElement('div');

    icon.className =
      'success-icon';

    icon.setAttribute(
      'aria-hidden',
      'true'
    );

    icon.textContent = '✓';

    const heading =
      document.createElement('h3');

    heading.textContent =
      data.alreadyJoined
        ? "You're already on the list!"
        : "You're on the list!";

    const message =
      document.createElement('p');

    if (data.alreadyJoined) {
      message.textContent =
        data.emailSent === true
          ? 'We found your existing RISE waitlist spot and resent your confirmation email.'
          : 'We found your existing RISE waitlist spot.';
    } else if (
      data.emailSent === false
    ) {
      message.textContent =
        'You are officially on the RISE waitlist. Save your waitlist number and confirmation code below.';
    } else {
      message.textContent =
        'Your RISE confirmation has been sent to your email.';
    }

    const number =
      document.createElement('p');

    number.className =
      'waitlist-number';

    const numberLabel =
      document.createElement(
        'strong'
      );

    numberLabel.textContent =
      'Your Waitlist Number: ';

    const numberValue =
      document.createElement(
        'span'
      );

    numberValue.textContent =
      data.waitlistNumber != null
        ? `#${String(
            data.waitlistNumber
          ).padStart(4, '0')}`
        : 'Pending';

    number.append(
      numberLabel,
      numberValue
    );

    const code =
      document.createElement('p');

    code.className =
      'confirmation-code';

    const codeLabel =
      document.createElement(
        'strong'
      );

    codeLabel.textContent =
      'Confirmation Code: ';

    const codeValue =
      document.createElement(
        'span'
      );

    codeValue.textContent =
      data.confirmationCode ||
      'Check your email';

    code.append(
      codeLabel,
      codeValue
    );

    successEl.append(
      icon,
      heading,
      message,
      number,
      code
    );

    successEl.classList.add(
      'is-visible'
    );

    if (
      typeof Toast !== 'undefined' &&
      typeof Toast.show === 'function'
    ) {
      Toast.show(
        data.waitlistNumber != null
          ? `Welcome to RISE — you're #${String(
              data.waitlistNumber
            ).padStart(4, '0')}!`
          : "Welcome to RISE — you're officially on the list."
      );
    }
  }

  async function submitToServer(
    payload
  ) {
    let response;

    try {
      response = await fetch(
        WAITLIST_ENDPOINT,
        {
          method: 'POST',

          headers: {
            'Content-Type':
              'application/json',

            'Accept':
              'application/json'
          },

          body:
            JSON.stringify(payload)
        }
      );
    } catch (networkError) {
      console.error(
        'RISE network error:',
        networkError
      );

      throw new Error(
        'We could not connect to RISE. Please check your internet connection and try again.'
      );
    }

    let data = null;

    try {
      data =
        await response.json();
    } catch (_) {
      data = null;
    }

    if (!response.ok) {
      throw new Error(
        getErrorMessage(
          data,
          `The server returned an error (${response.status}). Please try again.`
        )
      );
    }

    if (
      !data ||
      data.success !== true
    ) {
      throw new Error(
        getErrorMessage(
          data,
          'We could not confirm your signup. Please try again.'
        )
      );
    }

    return data;
  }

  async function handleSubmit(e) {
    e.preventDefault();

    const isNameValid =
      validateName();

    const isEmailValid =
      validateEmail();

    if (
      !isNameValid ||
      !isEmailValid
    ) {
      const firstInvalid =
        !isNameValid
          ? nameInput
          : emailInput;

      if (firstInvalid) {
        firstInvalid.focus();
      }

      if (
        typeof Toast !== 'undefined' &&
        typeof Toast.show === 'function'
      ) {
        Toast.show(
          'Please fix the highlighted fields.',
          true
        );
      }

      return;
    }

    setLoading(true);

    try {
      const data =
        await submitToServer({
          name:
            nameInput.value.trim(),

          email:
            emailInput.value
              .trim()
              .toLowerCase(),

          resendConfirmation:
            true
        });

      showSuccess(data);
    } catch (err) {
      console.error(
        'RISE waitlist error:',
        err
      );

      const message =
        err instanceof Error
          ? err.message
          : 'Something went wrong. Please try again.';

      if (
        typeof Toast !== 'undefined' &&
        typeof Toast.show === 'function'
      ) {
        Toast.show(
          message,
          true
        );
      }
    } finally {
      setLoading(false);
    }
  }

  function init() {
    if (!formEl) {
      return;
    }

    formEl.addEventListener(
      'submit',
      handleSubmit
    );

    if (nameInput) {
      nameInput.addEventListener(
        'blur',
        validateName
      );

      nameInput.addEventListener(
        'input',
        () => {
          if (
            nameInput.classList.contains(
              'is-invalid'
            )
          ) {
            validateName();
          }
        }
      );
    }

    if (emailInput) {
      emailInput.addEventListener(
        'blur',
        validateEmail
      );

      emailInput.addEventListener(
        'input',
        () => {
          if (
            emailInput.classList.contains(
              'is-invalid'
            )
          ) {
            validateEmail();
          }
        }
      );
    }
  }

  return {
    init
  };
})();

/* ================================================================
   11. TOAST NOTIFICATIONS
   ================================================================ */

const Toast = (() => {
  const toastEl =
    document.getElementById(
      'toast'
    );

  let hideTimeoutId = null;

  function show(
    message,
    isError = false
  ) {
    if (!toastEl) {
      return;
    }

    toastEl.textContent =
      String(message);

    toastEl.classList.toggle(
      'is-error',
      isError
    );

    toastEl.setAttribute(
      'role',
      isError
        ? 'alert'
        : 'status'
    );

    toastEl.setAttribute(
      'aria-live',
      isError
        ? 'assertive'
        : 'polite'
    );

    toastEl.classList.add(
      'is-visible'
    );

    if (hideTimeoutId !== null) {
      window.clearTimeout(
        hideTimeoutId
      );
    }

    hideTimeoutId =
      window.setTimeout(
        () => {
          toastEl.classList.remove(
            'is-visible'
          );

          hideTimeoutId = null;
        },
        3600
      );
  }

  return {
    show
  };
})();

/* ================================================================
   12. BACK TO TOP
   ================================================================ */

const BackToTop = (() => {
  const btnEl =
    document.getElementById(
      'back-to-top'
    );

  function handleScroll() {
    if (!btnEl) {
      return;
    }

    btnEl.classList.toggle(
      'is-visible',
      window.scrollY > 640
    );
  }

  function scrollToTop() {
    window.scrollTo({
      top: 0,

      behavior:
        prefersReducedMotion()
          ? 'auto'
          : 'smooth'
    });
  }

  function init() {
    if (!btnEl) {
      return;
    }

    handleScroll();

    window.addEventListener(
      'scroll',
      throttle(
        handleScroll,
        100
      ),
      { passive: true }
    );

    btnEl.addEventListener(
      'click',
      scrollToTop
    );
  }

  return {
    init
  };
})();

/* ================================================================
   13. TRUSTED-BY MARQUEE
   ================================================================ */

const Marquee = (() => {
  function init() {
    const track =
      document.querySelector(
        '.marquee-track'
      );

    const wrapper =
      document.querySelector(
        '.trusted-marquee'
      );

    if (!track || !wrapper) {
      return;
    }

    if (prefersReducedMotion()) {
      track.style.animationPlayState =
        'paused';

      return;
    }

    wrapper.addEventListener(
      'mouseenter',
      () => {
        track.style.animationPlayState =
          'paused';
      }
    );

    wrapper.addEventListener(
      'mouseleave',
      () => {
        track.style.animationPlayState =
          'running';
      }
    );

    wrapper.addEventListener(
      'focusin',
      () => {
        track.style.animationPlayState =
          'paused';
      }
    );

    wrapper.addEventListener(
      'focusout',
      () => {
        track.style.animationPlayState =
          'running';
      }
    );
  }

  return {
    init
  };
})();

/* ================================================================
   14. DYNAMIC FOOTER YEAR
   ================================================================ */

const FooterYear = (() => {
  function init() {
    const yearEl =
      document.getElementById(
        'current-year'
      );

    if (yearEl) {
      yearEl.textContent =
        new Date()
          .getFullYear()
          .toString();
    }
  }

  return {
    init
  };
})();

/* ================================================================
   15. LAZY LOADING SAFETY NET
   ================================================================ */

const LazyLoadFallback = (() => {
  function init() {
    if (
      'loading' in
      HTMLImageElement.prototype
    ) {
      return;
    }

    const lazyImages =
      document.querySelectorAll(
        'img[loading="lazy"]'
      );

    if (
      lazyImages.length === 0 ||
      !('IntersectionObserver' in window)
    ) {
      return;
    }

    const observer =
      new IntersectionObserver(
        (entries, obs) => {
          entries.forEach(
            (entry) => {
              if (
                entry.isIntersecting
              ) {
                const img =
                  entry.target;

                const dataSrc =
                  img.getAttribute(
                    'data-src'
                  );

                if (dataSrc) {
                  img.src = dataSrc;
                }

                obs.unobserve(img);
              }
            }
          );
        }
      );

    lazyImages.forEach((img) => {
      observer.observe(img);
    });
  }

  return {
    init
  };
})();

/* ================================================================
   16. KEYBOARD NAVIGATION POLISH
   ================================================================ */

const KeyboardPolish = (() => {
  function init() {
    function handleFirstTab(e) {
      if (e.key === 'Tab') {
        document.body.classList.add(
          'user-is-tabbing'
        );

        window.removeEventListener(
          'keydown',
          handleFirstTab
        );
      }
    }

    window.addEventListener(
      'keydown',
      handleFirstTab
    );
  }

  return {
    init
  };
})();

/* ================================================================
   INIT
   ================================================================ */

document.addEventListener(
  'DOMContentLoaded',
  () => {
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
  }
);