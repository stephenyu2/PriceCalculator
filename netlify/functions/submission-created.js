/* ============================================================
   Launch Valley Tutoring — form confirmation emails

   Netlify TRIGGERED function: a function named "submission-created"
   is invoked automatically after EVERY Netlify Forms submission,
   for every form on the site. We use it to email the submitter a
   confirmation of what they sent.

   How it works:
   - Netlify passes the submission as JSON on event.body; the form
     fields live under payload.data and the form name under
     payload.form_name.
   - getEmail() finds the submitter's address across the different
     field names our forms use (email, tutor-email, reporter-email,
     or anything else containing "email"). No email, no send.
   - SKIP_FORMS lists forms that should NOT get a confirmation.
   - buildMessage() has one tailored template per form; anything
     not listed gets a short generic acknowledgement.

   Setup (done once, in Netlify, not in code):
   - Resend account with a VERIFIED sending domain.
   - RESEND_API_KEY in the site's environment variables.
   - FROM_EMAIL set to an address on the verified domain
     (currently launch@contact.launchvalleytutoring.com).
   - Optional REPLY_TO override (defaults to the main inbox).
   Never put the key in front-end code.

   Dependency-free; uses the global fetch in Netlify's Node runtime.
   ============================================================ */

const RESEND_ENDPOINT = 'https://api.resend.com/emails';
const FROM = process.env.FROM_EMAIL || 'Launch Valley Tutoring <launch@contact.launchvalleytutoring.com>';
const REPLY_TO = process.env.REPLY_TO || 'launch@launchvalleytutoring.com';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Forms that intentionally do NOT send a confirmation.
// diagnostic-email-gate just unlocks the on-page test; a confirmation
// email would be noise while the person is mid-flow.
const SKIP_FORMS = ['diagnostic-email-gate'];

exports.handler = async function (event) {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.log('submission-created: RESEND_API_KEY not set, skipping confirmation email');
    return { statusCode: 200, body: 'no key' };
  }

  let payload;
  try {
    payload = JSON.parse(event.body).payload;
  } catch (e) {
    return { statusCode: 200, body: 'no payload' };
  }

  const data = (payload && payload.data) || {};
  const formName = (payload && payload.form_name) || data['form-name'] || '';

  if (SKIP_FORMS.indexOf(formName) !== -1) {
    return { statusCode: 200, body: 'skipped form' };
  }

  const to = getEmail(data);
  if (!to) {
    return { statusCode: 200, body: 'no valid email' };
  }

  const msg = buildMessage(formName, data);

  try {
    const res = await fetch(RESEND_ENDPOINT, {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + key,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ from: FROM, to: [to], reply_to: REPLY_TO, subject: msg.subject, html: msg.html })
    });
    if (!res.ok) {
      const body = await res.text();
      console.log('submission-created: Resend error', res.status, body, '(form:', formName + ')');
    }
  } catch (e) {
    console.log('submission-created: Resend request failed', e && e.message);
  }

  // Always 200: a failed confirmation email must not fail the submission.
  return { statusCode: 200, body: 'ok' };
};

/* ---- field helpers ---- */

function getEmail(data) {
  // Preferred field names first, then any key containing "email".
  const preferred = ['email', 'Email', 'tutor-email', 'reporter-email'];
  for (let i = 0; i < preferred.length; i++) {
    const v = (data[preferred[i]] || '').trim();
    if (EMAIL_RE.test(v)) return v;
  }
  for (const k in data) {
    if (/email/i.test(k)) {
      const v = (data[k] || '').trim();
      if (EMAIL_RE.test(v)) return v;
    }
  }
  return '';
}

function getFirstName(data) {
  const keys = [
    'studentFirstName', 'first-name', 'firstName',
    'parent-name', 'full-name', 'tutor-name', 'contact-name',
    'reporter-name', 'name'
  ];
  for (let i = 0; i < keys.length; i++) {
    const v = (data[keys[i]] || '').trim();
    if (v) return v.split(/\s+/)[0];
  }
  return '';
}

/* ---- html helpers ---- */

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
  });
}

function h1(text) {
  return '<h1 style="font-family:Georgia,serif;font-size:24px;color:#111;margin:0 0 12px;">' + text + '</h1>';
}

function p(text) {
  return '<p style="font-size:15px;line-height:1.6;color:#444;margin:0 0 16px;">' + text + '</p>';
}

function hi(first) {
  return first ? 'Hi ' + esc(first) + ', ' : '';
}

function row(label, val) {
  if (!val) return '';
  return '<tr>' +
    '<td style="padding:6px 16px 6px 0;color:#666;font-size:14px;">' + esc(label) + '</td>' +
    '<td style="padding:6px 0;color:#111;font-size:14px;font-weight:600;">' + esc(val) + '</td>' +
    '</tr>';
}

