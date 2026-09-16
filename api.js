// api/waitlist.js

export default async function handler(req, res) {
  // ------------------------------------------------------------
  // 1. Only allow POST
  // ------------------------------------------------------------

  if (req.method !== "POST") {
    return res.status(405).json({
      success: false,
      error: "Method not allowed.",
    });
  }

  // ------------------------------------------------------------
  // 2. Check API key
  // ------------------------------------------------------------

  const RESEND_API_KEY = process.env.RESEND_API_KEY;

  if (!RESEND_API_KEY) {
    console.error("RESEND_API_KEY is missing.");

    return res.status(500).json({
      success: false,
      error: "Email service is not configured.",
    });
  }

  // ------------------------------------------------------------
  // 3. Get request data
  // ------------------------------------------------------------

  const {
    name,
    email,
    resendConfirmation = true,
  } = req.body || {};

  // ------------------------------------------------------------
  // 4. Validate name
  // ------------------------------------------------------------

  if (
    typeof name !== "string" ||
    name.trim().length < 2
  ) {
    return res.status(400).json({
      success: false,
      error: "Please enter a valid name.",
    });
  }

  // ------------------------------------------------------------
  // 5. Validate email
  // ------------------------------------------------------------

  if (typeof email !== "string") {
    return res.status(400).json({
      success: false,
      error: "Please enter a valid email address.",
    });
  }

  const cleanName = name.trim();
  const cleanEmail = email.trim().toLowerCase();

  const EMAIL_REGEX =
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  if (!EMAIL_REGEX.test(cleanEmail)) {
    return res.status(400).json({
      success: false,
      error: "Please enter a valid email address.",
    });
  }

  // ------------------------------------------------------------
  // 6. Generate waitlist information
  //
  // IMPORTANT:
  // Replace this with your database logic later.
  // For now, this generates a number/code for the signup.
  // ------------------------------------------------------------

  const waitlistNumber =
    Math.floor(1000 + Math.random() * 9000);

  const confirmationCode =
    `RISE-${Math.random()
      .toString(36)
      .substring(2, 8)
      .toUpperCase()}`;

  // ------------------------------------------------------------
  // 7. Email addresses
  //
  // IMPORTANT:
  // Change these to your verified Resend addresses.
  // ------------------------------------------------------------

  const FROM_EMAIL =
    process.env.RISE_FROM_EMAIL ||
    "RISE <onboarding@resend.dev>";

  const ADMIN_EMAIL =
    process.env.RISE_ADMIN_EMAIL;

  if (!ADMIN_EMAIL) {
    console.error(
      "RISE_ADMIN_EMAIL is missing."
    );

    return res.status(500).json({
      success: false,
      error: "Admin email is not configured.",
    });
  }

  // ------------------------------------------------------------
  // 8. Helper to send email through Resend
  // ------------------------------------------------------------

  async function sendEmail({
    to,
    subject,
    html,
  }) {
    const response = await fetch(
      "https://api.resend.com/emails",
      {
        method: "POST",

        headers: {
          Authorization:
            `Bearer ${RESEND_API_KEY}`,

          "Content-Type":
            "application/json",
        },

        body: JSON.stringify({
          from: FROM_EMAIL,
          to: [to],
          subject,
          html,
        }),
      }
    );

    let data = null;

    try {
      data = await response.json();
    } catch {
      data = null;
    }

    if (!response.ok) {
      throw new Error(
        `Resend ${response.status}: ${
          data?.message ||
          data?.error ||
          JSON.stringify(data) ||
          "Unknown email error"
        }`
      );
    }

    return data;
  }

  // ------------------------------------------------------------
  // 9. User confirmation email
  // ------------------------------------------------------------

  const userEmailHTML = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Welcome to RISE</title>
</head>

<body style="
  margin:0;
  padding:0;
  background:#f5f5f5;
  font-family:Arial,Helvetica,sans-serif;
">

  <div style="
    max-width:600px;
    margin:40px auto;
    background:#ffffff;
    border-radius:16px;
    padding:40px;
  ">

    <h1 style="
      margin:0 0 10px;
      font-size:36px;
    ">
      RISE
    </h1>

    <p style="
      font-size:18px;
      margin-bottom:30px;
    ">
      Become 1% Better Every Day.
    </p>

    <h2>
      You're officially on the waitlist.
    </h2>

    <p>
      Hey ${escapeHTML(cleanName)},
    </p>

    <p>
      Thanks for joining RISE. You're now part
      of the early community building a better
      way to turn goals into real progress.
    </p>

    <div style="
      background:#f5f5f5;
      border-radius:12px;
      padding:20px;
      margin:25px 0;
    ">

      <p style="margin:0 0 10px;">
        <strong>Waitlist Number</strong>
      </p>

      <p style="
        font-size:30px;
        font-weight:bold;
        margin:0 0 20px;
      ">
        #${String(waitlistNumber).padStart(4, "0")}
      </p>

      <p style="margin:0 0 10px;">
        <strong>Confirmation Code</strong>
      </p>

      <p style="
        font-size:20px;
        font-weight:bold;
        margin:0;
      ">
        ${confirmationCode}
      </p>

    </div>

    <p>
      Keep your confirmation code somewhere safe.
    </p>

    <p style="
      margin-top:35px;
      color:#777;
      font-size:14px;
    ">
      RISE — Become 1% Better Every Day.
    </p>

  </div>

</body>
</html>
`;

  // ------------------------------------------------------------
  // 10. Admin notification email
  // ------------------------------------------------------------

  const adminEmailHTML = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>New RISE Waitlist Signup</title>
</head>

<body style="
  font-family:Arial,Helvetica,sans-serif;
  background:#f5f5f5;
  padding:30px;
">

  <div style="
    max-width:600px;
    margin:auto;
    background:white;
    padding:30px;
    border-radius:16px;
  ">

    <h1>New RISE Waitlist Signup 🚀</h1>

    <hr>

    <p>
      <strong>Name:</strong>
      ${escapeHTML(cleanName)}
    </p>

    <p>
      <strong>Email:</strong>
      ${escapeHTML(cleanEmail)}
    </p>

    <p>
      <strong>Waitlist Number:</strong>
      #${String(waitlistNumber).padStart(4, "0")}
    </p>

    <p>
      <strong>Confirmation Code:</strong>
      ${confirmationCode}
    </p>

    <hr>

    <p>
      Someone just joined the RISE waitlist.
    </p>

  </div>

</body>
</html>
`;

  // ------------------------------------------------------------
  // 11. Send both emails
  // ------------------------------------------------------------

  let userSent = false;
  let adminSent = false;

  let userResult = null;
  let adminResult = null;

  // USER EMAIL
  if (resendConfirmation !== false) {
    try {
      userResult = await sendEmail({
        to: cleanEmail,

        subject:
          "You're officially on the RISE waitlist 🚀",

        html: userEmailHTML,
      });

      userSent = true;

      console.log(
        "User confirmation email sent:",
        userResult
      );
    } catch (error) {
      console.error(
        "USER EMAIL ERROR:",
        error?.message || error
      );
    }
  }

  // ADMIN EMAIL
  try {
    adminResult = await sendEmail({
      to: ADMIN_EMAIL,

      subject:
        `New RISE Waitlist Signup — ${cleanName}`,

      html: adminEmailHTML,
    });

    adminSent = true;

    console.log(
      "Admin notification email sent:",
      adminResult
    );
  } catch (error) {
    console.error(
      "ADMIN EMAIL ERROR:",
      error?.message || error
    );
  }

  // ------------------------------------------------------------
  // 12. Log final email status
  // ------------------------------------------------------------

  console.log(
    "EMAIL DELIVERY RESULT:",
    JSON.stringify(
      {
        userSent,
        adminSent,
        userResult,
        adminResult,
      },
      null,
      2
    )
  );

  // ------------------------------------------------------------
  // 13. Return success to frontend
  // ------------------------------------------------------------

  return res.status(200).json({
    success: true,

    alreadyJoined: false,

    emailSent: userSent,

    adminEmailSent: adminSent,

    waitlistNumber,

    confirmationCode,

    message: userSent
      ? "You are officially on the RISE waitlist."
      : "You joined the RISE waitlist, but the confirmation email could not be sent.",
  });
}

// ------------------------------------------------------------
// HTML escaping
// Prevents user input from becoming HTML.
// ------------------------------------------------------------

function escapeHTML(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}