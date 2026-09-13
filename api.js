const { createClient } = require('@supabase/supabase-js');
const { Resend } = require('resend');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const resend = new Resend(process.env.RESEND_API_KEY);

const FROM_EMAIL =
  process.env.RESEND_FROM_EMAIL ||
  process.env.EMAIL_FROM ||
  'RISE <onboarding@resend.dev>';

const CODE_ALPHABET =
  'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function generateConfirmationCode() {
  let code = '';

  for (let i = 0; i < 6; i++) {
    code += CODE_ALPHABET[
      Math.floor(Math.random() * CODE_ALPHABET.length)
    ];
  }

  return `RISE-${code}`;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function sendJson(res, status, data) {
  res.status(status).json(data);
}

module.exports = async function handler(req, res) {
  // ------------------------------------------------------------
  // CORS / headers
  // ------------------------------------------------------------

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader(
    'Access-Control-Allow-Methods',
    'POST, OPTIONS'
  );
  res.setHeader(
    'Access-Control-Allow-Headers',
    'Content-Type'
  );

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // ------------------------------------------------------------
  // Only allow POST
  // ------------------------------------------------------------

  if (req.method !== 'POST') {
    return sendJson(res, 405, {
      success: false,
      message: 'Method not allowed.'
    });
  }

  try {
    // ----------------------------------------------------------
    // Check environment variables
    // ----------------------------------------------------------

    if (!process.env.SUPABASE_URL) {
      console.error('Missing SUPABASE_URL');

      return sendJson(res, 500, {
        success: false,
        message: 'Server configuration error: Supabase URL is missing.'
      });
    }

    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      console.error('Missing SUPABASE_SERVICE_ROLE_KEY');

      return sendJson(res, 500, {
        success: false,
        message: 'Server configuration error: Supabase service key is missing.'
      });
    }

    if (!process.env.RESEND_API_KEY) {
      console.error('Missing RESEND_API_KEY');

      return sendJson(res, 500, {
        success: false,
        message: 'Server configuration error: email service key is missing.'
      });
    }

    // ----------------------------------------------------------
    // Read request body
    // ----------------------------------------------------------

    const body =
      typeof req.body === 'string'
        ? JSON.parse(req.body)
        : req.body;

    const name =
      typeof body?.name === 'string'
        ? body.name.trim()
        : '';

    const email =
      typeof body?.email === 'string'
        ? body.email.trim().toLowerCase()
        : '';

    // ----------------------------------------------------------
    // Validate name
    // ----------------------------------------------------------

    if (!name) {
      return sendJson(res, 400, {
        success: false,
        message: 'Please enter your name.'
      });
    }

    if (name.length < 2) {
      return sendJson(res, 400, {
        success: false,
        message: 'Please enter a valid name.'
      });
    }

    if (name.length > 100) {
      return sendJson(res, 400, {
        success: false,
        message: 'Name is too long.'
      });
    }

    // ----------------------------------------------------------
    // Validate email
    // ----------------------------------------------------------

    const EMAIL_REGEX =
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!email) {
      return sendJson(res, 400, {
        success: false,
        message: 'Please enter your email.'
      });
    }

    if (!EMAIL_REGEX.test(email)) {
      return sendJson(res, 400, {
        success: false,
        message: 'Please enter a valid email address.'
      });
    }

    // ----------------------------------------------------------
    // Check if email already exists
    // ----------------------------------------------------------

    const { data: existingUser, error: existingError } =
      await supabase
        .from('waitlist')
        .select(
          'waitlist_number, name, email, confirmation_code, email_status'
        )
        .eq('email', email)
        .maybeSingle();

    if (existingError) {
      console.error(
        'Existing-user lookup error:',
        existingError
      );

      return sendJson(res, 500, {
        success: false,
        message: 'We could not check the waitlist. Please try again.'
      });
    }

    // ----------------------------------------------------------
    // Already joined
    // ----------------------------------------------------------

    if (existingUser) {
      return sendJson(res, 200, {
        success: true,
        alreadyJoined: true,
        waitlistNumber: existingUser.waitlist_number,
        confirmationCode: existingUser.confirmation_code,
        emailSent: existingUser.email_status === 'sent'
      });
    }

    // ----------------------------------------------------------
    // Generate waitlist number
    // ----------------------------------------------------------

    const { data: numberData, error: numberError } =
      await supabase.rpc(
        'get_or_create_waitlist_number'
      );

    if (numberError) {
      console.error(
        'Waitlist number error:',
        numberError
      );

      return sendJson(res, 500, {
        success: false,
        message:
          'We could not generate your waitlist number. Please try again.'
      });
    }

    const waitlistNumber = Number(numberData);

    // ----------------------------------------------------------
    // Generate confirmation code
    // ----------------------------------------------------------

    const confirmationCode =
      generateConfirmationCode();

    // ----------------------------------------------------------
    // Insert user
    // ----------------------------------------------------------

    const { data: newUser, error: insertError } =
      await supabase
        .from('waitlist')
        .insert({
          waitlist_number: waitlistNumber,
          name,
          email,
          confirmation_code: confirmationCode,
          email_status: 'pending'
        })
        .select(
          'waitlist_number, name, email, confirmation_code'
        )
        .single();

    if (insertError) {
      console.error(
        'Waitlist insert error:',
        insertError
      );

      return sendJson(res, 500, {
        success: false,
        message:
          'We could not save your waitlist signup. Please try again.'
      });
    }

    // ----------------------------------------------------------
    // Build confirmation email
    // ----------------------------------------------------------

    const safeName = escapeHtml(name);
    const safeCode = escapeHtml(confirmationCode);
    const safeNumber = escapeHtml(
      String(waitlistNumber)
    );

    const emailHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Welcome to RISE</title>
