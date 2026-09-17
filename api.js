// api/waitlist.js

export default async function handler(req, res) {
  // ============================================================
  // METHOD
  // ============================================================

  if (req.method !== "POST") {
    return res.status(405).json({
      success: false,
      error: "Method not allowed.",
    });
  }

  // ============================================================
  // ENVIRONMENT VARIABLES
  // ============================================================

  const {
    RESEND_API_KEY,
    RISE_ADMIN_EMAIL,
    RESEND_FROM_EMAIL,
    SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY,
  } = process.env;

  // ============================================================
  // CONFIGURATION CHECKS
  // ============================================================

  if (!RESEND_API_KEY) {
    return res.status(500).json({
      success: false,
      error: "RESEND_API_KEY is not configured.",
    });
  }

  if (!RISE_ADMIN_EMAIL) {
    return res.status(500).json({
      success: false,
      error: "RISE_ADMIN_EMAIL is not configured.",
    });
  }

  if (!SUPABASE_URL) {
    return res.status(500).json({
      success: false,
      error: "SUPABASE_URL is not configured.",
    });
  }

  if (!SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(500).json({
      success: false,
      error: "SUPABASE_SERVICE_ROLE_KEY is not configured.",
    });
  }

  // ============================================================
  // REQUEST DATA
  // ============================================================

  const {
    name,
    email,
    resendConfirmation = true,
  } = req.body || {};

  const cleanName =
    typeof name === "string"
      ? name.trim()
      : "";

  const cleanEmail =
    typeof email === "string"
      ? email.trim().toLowerCase()
      : "";

  // ============================================================
  // VALIDATION
  // ============================================================

  if (cleanName.length < 2) {
    return res.status(400).json({
      success: false,
      error: "Please enter a valid name.",
    });
  }

  const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  if (!EMAIL_REGEX.test(cleanEmail)) {
    return res.status(400).json({
      success: false,
      error: "Please enter a valid email address.",
    });
  }

  // ============================================================
  // SUPABASE REQUEST HELPER
  // ============================================================

  async function supabaseRequest(endpoint, options = {}) {
    const response = await fetch(
      `${SUPABASE_URL}/rest/v1/${endpoint}`,
      {
        ...options,
        headers: {
          apikey: SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          "Content-Type": "application/json",
          ...options.headers,
        },
      }
    );

    const text = await response.text();

    let data = null;

    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = text;
    }

    if (!response.ok) {
      throw new Error(
        `Supabase ${response.status}: ${
          data?.message ||
          data?.hint ||
          data?.details ||
          JSON.stringify(data)
        }`
      );
    }

    return data;
  }

  // ============================================================
  // MAIN LOGIC
  // ============================================================

  try {
    // ----------------------------------------------------------
    // CHECK EXISTING EMAIL
    // ----------------------------------------------------------
    //
    // IMPORTANT:
    // We only select columns that actually exist in your table.
    // There is NO id and NO created_at here.
    // ----------------------------------------------------------

    const existing = await supabaseRequest(
      `waitlist?email=eq.${encodeURIComponent(
        cleanEmail
      )}&select=waitlist_number,name,email,confirmation_code,joined_at`
    );

    // ----------------------------------------------------------
    // EXISTING USER
    // ----------------------------------------------------------

    if (Array.isArray(existing) && existing.length > 0) {
      const existingUser = existing[0];

      const waitlistNumber = Number(
        existingUser.waitlist_number
      );

      // Safety check
      if (!Number.isFinite(waitlistNumber)) {
        console.error(
          "EXISTING USER HAS INVALID WAITLIST NUMBER:",
          existingUser
        );

        return res.status(500).json({
          success: false,
          error:
            "Your waitlist record exists, but its waitlist number is invalid. Please contact RISE support.",
        });
      }

      let emailSent = false;

      // --------------------------------------------------------
      // RESEND EXISTING CONFIRMATION
      // --------------------------------------------------------

      if (resendConfirmation !== false) {
        try {
          await sendEmail({
            apiKey: RESEND_API_KEY,
            from:
              RESEND_FROM_EMAIL ||
              "RISE <onboarding@resend.dev>",
            to: cleanEmail,
            subject:
              `Your RISE Waitlist Confirmation — #${String(
                waitlistNumber
              ).padStart(4, "0")}`,
            html: userEmailHTML({
              name: existingUser.name,
              waitlistNumber,
              confirmationCode:
                existingUser.confirmation_code,
              existing: true,
            }),
          });

          emailSent = true;
        } catch (error) {
          console.error(
            "EXISTING USER EMAIL ERROR:",
            error?.message || error
          );
        }
      }

      return res.status(200).json({
        success: true,
        alreadyJoined: true,
        emailSent,
        waitlistNumber,
        confirmationCode:
          existingUser.confirmation_code,
        message:
          "This email is already on the RISE waitlist.",
      });
    }

    // ----------------------------------------------------------
    // CREATE CONFIRMATION CODE
    // ----------------------------------------------------------

    const confirmationCode =
      `RISE-${randomCode(8)}`;

    // ----------------------------------------------------------
    // GET NEXT WAITLIST NUMBER
    // ----------------------------------------------------------
    //
    // Your existing 44 people remain untouched.
    //
    // If the highest number is 44:
    // next person = 45
    //
    // ----------------------------------------------------------

    const latest = await supabaseRequest(
      "waitlist?select=waitlist_number&order=waitlist_number.desc&limit=1"
    );

    let nextNumber = 1;

    if (
      Array.isArray(latest) &&
      latest.length > 0 &&
      latest[0].waitlist_number != null
    ) {
      const highestNumber = Number(
        latest[0].waitlist_number
      );

      if (Number.isFinite(highestNumber)) {
        nextNumber = highestNumber + 1;
      }
    }

    // ----------------------------------------------------------
    // INSERT USER
    // ----------------------------------------------------------

    let inserted;

    try {
      inserted = await supabaseRequest(
        "waitlist",
        {
          method: "POST",

          headers: {
            Prefer: "return=representation",
          },

          body: JSON.stringify({
            name: cleanName,
            email: cleanEmail,
            waitlist_number: nextNumber,
            confirmation_code: confirmationCode,
          }),
        }
      );
    } catch (error) {
      console.error(
        "SUPABASE INSERT ERROR:",
        error?.message || error
      );

      // Handle duplicate email safely in case two requests
      // happen at nearly the same time.
      try {
        const duplicate = await supabaseRequest(
          `waitlist?email=eq.${encodeURIComponent(
            cleanEmail
          )}&select=waitlist_number,name,email,confirmation_code,joined_at`
        );

        if (
          Array.isArray(duplicate) &&
          duplicate.length > 0
        ) {
          const duplicateUser = duplicate[0];

          return res.status(200).json({
            success: true,
            alreadyJoined: true,
            emailSent: false,
            waitlistNumber: Number(
              duplicateUser.waitlist_number
            ),
            confirmationCode:
              duplicateUser.confirmation_code,
            message:
              "This email is already on the RISE waitlist.",
          });
        }
      } catch (duplicateCheckError) {
        console.error(
          "DUPLICATE CHECK ERROR:",
          duplicateCheckError?.message ||
            duplicateCheckError
        );
      }

      return res.status(500).json({
        success: false,
        error:
          "We couldn't save your waitlist signup. Please try again.",
      });
    }

    if (
      !Array.isArray(inserted) ||
      inserted.length === 0
    ) {
      return res.status(500).json({
        success: false,
        error:
          "The waitlist signup could not be created.",
      });
    }

    const user = inserted[0];

    const waitlistNumber = Number(
      user.waitlist_number
    );

    if (!Number.isFinite(waitlistNumber)) {
      console.error(
        "INSERTED USER HAS INVALID WAITLIST NUMBER:",
        user
      );

      return res.status(500).json({
        success: false,
        error:
          "Your signup was saved, but the waitlist number could not be read.",
      });
    }

    // ==========================================================
    // SEND USER EMAIL
    // ==========================================================

    let userEmailSent = false;

    if (resendConfirmation !== false) {
      try {
        await sendEmail({
          apiKey: RESEND_API_KEY,

          from:
            RESEND_FROM_EMAIL ||
            "RISE <onboarding@resend.dev>",

          to: cleanEmail,

          subject:
            `You're #${String(
              waitlistNumber
            ).padStart(4, "0")} on the RISE waitlist 🚀`,

          html: userEmailHTML({
            name: cleanName,
            waitlistNumber,
            confirmationCode,
            existing: false,
          }),
        });

        userEmailSent = true;
      } catch (error) {
        console.error(
          "USER EMAIL ERROR:",
          error?.message || error
        );
      }
    }

    // ==========================================================
    // SEND ADMIN EMAIL
    // ==========================================================

    let adminEmailSent = false;

    try {
      await sendEmail({
        apiKey: RESEND_API_KEY,

        from:
          RESEND_FROM_EMAIL ||
          "RISE <onboarding@resend.dev>",

        to: RISE_ADMIN_EMAIL,

        subject:
          `New RISE Waitlist Signup — #${String(
            waitlistNumber
          ).padStart(4, "0")}`,

        html: adminEmailHTML({
          name: cleanName,
          email: cleanEmail,
          waitlistNumber,
          confirmationCode,
        }),
      });

      adminEmailSent = true;
    } catch (error) {
      console.error(
        "ADMIN EMAIL ERROR:",
        error?.message || error
      );
    }

    // ==========================================================
    // LOG
    // ==========================================================

    console.log(
      "NEW RISE WAITLIST SIGNUP:",
      JSON.stringify(
        {
          waitlistNumber,
          email: cleanEmail,
          userEmailSent,
          adminEmailSent,
        },
        null,
        2
      )
    );

    // ==========================================================
    // RESPONSE TO WEBSITE
    // ==========================================================

    return res.status(200).json({
      success: true,
      alreadyJoined: false,
      emailSent: userEmailSent,
      adminEmailSent,
      waitlistNumber,
      confirmationCode,
      message:
        "You are officially on the RISE waitlist.",
    });
  } catch (error) {
    console.error(
      "WAITLIST API ERROR:",
      error?.message || error
    );

    return res.status(500).json({
      success: false,
      error:
        "Something went wrong. Please try again.",
    });
  }
}

