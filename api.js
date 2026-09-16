
const { createClient } = require('@supabase/supabase-js');
const { Resend } = require('resend');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const resend = new Resend(process.env.RESEND_API_KEY);

const FROM_EMAIL = process.env.RESEND_FROM_EMAIL;
const ADMIN_EMAIL = process.env.ADMIN_EMAIL;

const CODE_ALPHABET =
  'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function sendJson(res, status, data) {
  return res.status(status).json(data);
}

function generateConfirmationCode() {
  let code = '';

  for (let i = 0; i < 6; i++) {
    code += CODE_ALPHABET[
      Math.floor(Math.random() * CODE_ALPHABET.length)
    ];
  }

  return `RISE-${code}`;
}

function confirmationEmail({
  name,
  waitlistNumber,
  confirmationCode
}) {
  return `
<!DOCTYPE html>
<html>
<body style="margin:0;background:#0a0a0a;font-family:Arial;color:white;">
  <div style="max-width:600px;margin:auto;padding:40px 20px;">
    <div style="background:#111;border:1px solid #292929;border-radius:20px;padding:35px;">

      <h1 style="color:#5cff7a;">RISE</h1>

      <h2>You're officially on the list.</h2>

      <p style="color:#b5b5b5;">
        Hey ${escapeHtml(name)},
      </p>

      <p style="color:#b5b5b5;">
        Welcome to RISE — the system designed to help you
        become 1% better every day.
      </p>

      <div style="background:#181818;padding:25px;border-radius:15px;">
        <p style="color:#999;">YOUR WAITLIST NUMBER</p>
        <h1 style="color:#5cff7a;">
          #${escapeHtml(waitlistNumber)}
        </h1>
      </div>

      <div style="background:#181818;padding:25px;border-radius:15px;margin-top:20px;">
        <p style="color:#999;">CONFIRMATION CODE</p>
        <h2>
          ${escapeHtml(confirmationCode)}
        </h2>
      </div>

      <p style="color:#999;">
        Keep your confirmation code safe.
      </p>

      <p>Keep rising.</p>

      <p style="color:#5cff7a;font-weight:bold;">
        — The RISE Team
      </p>

    </div>
  </div>
</body>
</html>
`;
}

function adminNotificationEmail({
  name,
  email,
  waitlistNumber,
  confirmationCode
}) {
  return `
<!DOCTYPE html>
<html>
<body style="font-family:Arial;">
  <h2>New RISE Waitlist Signup</h2>

  <p><strong>Name:</strong> ${escapeHtml(name)}</p>
  <p><strong>Email:</strong> ${escapeHtml(email)}</p>
  <p><strong>Waitlist Number:</strong> #${escapeHtml(waitlistNumber)}</p>
  <p><strong>Confirmation Code:</strong> ${escapeHtml(confirmationCode)}</p>

  <p>Someone has joined the RISE waitlist.</p>
</body>
</html>
`;
}

async function sendEmails(details) {
  const [userEmail, adminEmail] =
    await Promise.allSettled([

      resend.emails.send({
        from: FROM_EMAIL,
        to: [details.email],
        subject:
          `You're #${details.waitlistNumber} on the RISE waitlist`,
        html: confirmationEmail(details)
      }),

      resend.emails.send({
        from: FROM_EMAIL,
        to: [ADMIN_EMAIL],
        subject:
          `New RISE Waitlist Signup — #${details.waitlistNumber}`,
        html: adminNotificationEmail(details)
      })

    ]);

  return {
    userSent:
      userEmail.status === 'fulfilled' &&
      !userEmail.value?.error,

    adminSent:
      adminEmail.status === 'fulfilled' &&
      !adminEmail.value?.error,

    userResult: userEmail,
    adminResult: adminEmail
  };
}

