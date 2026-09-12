'use strict';

const { createClient } = require('@supabase/supabase-js');
const { Resend } = require('resend');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  }
);

const resend = new Resend(process.env.RESEND_API_KEY);

const FROM_EMAIL =
  process.env.RESEND_FROM_EMAIL || 'RISE <hello@riseapp.co>';

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function cleanName(name) {
  return String(name || '')
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, 100);
}

function generateConfirmationCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

  let code = '';

  for (let i = 0; i < 6; i++) {
    code += alphabet[Math.floor(Math.random() * alphabet.length)];
  }

  return `RISE-${code}`;
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function emailHTML({ name, waitlistNumber, confirmationCode }) {
  const safeName = name
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Your RISE Waitlist Confirmation</title>
</head>

<body style="
  margin:0;
  padding:0;
  background:#0A0A0A;
  font-family:Arial,Helvetica,sans-serif;
  color:#ffffff;
">

  <div style="
    max-width:600px;
    margin:0 auto;
    padding:50px 24px;
  ">

    <div style="
      background:#111111;
      border:1px solid #262626;
      border-radius:20px;
      padding:40px 30px;
      text-align:center;
    ">

      <div style="
        font-size:32px;
        font-weight:800;
        letter-spacing:4px;
        margin-bottom:25px;
      ">
        RISE
      </div>

      <div style="
        color:#22C55E;
        font-size:14px;
        font-weight:700;
        letter-spacing:2px;
        text-transform:uppercase;
        margin-bottom:12px;
      ">
        You're officially in
      </div>

      <h1 style="
        font-size:30px;
        line-height:1.2;
        margin:0 0 18px;
      ">
        Welcome to RISE, ${safeName}.
      </h1>

      <p style="
        color:#A3A3A3;
        font-size:16px;
        line-height:1.7;
      ">
        Your spot on the RISE waitlist has been successfully reserved.
      </p>

      <div style="
        margin:30px 0;
        padding:25px;
        background:#0A0A0A;
        border:1px solid #262626;
        border-radius:16px;
      ">

        <div style="
          color:#A3A3A3;
          font-size:13px;
          text-transform:uppercase;
          letter-spacing:1px;
          margin-bottom:8px;
        ">
          Your Waitlist Number
        </div>

        <div style="
          color:#22C55E;
          font-size:42px;
          font-weight:800;
          margin-bottom:25px;
        ">
          #${String(waitlistNumber).padStart(4, '0')}
        </div>

        <div style="
          color:#A3A3A3;
          font-size:13px;
          text-transform:uppercase;
          letter-spacing:1px;
          margin-bottom:8px;
        ">
          Confirmation Code
        </div>

        <div style="
          font-size:24px;
          font-weight:700;
          letter-spacing:2px;
        ">
          ${confirmationCode}
        </div>

      </div>

      <p style="
        color:#A3A3A3;
        font-size:14px;
        line-height:1.6;
      ">
        Keep your confirmation code somewhere safe. We'll use your
        waitlist number to determine your place in line for early access.
      </p>

      <div style="
        margin-top:30px;
        padding-top:25px;
        border-top:1px solid #262626;
        color:#737373;
        font-size:13px;
      ">
        Become 1% Better Every Day.
      </div>

    </div>

    <p style="
      text-align:center;
      color:#525252;
      font-size:12px;
      margin-top:25px;
    ">
      © 2026 RISE
    </p>

  </div>

</body>
</html>
`;
}

async function sendConfirmation(row) {
  const result = await resend.emails.send({
    from: FROM_EMAIL,
    to: [row.email],
    subject: `You're #${row.waitlist_number} on the RISE waitlist`,
    html: emailHTML({
      name: row.name,
      waitlistNumber: row.waitlist_number,
      confirmationCode: row.confirmation_code
    })
  });

  if (result.error) {
    throw new Error(result.error.message || 'Email could not be sent.');
  }

  return result;
}