// ============================================================
// RESEND EMAIL
// ============================================================

async function sendEmail({
  apiKey,
  from,
  to,
  subject,
  html,
}) {
  const response = await fetch(
    "https://api.resend.com/emails",
    {
      method: "POST",

      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },

      body: JSON.stringify({
        from,
        to: [to],
        subject,
        html,
      }),
    }
  );

  const text = await response.text();

  let data = null;

  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }

  if (!response.ok) {
    throw new Error(
      `Resend ${response.status}: ${
        data?.message ||
        data?.name ||
        JSON.stringify(data)
      }`
    );
  }

  return data;
}

// ============================================================
// CONFIRMATION CODE
// ============================================================

function randomCode(length) {
  const characters =
    "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

  let result = "";

  for (let i = 0; i < length; i++) {
    result +=
      characters[
        Math.floor(
          Math.random() * characters.length
        )
      ];
  }

  return result;
}

// ============================================================
// USER EMAIL
// ============================================================

function userEmailHTML({
  name,
  waitlistNumber,
  confirmationCode,
  existing,
}) {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta
    name="viewport"
    content="width=device-width, initial-scale=1.0"
  >
  <title>RISE Waitlist</title>
</head>

<body style="
  margin:0;
  padding:40px 20px;
  background:#f5f5f5;
  font-family:Arial,Helvetica,sans-serif;
">

<div style="
  max-width:600px;
  margin:auto;
  background:#ffffff;
  padding:40px;
  border-radius:18px;
">

<h1 style="
  font-size:38px;
  margin:0 0 8px;
">
  RISE
</h1>

<p style="
  font-size:18px;
">
  Become 1% Better Every Day.
</p>

<h2>
  ${
    existing
      ? "You're already on the list."
      : "You're officially on the waitlist!"
  }
</h2>

<p>
  Hey ${escapeHTML(name)},
</p>

<p>
  ${
    existing
      ? "We found your existing RISE waitlist registration."
      : "Thanks for joining RISE. You're officially part of the early community."
  }
</p>

<div style="
  background:#f5f5f5;
  padding:25px;
  border-radius:14px;
  margin:25px 0;
">

<p style="margin:0 0 8px;">
  <strong>Your Waitlist Number</strong>
</p>

<p style="
  font-size:34px;
  font-weight:bold;
  margin:0 0 25px;
">
  #${String(waitlistNumber).padStart(4, "0")}
</p>

<p style="margin:0 0 8px;">
  <strong>Confirmation Code</strong>
</p>

<p style="
  font-size:20px;
  font-weight:bold;
  margin:0;
">
  ${escapeHTML(confirmationCode)}
</p>

</div>

<p>
  Keep this email for your records.
</p>

<p style="
  color:#777;
  font-size:13px;
  margin-top:35px;
">
  RISE — Become 1% Better Every Day.
</p>

</div>

</body>
</html>
`;
}

// ============================================================
// ADMIN EMAIL
// ============================================================

function adminEmailHTML({
  name,
  email,
  waitlistNumber,
  confirmationCode,
}) {
  return `
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

<h1>
  New RISE Waitlist Signup 🚀
</h1>

<hr>

<p>
  <strong>Waitlist #:</strong>
  #${String(waitlistNumber).padStart(4, "0")}
</p>

<p>
  <strong>Name:</strong>
  ${escapeHTML(name)}
</p>

<p>
  <strong>Email:</strong>
  ${escapeHTML(email)}
</p>

<p>
  <strong>Confirmation Code:</strong>
  ${escapeHTML(confirmationCode)}
</p>

<hr>

<p>
  New person just joined the RISE waitlist.
</p>

</div>

</body>
</html>
`;
}

// ============================================================
// HTML ESCAPING
// ============================================================

function escapeHTML(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}