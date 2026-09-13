/* ================================================================
   10. WAITLIST FORM VALIDATION + SUBMISSION
   ================================================================= */

const WaitlistForm = (() => {
  // Vercel serverless endpoint
  const WAITLIST_ENDPOINT = '/api/waitlist';

  const formEl = document.getElementById('waitlist-form');
  const nameInput = document.getElementById('waitlist-name');
  const emailInput = document.getElementById('waitlist-email');

  const nameError = document.getElementById('name-error');
  const emailError = document.getElementById('email-error');

  const submitBtn = document.getElementById('waitlist-submit');
  const successEl = document.getElementById('waitlist-success');
  const noteEl = document.querySelector('.waitlist-note');

  // Correct email validation
  const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;


  /* --------------------------------------------------------------
     FIELD ERROR HANDLING
     -------------------------------------------------------------- */

  function setFieldError(input, errorEl, message = '') {
    if (!input) return;

    const hasError = Boolean(message);

    input.classList.toggle('is-invalid', hasError);
    input.setAttribute(
      'aria-invalid',
      hasError ? 'true' : 'false'
    );

    if (errorEl) {
      errorEl.textContent = message;
    }
  }


  /* --------------------------------------------------------------
     NAME VALIDATION
     -------------------------------------------------------------- */

  function validateName() {
    if (!nameInput) return false;

    const value = nameInput.value.trim();

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
      nameError,
      ''
    );

    return true;
  }


  /* --------------------------------------------------------------
     EMAIL VALIDATION
     -------------------------------------------------------------- */

  function validateEmail() {
    if (!emailInput) return false;

    const value = emailInput.value.trim();

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
      emailError,
      ''
    );

    return true;
  }


  /* --------------------------------------------------------------
     SUBMIT BUTTON LOADING STATE
     -------------------------------------------------------------- */

  function setLoading(isLoading) {
    if (!submitBtn) return;

    submitBtn.classList.toggle(
      'is-loading',
      isLoading
    );

    submitBtn.disabled = isLoading;

    const textEl = submitBtn.querySelector('.btn-text');

    if (textEl) {
      textEl.textContent = isLoading
        ? 'Joining...'
        : 'Reserve My Spot';
    }
  }


  /* --------------------------------------------------------------
     SAFELY EXTRACT ERROR MESSAGE
     
     Prevents:
     [object Object]
     
     from appearing to users.
     -------------------------------------------------------------- */

  function getErrorMessage(data, fallback) {
    if (!data) {
      return fallback;
    }

    // Server returned a plain string
    if (typeof data === 'string') {
      return data;
    }

    // Try common API error formats
    const possibleMessages = [
      data.message,
      data.error,
      data.details,

      data?.error?.message,
      data?.error?.error,

      data?.message?.message,
      data?.message?.error
    ];

    for (const value of possibleMessages) {
      if (
        typeof value === 'string' &&
        value.trim().length > 0
      ) {
        return value.trim();
      }
    }

    // Last resort: safely convert object to readable text
    try {
      const json = JSON.stringify(data);

      if (json && json !== '{}') {
        return json;
      }
    } catch (_) {
      // Ignore JSON conversion errors
    }

    return fallback;
  }


  /* --------------------------------------------------------------
     SUCCESS SCREEN
     -------------------------------------------------------------- */

  function showSuccess(data) {
    if (formEl) {
      formEl.classList.add('is-hidden');
    }

    if (noteEl) {
      noteEl.classList.add('is-hidden');
    }

    if (!successEl) return;

    // Clear previous content
    successEl.innerHTML = '';


    /* Success icon */

    const icon = document.createElement('div');

    icon.className = 'success-icon';

    icon.setAttribute(
      'aria-hidden',
      'true'
    );

    icon.textContent = '✓';


    /* Heading */

    const heading = document.createElement('h3');

    heading.textContent = data.alreadyJoined
      ? "You're already on the list!"
      : "You're on the list!";


    /* Message */

    const message = document.createElement('p');

    if (data.alreadyJoined) {
      message.textContent =
        'We found your existing RISE waitlist spot.';
    } else if (data.emailSent === false) {
      message.textContent =
        'You are officially on the RISE waitlist. Save your waitlist number and confirmation code below.';
    } else {
      message.textContent =
        'Your RISE confirmation has been sent to your email.';
    }


    /* Waitlist number */

    const number = document.createElement('p');

    number.className = 'waitlist-number';

    const numberLabel = document.createElement('strong');

    numberLabel.textContent =
      'Your Waitlist Number: ';

    const numberValue = document.createElement('span');

    numberValue.textContent =
      data.waitlistNumber != null
        ? `#${String(data.waitlistNumber).padStart(4, '0')}`
        : 'Pending';

    number.append(
      numberLabel,
      numberValue
    );


    /* Confirmation code */

    const code = document.createElement('p');

    code.className = 'confirmation-code';

    const codeLabel = document.createElement('strong');

    codeLabel.textContent =
      'Confirmation Code: ';

    const codeValue = document.createElement('span');

    codeValue.textContent =
      data.confirmationCode ||
      'Check your email';

    code.append(
      codeLabel,
      codeValue
    );


    /* Add everything to success container */

    successEl.append(
      icon,
      heading,
      message,
      number,
      code
    );

    successEl.classList.add('is-visible');


    /* Toast */

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


  /* --------------------------------------------------------------
     SEND DATA TO VERCEL API
     -------------------------------------------------------------- */

  async function submitToServer(payload) {
    let response;

    /* Network request */

    try {
      response = await fetch(
        WAITLIST_ENDPOINT,
        {
          method: 'POST',

          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },

          body: JSON.stringify(payload)
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


    /* Read JSON response */

    let data = null;

    try {
      data = await response.json();
    } catch (_) {
      data = null;
    }


    /* IMPORTANT:
       This lets us see exactly what the API returned
       in the browser console.
    */

    console.log(
      'RISE waitlist API response:',
      data
    );


    /* Server error */

    if (!response.ok) {
      throw new Error(
        getErrorMessage(
          data,
          `The server returned an error (${response.status}). Please try again.`
        )
      );
    }


    /* Invalid success response */

    if (!data || data.success !== true) {
      throw new Error(
        getErrorMessage(
          data,
          'We could not confirm your signup. Please try again.'
        )
      );
    }


    return data;
  }


  /* --------------------------------------------------------------
     FORM SUBMISSION
     -------------------------------------------------------------- */

  async function handleSubmit(e) {
    e.preventDefault();


    /* Validate name */

    const isNameValid =
      validateName();


    /* Validate email */

    const isEmailValid =
      validateEmail();


    /* Stop if invalid */

    if (!isNameValid || !isEmailValid) {
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


    /* Start loading */

    setLoading(true);


    try {
      const data =
        await submitToServer({
          name: nameInput.value.trim(),

          email: emailInput.value
            .trim()
            .toLowerCase()
        });


      /* Success */

      showSuccess(data);

    } catch (err) {

      console.error(
        'RISE waitlist error:',
        err
      );


      /* Safely handle ANY type of error */

      const message =
        err instanceof Error
          ? err.message
          : getErrorMessage(
              err,
              'Something went wrong. Please try again.'
            );


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

      /* Stop loading */

      setLoading(false);
    }
  }


  /* --------------------------------------------------------------
     INITIALIZE
     -------------------------------------------------------------- */

  function init() {
    if (!formEl) return;


    /* Form submit */

    formEl.addEventListener(
      'submit',
      handleSubmit
    );


    /* Name validation */

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


    /* Email validation */

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