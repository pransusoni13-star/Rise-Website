/**
 * RISE waitlist API — Vercel Serverless Function
 *
 * Required Vercel environment variables:
 * SUPABASE_URL
 * SUPABASE_SERVICE_ROLE_KEY
 * RESEND_API_KEY
 * EMAIL_FROM
 * RESEND_AUDIENCE_ID (optional)
 */

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function json(res, status, body) {
  res.status(status).setHeader('Cache-Control', 'no-store');
  return res.status(status).json(body);
}

function cleanName(value) {
  return String(value || '').trim().replace(/\s+/g, ' ').slice(0, 100);
}

function cleanEmail(value) {
  return String(value || '').trim().toLowerCase().slice(0, 320);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

async function supabase(path, options = {}) {
  const url = `${process.env.SUPABASE_URL}${path}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });

  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch {}

  if (!response.ok) {
    const message = data?.message || data?.hint || data?.error || text || 'Supabase request failed.';
    const error = new Error(message);
    error.status = response.status;
    throw error;
  }

  return data;
}

async function sendConfirmationEmail({ name, email, waitlistNumber, confirmationCode }) {
  const from = process.env.EMAIL_FROM;
  if (!process.env.RESEND_API_KEY || !from) {
    throw new Error('Email service is not configured.');
  }

  const displayNumber = `#${String(waitlistNumber).padStart(4, '0')}`;
  const safeName = escapeHtml(name);
  const safeNumber = escapeHtml(displayNumber);
  const safeCode = escapeHtml(confirmationCode);

  const html = `
  <!doctype html>
  <html>
    <body style="margin:0;background:#f6f7f9;font-family:Arial,sans-serif;color:#111827;">
      <div style="max-width:600px;margin:40px auto;background:#fff;border-radius:20px;padding:40px;">
        <div style="font-size:28px;font-weight:800;letter-spacing:-1px;">RISE</div>
        <p style="font-size:16px;">Hi ${safeName},</p>
        <h1 style="font-size:30px;margin:18px 0 10px;">You're officially on the waitlist.</h1>
        <p style="font-size:16px;line-height:1.6;color:#4b5563;">
          Thanks for joining RISE — Become 1% Better Every Day.
        </p>

        <div style="margin:28px 0;padding:24px;border-radius:16px;background:#f3f4f6;">
          <div style="font-size:13px;color:#6b7280;text-transform:uppercase;letter-spacing:1px;">
            Your waitlist number
          </div>
          <div style="font-size:38px;font-weight:800;margin-top:5px;">${safeNumber}</div>

          <div style="margin-top:20px;font-size:13px;color:#6b7280;text-transform:uppercase;letter-spacing:1px;">
            Confirmation code
          </div>
          <div style="font-size:24px;font-weight:700;margin-top:5px;letter-spacing:2px;">
            ${safeCode}
          </div>
        </div>

        <p style="font-size:14px;line-height:1.6;color:#6b7280;">
          Keep this email — your confirmation code can be used to verify your RISE waitlist entry.
        </p>
        <p style="font-size:14px;color:#6b7280;">— The RISE Team</p>
      </div>
    </body>
  </html>`;

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from,
      to: [email],
      subject: `You're #${String(waitlistNumber).padStart(4, '0')} on the RISE waitlist`,
      html
    })
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Email service failed: ${text || response.statusText}`);
  }

  return response.json();
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return json(res, 405, { success: false, message: 'Method not allowed.' });
  }

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return json(res, 500, { success: false, message: 'Waitlist database is not configured.' });
  }

  try {
    const name = cleanName(req.body?.name);
    const email = cleanEmail(req.body?.email);

    if (name.length < 2) {
      return json(res, 400, { success: false, message: 'Please enter your name.' });
    }

    if (!EMAIL_REGEX.test(email)) {
      return json(res, 400, { success: false, message: 'Please enter a valid email address.' });
    }

    // One permanent number/code is created by the database function.
    const result = await supabase('/rest/v1/rpc/register_waitlist', {
      method: 'POST',
      body: JSON.stringify({ p_name: name, p_email: email })
    });

    const row = Array.isArray(result) ? result[0] : result;

    if (!row?.success) {
      return json(res, 409, {
        success: false,
        message: row?.message || 'That email is already on the RISE waitlist.'
      });
    }

    try {
      await sendConfirmationEmail({
        name,
        email,
        waitlistNumber: row.waitlist_number,
        confirmationCode: row.confirmation_code
      });
    } catch (emailError) {
      console.error('RISE email error:', emailError);
      // The signup is already safely stored. Tell the frontend to retry email delivery later.
      return json(res, 202, {
        success: true,
        waitlistNumber: row.waitlist_number,
        confirmationCode: row.confirmation_code,
        emailSent: false,
        message: 'You are on the waitlist, but the confirmation email could not be sent yet.'
      });
    }

    return json(res, 200, {
      success: true,
      waitlistNumber: row.waitlist_number,
      confirmationCode: row.confirmation_code,
      emailSent: true
    });
  } catch (error) {
    console.error('RISE waitlist API error:', error);
    return json(res, 500, {
      success: false,
      message: 'Something went wrong. Please try again.'
    });
  }
};