module.exports = async function handler(req, res) {

  if (req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      message: 'Method not allowed.'
    });
  }

  try {

    let body = req.body;

    if (typeof body === 'string') {
      try {
        body = JSON.parse(body);
      } catch {
        return res.status(400).json({
          success: false,
          message: 'Invalid request.'
        });
      }
    }

    const name = cleanName(body?.name);
    const email = normalizeEmail(body?.email);

    if (!name || name.length < 2) {
      return res.status(400).json({
        success: false,
        message: 'Please enter your name.'
      });
    }

    if (name.length > 100) {
      return res.status(400).json({
        success: false,
        message: 'Your name is too long.'
      });
    }

    if (!isValidEmail(email) || email.length > 254) {
      return res.status(400).json({
        success: false,
        message: 'Please enter a valid email address.'
      });
    }

    // ------------------------------------------------------------
    // Check whether this email is already on the waitlist.
    // ------------------------------------------------------------

    const { data: existing, error: lookupError } = await supabase
      .from('waitlist')
      .select('*')
      .ilike('email', email)
      .maybeSingle();

    if (lookupError) {
      console.error('Supabase lookup error:', lookupError);

      return res.status(500).json({
        success: false,
        message: 'We could not check the waitlist. Please try again.'
      });
    }

    // ------------------------------------------------------------
    // Existing person
    // ------------------------------------------------------------

    if (existing) {

      let emailSent = existing.email_status === 'sent';

      // If their email wasn't successfully sent before,
      // try sending it again.
      if (!emailSent) {
        try {

          await sendConfirmation(existing);

          await supabase
            .from('waitlist')
            .update({
              email_status: 'sent',
              email_sent_at: new Date().toISOString(),
              last_email_error: null
            })
            .eq('waitlist_number', existing.waitlist_number);

          emailSent = true;

        } catch (emailError) {

          console.error('Existing-user email error:', emailError);

          await supabase
            .from('waitlist')
            .update({
              email_status: 'failed',
              last_email_error: String(emailError.message || emailError)
            })
            .eq('waitlist_number', existing.waitlist_number);
        }
      }

      return res.status(200).json({
        success: true,
        alreadyJoined: true,
        waitlistNumber: existing.waitlist_number,
        confirmationCode: existing.confirmation_code,
        emailSent
      });
    }

    // ------------------------------------------------------------
    // Get next waitlist number.
    // ------------------------------------------------------------

    const { data: numberData, error: numberError } = await supabase
      .rpc('get_or_create_waitlist_number');

    if (numberError) {
      console.error('Waitlist number error:', numberError);

      return res.status(500).json({
        success: false,
        message: 'We could not reserve your waitlist number.'
      });
    }

    const waitlistNumber = Number(numberData);

    // ------------------------------------------------------------
    // Create unique confirmation code.
    // ------------------------------------------------------------

    let confirmationCode = null;
    let newRow = null;

    for (let attempt = 0; attempt < 5; attempt++) {

      const candidate = generateConfirmationCode();

      const { data, error } = await supabase
        .from('waitlist')
        .insert({
          waitlist_number: waitlistNumber,
          name,
          email,
          confirmation_code: candidate,
          email_status: 'pending'
        })
        .select('*')
        .single();

      if (!error) {
        confirmationCode = candidate;
        newRow = data;
        break;
      }

      // Unique confirmation code collision.
      if (error.code === '23505') {
        continue;
      }

      // Email race condition.
      if (error.code === '23505') {
        const { data: duplicate } = await supabase
          .from('waitlist')
          .select('*')
          .ilike('email', email)
          .maybeSingle();

        if (duplicate) {
          return res.status(200).json({
            success: true,
            alreadyJoined: true,
            waitlistNumber: duplicate.waitlist_number,
            confirmationCode: duplicate.confirmation_code,
            emailSent: duplicate.email_status === 'sent'
          });
        }
      }

      console.error('Waitlist insert error:', error);

      return res.status(500).json({
        success: false,
        message: 'We could not save your waitlist spot.'
      });
    }

    if (!newRow) {
      return res.status(500).json({
        success: false,
        message: 'Could not generate a confirmation code. Please try again.'
      });
    }

    // ------------------------------------------------------------
    // Send confirmation email.
    // ------------------------------------------------------------

    let emailSent = false;

    try {

      await sendConfirmation(newRow);

      await supabase
        .from('waitlist')
        .update({
          email_status: 'sent',
          email_sent_at: new Date().toISOString(),
          last_email_error: null
        })
        .eq('waitlist_number', waitlistNumber);

      emailSent = true;

    } catch (emailError) {

      console.error('New-user email error:', emailError);

      await supabase
        .from('waitlist')
        .update({
          email_status: 'failed',
          last_email_error: String(emailError.message || emailError)
        })
        .eq('waitlist_number', waitlistNumber);
    }

    return res.status(200).json({
      success: true,
      alreadyJoined: false,
      waitlistNumber,
      confirmationCode,
      emailSent
    });

  } catch (error) {

    console.error('Unexpected waitlist error:', error);

    return res.status(500).json({
      success: false,
      message: 'Something went wrong. Please try again.'
    });
  }
};