</head>

<body style="
  margin:0;
  padding:0;
  background:#0a0a0a;
  font-family:Arial,Helvetica,sans-serif;
  color:#ffffff;
">

  <div style="
    max-width:600px;
    margin:0 auto;
    padding:40px 20px;
  ">

    <div style="
      background:#111111;
      border:1px solid #252525;
      border-radius:20px;
      padding:40px 30px;
    ">

      <div style="
        font-size:34px;
        font-weight:800;
        color:#5cff7a;
        margin-bottom:30px;
      ">
        RISE
      </div>

      <h1 style="
        margin:0 0 15px 0;
        font-size:30px;
        line-height:1.2;
      ">
        You're officially on the list.
      </h1>

      <p style="
        color:#b5b5b5;
        font-size:16px;
        line-height:1.6;
      ">
        Hey ${safeName},
      </p>

      <p style="
        color:#b5b5b5;
        font-size:16px;
        line-height:1.6;
      ">
        Welcome to RISE — the system designed to help you
        become 1% better every day.
      </p>

      <div style="
        margin:30px 0;
        padding:25px;
        background:#181818;
        border-radius:16px;
      ">

        <p style="
          margin:0 0 10px 0;
          color:#8f8f8f;
          font-size:13px;
          text-transform:uppercase;
          letter-spacing:1px;
        ">
          Your waitlist number
        </p>

        <div style="
          font-size:40px;
          font-weight:800;
          color:#5cff7a;
        ">
          #${safeNumber}
        </div>

      </div>

      <div style="
        margin:30px 0;
        padding:25px;
        background:#181818;
        border-radius:16px;
      ">

        <p style="
          margin:0 0 10px 0;
          color:#8f8f8f;
          font-size:13px;
          text-transform:uppercase;
          letter-spacing:1px;
        ">
          Confirmation code
        </p>

        <div style="
          font-size:24px;
          font-weight:700;
          letter-spacing:2px;
          color:#ffffff;
        ">
          ${safeCode}
        </div>

      </div>

      <p style="
        color:#8f8f8f;
        font-size:14px;
        line-height:1.6;
      ">
        Keep this confirmation code somewhere safe.
        You'll be able to use it to verify your place
        on the RISE waitlist.
      </p>

      <p style="
        margin-top:35px;
        color:#ffffff;
        font-size:16px;
      ">
        Keep rising.
      </p>

      <p style="
        color:#5cff7a;
        font-weight:700;
      ">
        — The RISE Team
      </p>

    </div>

  </div>

</body>
</html>
`;

    // ----------------------------------------------------------
    // Send email
    // ----------------------------------------------------------

    const { data: emailData, error: emailError } =
      await resend.emails.send({
        from: FROM_EMAIL,
        to: [email],
        subject:
          `You're #${waitlistNumber} on the RISE waitlist`,
        html: emailHtml
      });

    // ----------------------------------------------------------
    // Email failed
    // ----------------------------------------------------------

    if (emailError) {
      console.error(
        'Resend error:',
        emailError
      );

      await supabase
        .from('waitlist')
        .update({
          email_status: 'failed',
          last_email_error:
            typeof emailError === 'string'
              ? emailError
              : JSON.stringify(emailError)
        })
        .eq(
          'waitlist_number',
          waitlistNumber
        );

      // IMPORTANT:
      // The user IS still saved to the waitlist.
      // We return the number/code so the signup is not lost.

      return sendJson(res, 200, {
        success: true,
        alreadyJoined: false,
        waitlistNumber,
        confirmationCode,
        emailSent: false,
        message:
          'You joined the waitlist, but the confirmation email could not be sent yet.'
      });
    }

    // ----------------------------------------------------------
    // Mark email as sent
    // ----------------------------------------------------------

    await supabase
      .from('waitlist')
      .update({
        email_status: 'sent',
        email_sent_at: new Date().toISOString(),
        last_email_error: null
      })
      .eq(
        'waitlist_number',
        waitlistNumber
      );

    // ----------------------------------------------------------
    // Success
    // ----------------------------------------------------------

    console.log(
      'RISE waitlist signup:',
      {
        waitlistNumber,
        email,
        resendId: emailData?.id || null
      }
    );

    return sendJson(res, 200, {
      success: true,
      alreadyJoined: false,
      waitlistNumber,
      confirmationCode,
      emailSent: true
    });

  } catch (error) {

    console.error(
      'RISE waitlist server error:',
      error
    );

    return sendJson(res, 500, {
      success: false,
      message:
        'Something went wrong on the server. Please try again.'
    });
  }
};