module.exports = async function handler(req, res) {

  res.setHeader(
    'Access-Control-Allow-Origin',
    '*'
  );

  res.setHeader(
    'Access-Control-Allow-Methods',
    'POST, OPTIONS'
  );

  res.setHeader(
    'Access-Control-Allow-Headers',
    'Content-Type'
  );

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return sendJson(res, 405, {
      success: false,
      message: 'Method not allowed.'
    });
  }

  try {

    if (
      !process.env.SUPABASE_URL ||
      !process.env.SUPABASE_SERVICE_ROLE_KEY ||
      !process.env.RESEND_API_KEY ||
      !FROM_EMAIL ||
      !ADMIN_EMAIL
    ) {
      return sendJson(res, 500, {
        success: false,
        message:
          'Server configuration is incomplete.'
      });
    }

    const body =
      typeof req.body === 'string'
        ? JSON.parse(req.body)
        : req.body || {};

    const name =
      typeof body.name === 'string'
        ? body.name.trim()
        : '';

    const email =
      typeof body.email === 'string'
        ? body.email.trim().toLowerCase()
        : '';

    if (name.length < 2 || name.length > 100) {
      return sendJson(res, 400, {
        success: false,
        message: 'Please enter a valid name.'
      });
    }

    if (
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    ) {
      return sendJson(res, 400, {
        success: false,
        message: 'Please enter a valid email address.'
      });
    }

    const {
      data: existingUser,
      error: lookupError
    } = await supabase
      .from('waitlist')
      .select(
        'waitlist_number,name,email,confirmation_code'
      )
      .eq('email', email)
      .maybeSingle();

    if (lookupError) {
      console.error(lookupError);

      return sendJson(res, 500, {
        success: false,
        message: 'Could not check the waitlist.'
      });
    }

    let user = existingUser;
    let alreadyJoined = Boolean(existingUser);

    if (!user) {

      const {
        data: numberData,
        error: numberError
      } = await supabase.rpc(
        'get_or_create_waitlist_number'
      );

      if (numberError) {
        console.error(numberError);

        return sendJson(res, 500, {
          success: false,
          message:
            'Could not generate waitlist number.'
        });
      }

      const newUser = {
        waitlist_number: Number(numberData),
        name,
        email,
        confirmation_code:
          generateConfirmationCode(),
        email_status: 'pending'
      };

      const {
        data: insertedUser,
        error: insertError
      } = await supabase
        .from('waitlist')
        .insert(newUser)
        .select(
          'waitlist_number,name,email,confirmation_code'
        )
        .single();

      if (insertError) {
        console.error(insertError);

        return sendJson(res, 500, {
          success: false,
          message:
            'Could not save your waitlist signup.'
        });
      }

      user = insertedUser;
    }

    const details = {
      name: user.name || name,
      email: user.email,
      waitlistNumber: user.waitlist_number,
      confirmationCode: user.confirmation_code
    };

    const emailResults = await sendEmails(details);

    const failures = [];

    if (!emailResults.userSent) {
      failures.push('confirmation email');
    }

    if (!emailResults.adminSent) {
      failures.push('owner notification');
    }

    if (failures.length === 0) {

      await supabase
        .from('waitlist')
        .update({
          email_status: 'sent',
          email_sent_at:
            new Date().toISOString(),
          last_email_error: null
        })
        .eq('email', email);

    } else {

      console.error(
        'Email delivery failure:',
        emailResults
      );

      await supabase
        .from('waitlist')
        .update({
          email_status: 'failed',
          last_email_error:
            failures.join(', ')
        })
        .eq('email', email);
    }

    return sendJson(res, 200, {

      success: true,

      alreadyJoined,

      waitlistNumber:
        details.waitlistNumber,

      confirmationCode:
        details.confirmationCode,

      emailSent:
        emailResults.userSent,

      adminEmailSent:
        emailResults.adminSent,

      message:
        failures.length > 0
          ? `Your spot is saved, but ${failures.join(' and ')} could not be sent.`
          : 'You successfully joined the RISE waitlist.'

    });

  } catch (error) {

    console.error(
      'RISE server error:',
      error
    );

    return sendJson(res, 500, {
      success: false,
      message:
        'Something went wrong on the server.'
    });

  }

};