function wrap(inner) {
  return '' +
    '<div style="background:#f5f3ee;padding:32px 0;font-family:Inter,Arial,sans-serif;">' +
      '<div style="max-width:520px;margin:0 auto;background:#ffffff;border:1px solid #e2ddd4;border-radius:14px;padding:32px;">' +
        '<div style="font-family:Georgia,serif;font-size:20px;font-weight:700;color:#111;margin-bottom:20px;">Launch Valley Tutoring</div>' +
        inner +
        '<p style="font-size:13px;color:#888;margin-top:28px;">Questions? Call (818) 294-3292 or email launch@launchvalleytutoring.com.</p>' +
      '</div>' +
    '</div>';
}

function msg(subject, inner) {
  return { subject: subject, html: wrap(inner) };
}

/* ---- per-form templates ---- */

function buildMessage(formName, d) {
  const first = getFirstName(d);

  switch (formName) {
    case 'diagnostic-registration': {
      const rows =
        row('Test', d.testType) +
        row('Subject', d.subject) +
        row('Grade', d.grade) +
        row('Platform', d.platform) +
        row('Proctored', d.proctored) +
        row('Day', d.day) +
        row('Time', d.time) +
        row('Location', d.location);
      return msg('Your diagnostic test registration',
        h1('You\'re registered') +
        p(hi(first) + 'we\'ve received your diagnostic test registration. Here are the details:') +
        '<table style="border-collapse:collapse;margin:0 0 16px;">' + rows + '</table>' +
        p('If anything looks off, just reply to this email and we\'ll sort it out.'));
    }

    case 'lead-form':
      return msg('Thanks for reaching out',
        h1('Thanks for reaching out') +
        p(hi(first) + 'we\'ve received your message and a member of our team will get back to you shortly.'));

    case 'email-popup':
      return msg('Welcome to Launch Valley Tutoring',
        h1('Welcome') +
        p('Thanks for signing up. We\'ll send helpful study resources and updates your way. Reply any time with questions.'));

    case 'diag-signup':
      return msg('You\'re signed up for a diagnostic',
        h1('You\'re signed up') +
        p(hi(first) + 'thanks for signing up for an SAT/ACT diagnostic. We\'ll be in touch with the details shortly.'));

    case 'diagnostic-results':
      return msg('Your diagnostic results',
        h1('We\'ve received your results') +
        p(hi(first) + 'thanks for completing your diagnostic. A tutor will review your results and follow up. If you downloaded your PDF report, keep it for your records.'));

    case 'tutoring-agreement':
      return msg('We received your Tutoring Services Agreement',
        h1('Agreement received') +
        p(hi(first) + 'thanks for accepting the Tutoring Services Agreement. This email confirms we\'ve recorded your acceptance. Keep it for your records.'));

    case 'auto-refill-enrollment':
      return msg('Your recurring plan is set up',
        h1('Your plan is set up') +
        p(hi(first) + 'thanks for enrolling in Automatic Refill. Your hours will top up automatically before you run low, so there\'s no payment link to chase. We\'ll confirm your refill size and schedule shortly.'));

    case 'change-refill-size':
      return msg('Your refill change request is in',
        h1('Request received') +
        p(hi(first) + 'we\'ve received your request to change your refill size. We\'ll update your plan and confirm.'));

    case 'pause-auto-refill':
      return msg('Your plan request is in',
        h1('Request received') +
        p(hi(first) + 'we\'ve received your request to pause or resume your automatic refills. We\'ll take care of it and confirm.'));

    case 'tutor-agreement':
      return msg('We received your Independent Contractor Agreement',
        h1('Agreement received') +
        p(hi(first) + 'thanks for signing the Independent Contractor Agreement. This email confirms we\'ve recorded your acceptance.'));

    case 'tutor-subjects':
      return msg('We received your subject list',
        h1('Subjects received') +
        p(hi(first) + 'thanks for submitting the subjects you can teach. We\'ve recorded it.'));

    case 'tutor-emergency-contact':
      return msg('We received your emergency contact',
        h1('Emergency contact received') +
        p(hi(first) + 'thanks, we\'ve recorded your emergency contact information.'));

    case 'tutor-incident-report':
      return msg('We received your incident report',
        h1('Incident report received') +
        p(hi(first) + 'thank you for submitting an incident report. We\'ve received it and the appropriate person will follow up.') +
        p('If this is an emergency, call 911. For an urgent safety concern, call Stephen at (818) 294-3292.'));

    case 'tutor-training-complete':
      return msg('Training module recorded',
        h1('Training recorded') +
        p(hi(first) + 'thanks, we\'ve recorded your completed training. Keep this email for your records.'));

    default:
      return msg('We received your submission',
        p('Thanks, we\'ve received your submission and will be in touch shortly.'));
  }
}
