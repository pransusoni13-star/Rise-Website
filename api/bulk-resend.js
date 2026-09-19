const { createClient } = require('@supabase/supabase-js');
const { Resend } = require('resend');

const { timingSafeEqual } = require('node:crypto');

const FROM_EMAIL =
  process.env.RESEND_FROM_EMAIL ||
  process.env.RISE_FROM_EMAIL ||
  process.env.EMAIL_FROM ||
  'RISE <onboarding@resend.dev>';

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function buildEmailHtml({ name, waitlistNumber, confirmationCode }) {
  const safeName = escapeHtml(name || '');
  const safeCode = escapeHtml(confirmationCode || '');
  const safeNumber = escapeHtml(String(waitlistNumber));

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Welcome to RISE</title>
</head>
<body style="margin:0; padding:0; background:#0a0a0a; font-family:Arial,Helvetica,sans-serif; color:#ffffff;">
  <div style="max-width:600px; margin:0 auto; padding:40px 20px;">
    <div style="background:#111111; border:1px solid #252525; border-radius:20px; padding:40px 30px;">
      <div style="font-size:34px; font-weight:800; color:#5cff7a; margin-bottom:30px;">RISE</div>
      <h1 style="margin:0 0 15px 0; font-size:30px; line-height:1.2;">You're officially on the list.</h1>
      <p style="color:#b5b5b5; font-size:16px; line-height:1.6;">Hey ${safeName},</p>
      <p style="color:#b5b5b5; font-size:16px; line-height:1.6;">Welcome to RISE — the system designed to help you become 1% better every day.</p>
      <div style="margin:30px 0; padding:25px; background:#181818; border-radius:16px;">
        <p style="margin:0 0 10px 0; color:#8f8f8f; font-size:13px; text-transform:uppercase; letter-spacing:1px;">Your waitlist number</p>
        <div style="font-size:40px; font-weight:800; color:#5cff7a;">#${safeNumber}</div>
      </div>
      <div style="margin:30px 0; padding:25px; background:#181818; border-radius:16px;">
        <p style="margin:0 0 10px 0; color:#8f8f8f; font-size:13px; text-transform:uppercase; letter-spacing:1px;">Confirmation code</p>
        <div style="font-size:24px; font-weight:700; letter-spacing:2px; color:#ffffff;">${safeCode}</div>
      </div>
      <p style="color:#8f8f8f; font-size:14px; line-height:1.6;">Keep this confirmation code somewhere safe. You'll be able to use it to verify your place on the RISE waitlist.</p>
      <p style="margin-top:35px; color:#ffffff; font-size:16px;">Keep rising.</p>
      <p style="color:#5cff7a; font-weight:700;">— The RISE Team</p>
    </div>
  </div>
</body>
</html>`;
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      message: 'Method not allowed.'
    });
  }

  const expected = process.env.BULK_RESEND_TOKEN;
  const supplied = req.headers.authorization || '';
  if (!expected || supplied.length !== `Bearer ${expected}`.length ||
      !timingSafeEqual(Buffer.from(supplied), Buffer.from(`Bearer ${expected}`))) {
    return res.status(401).json({ success: false, message: 'Unauthorized.' });
  }

  try {
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return res.status(500).json({
        success: false,
        message: 'Supabase environment variables are missing.'
      });
    }

    if (!process.env.RESEND_API_KEY) {
      return res.status(500).json({
        success: false,
        message: 'Resend API key is missing.'
      });
    }

    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    const resend = new Resend(process.env.RESEND_API_KEY);
    const { data: users, error: usersError } = await supabase
      .from('waitlist')
      .select('waitlist_number, name, email, confirmation_code, email_status')
      .order('waitlist_number', { ascending: true });

    if (usersError) {
      throw usersError;
    }

    const results = [];

    for (const user of users || []) {
      const { data, error } = await resend.emails.send({
        from: FROM_EMAIL,
        to: [user.email],
        subject: `You're #${user.waitlist_number} on the RISE waitlist`,
        html: buildEmailHtml({
          name: user.name,
          waitlistNumber: user.waitlist_number,
          confirmationCode: user.confirmation_code
        })
      });

      if (error) {
        console.error(`Failed to send to ${user.email}:`, error);

        await supabase
          .from('waitlist')
          .update({
            email_status: 'failed',
            last_email_error:
              typeof error === 'string'
                ? error
                : JSON.stringify(error)
          })
          .eq('email', user.email);

        results.push({
          email: user.email,
          success: false,
          error: typeof error === 'string' ? error : error?.message || 'Unknown error'
        });
        continue;
      }

      await supabase
        .from('waitlist')
        .update({
          email_status: 'sent',
          email_sent_at: new Date().toISOString(),
          last_email_error: null
        })
        .eq('email', user.email);

      results.push({
        email: user.email,
        success: true,
        resendId: data?.id || null
      });
    }

    const sent = results.filter((item) => item.success).length;
    const failed = results.filter((item) => !item.success).length;

    return res.status(200).json({
      success: true,
      processed: results.length,
      sent,
      failed,
      results
    });
  } catch (error) {
    console.error('Bulk resend error:', error);
    return res.status(500).json({
      success: false,
      message: 'Bulk resend failed.',
      error: error?.message || 'Unknown error'
    });
  }
};
