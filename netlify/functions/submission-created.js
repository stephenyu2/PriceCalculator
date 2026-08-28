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

// Office inbox that also gets a copy (BCC) of certain confirmations.
const OFFICE_EMAIL = process.env.OFFICE_EMAIL || 'launch@launchvalleytutoring.com';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Forms that intentionally do NOT send a confirmation.
// diagnostic-email-gate just unlocks the on-page test; a confirmation
// email would be noise while the person is mid-flow.
const SKIP_FORMS = ['diagnostic-email-gate'];

// Forms whose confirmation is also BCC'd to the office inbox, so we keep the
// same formatted summary + PDF the submitter gets (not just the plain Netlify
// dashboard notification). BCC keeps the internal address off the parent's copy.
const OFFICE_COPY_FORMS = ['diagnostic-results'];

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

  // Uploaded files (e.g. the diagnostic results PDF) come back as URLs in the
  // submission payload. Fetch and base64-encode them so they ride along as real
  // email attachments. Best-effort: a failed fetch just sends without the file.
  const attachments = await getAttachments(data);

  const body = { from: FROM, to: [to], reply_to: REPLY_TO, subject: msg.subject, html: msg.html };
  if (attachments.length) body.attachments = attachments;
  // Copy the office on select forms, unless the submitter already IS the office.
  if (OFFICE_COPY_FORMS.indexOf(formName) !== -1 && to.toLowerCase() !== OFFICE_EMAIL.toLowerCase()) {
    body.bcc = [OFFICE_EMAIL];
  }

  try {
    const res = await fetch(RESEND_ENDPOINT, {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + key,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
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

/* ---- attachments ---- */

// Form fields that hold an uploaded file (Netlify stores the file and puts its
// URL in payload.data[field]). Add a field name here to attach its upload.
const FILE_FIELDS = ['results-pdf'];
const MAX_ATTACHMENT_BYTES = 15 * 1024 * 1024; // Resend's ~40MB base64 cap; stay well under

async function getAttachments(data) {
  const out = [];
  for (let i = 0; i < FILE_FIELDS.length; i++) {
    const field = FILE_FIELDS[i];
    const url = (data[field] || '').trim();
    if (!/^https?:\/\//i.test(url)) continue;
    try {
      const res = await fetch(url);
      if (!res.ok) {
        console.log('submission-created: attachment fetch', res.status, 'for', field);
        continue;
      }
      const buf = Buffer.from(await res.arrayBuffer());
      if (!buf.length || buf.length > MAX_ATTACHMENT_BYTES) continue;
      out.push({ filename: fileName(url, field), content: buf.toString('base64') });
    } catch (e) {
      console.log('submission-created: attachment fetch failed', field, e && e.message);
    }
  }
  return out;
}

function fileName(url, field) {
  let name = '';
  try {
    name = decodeURIComponent(url.split('?')[0].split('/').pop() || '');
  } catch (e) { name = ''; }
  if (!name) name = field;
  if (!/\.[a-z0-9]+$/i.test(name)) name += '.pdf';
  return name;
}

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

function details(rows) {
  return rows ? '<table style="border-collapse:collapse;margin:0 0 16px;">' + rows + '</table>' : '';
}

function sectionLabel(text) {
  return '<div style="font-size:13px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:#111;margin:20px 0 8px;">' + esc(text) + '</div>';
}

// The diagnostic sends a per-standard tally like "3.OA.A.1: 2/3 · 3.OA.A.2: 1/2".
// Render it as a two-column table (standard, score) in the confirmation email.
function standardsBreakdown(str) {
  const raw = (str || '').trim();
  if (!raw) return '';
  const rows = raw.split('·').map(function (part) {
    const seg = part.trim();
    if (!seg) return '';
    const i = seg.lastIndexOf(':');
    if (i === -1) return row(seg, '');
    return row(seg.slice(0, i).trim(), seg.slice(i + 1).trim());
  }).join('');
  if (!rows) return '';
  return sectionLabel('Standards breakdown') +
    '<table style="border-collapse:collapse;margin:0 0 8px;">' + rows + '</table>';
}

// The diagnostic sends one line per missed/unanswered question. Render each as a
// list item; a single "None — all questions correct." line becomes a plain note.
function missedQuestions(str) {
  const raw = (str || '').trim();
  if (!raw) return '';
  const lines = raw.split('\n').map(function (l) { return l.trim(); }).filter(Boolean);
  if (!lines.length) return '';
  if (lines.length === 1 && /^none\b/i.test(lines[0])) {
    return sectionLabel('Questions to review') + p(esc(lines[0]));
  }
  const items = lines.map(function (l) {
    return '<li style="font-size:14px;line-height:1.6;color:#444;margin:0 0 8px;">' + esc(l) + '</li>';
  }).join('');
  return sectionLabel('Questions to review') +
    '<ul style="margin:0 0 16px;padding-left:20px;">' + items + '</ul>';
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
        p(hi(first) + 'we\'ve received your message and a member of our team will get back to you shortly. Here\'s what you sent:') +
        details(
          row('Subject of interest', d.subject) +
          row('Grade', d.grade) +
          row('Phone', d.phone)));

    case 'email-popup':
      return msg('Welcome to Launch Valley Tutoring',
        h1('Welcome') +
        p('Thanks for signing up. We\'ll send helpful study resources and updates your way. Reply any time with questions.'));

    case 'diag-signup':
      return msg('You\'re signed up for a diagnostic',
        h1('You\'re signed up') +
        p(hi(first) + 'thanks for signing up for a diagnostic. We\'ll be in touch with the details shortly. Here\'s what you selected:') +
        details(row('Test', d['test-selection'])));

    case 'diagnostic-results':
      return msg('Your diagnostic results',
        h1('We\'ve received your results') +
        p(hi(first) + 'thanks for completing your diagnostic. A tutor will review your results and follow up. If you downloaded your PDF report, keep it for your records. Here\'s the full summary:') +
        details(
          row('Subject', d.subject) +
          row('Grade', d.grade) +
          row('Level', d.level) +
          row('Score', d.score) +
          row('Percent', d.percent)) +
        standardsBreakdown(d['standards-breakdown']) +
        missedQuestions(d['missed-questions']));

    case 'tutoring-agreement':
      return msg('We received your Tutoring Services Agreement',
        h1('Agreement received') +
        p(hi(first) + 'thanks for accepting the Tutoring Services Agreement. This email confirms we\'ve recorded your acceptance. Keep it for your records.') +
        details(
          row('Parent/Guardian', d['full-name']) +
          row('Student', d['student-name'])));

    case 'auto-refill-enrollment':
      return msg('Your recurring plan is set up',
        h1('Your plan is set up') +
        p(hi(first) + 'thanks for enrolling in Automatic Refill. Your hours will top up automatically before you run low, so there\'s no payment link to chase. Here\'s what you set up:') +
        details(
          row('Student', d['student-name']) +
          row('Level', d.level) +
          row('Refill size', d['refill-hours']) +
          row('Price', d['refill-price']) +
          row('Sibling discount', d['sibling-discount'])) +
        p('We\'ll confirm your refill size and schedule shortly.'));

    case 'change-refill-size':
      return msg('Your refill change request is in',
        h1('Request received') +
        p(hi(first) + 'we\'ve received your request to change your refill size. We\'ll update your plan and confirm. Here\'s what you requested:') +
        details(
          row('Student', d['student-name']) +
          row('Level', d.level) +
          row('New refill size', d['new-refill-size']) +
          row('Tutor tier', d.tier) +
          row('Notes', d.notes)));

    case 'pause-auto-refill':
      return msg('Your plan request is in',
        h1('Request received') +
        p(hi(first) + 'we\'ve received your request and we\'ll take care of it and confirm. Here\'s what you asked for:') +
        details(
          row('Student', d['student-name']) +
          row('Request', d['request-type']) +
          row('Notes', d.notes)));

    case 'tutor-agreement':
      return msg('We received your Independent Contractor Agreement',
        h1('Agreement received') +
        p(hi(first) + 'thanks for signing the Independent Contractor Agreement. This email confirms we\'ve recorded your acceptance.') +
        details(
          row('Name', d['full-name']) +
          row('Signed', d['signature-date']) +
          row('Agreement version', d['agreement-version']) +
          row('Rate schedule version', d['rate-schedule-version'])));

    case 'tutor-subjects':
      return msg('We received your subject list',
        h1('Subjects received') +
        p(hi(first) + 'thanks for submitting the subjects you can teach. We\'ve recorded it. Here\'s what you sent:') +
        details(
          row('Verified', d['subjects-verified']) +
          row('Ready', d['subjects-ready']) +
          row('Backup', d['subjects-backup'])));

    case 'tutor-emergency-contact':
      return msg('We received your emergency contact',
        h1('Emergency contact received') +
        p(hi(first) + 'thanks, we\'ve recorded your emergency contact information. Here\'s what you sent:') +
        details(
          row('Contact', d['contact-name']) +
          row('Relationship', d['contact-relationship']) +
          row('Phone', d['contact-phone'])));

    case 'tutor-incident-report':
      return msg('We received your incident report',
        h1('Incident report received') +
        p(hi(first) + 'thank you for submitting an incident report. We\'ve received it and the appropriate person will follow up. Here\'s what you reported:') +
        details(
          row('Date', d['incident-date']) +
          row('Time', d['incident-time']) +
          row('Location', d.location) +
          row('Student', d['student-name']) +
          row('Injury', d.injury) +
          row('Parent notified', d['parent-notified']) +
          row('What happened', d['what-happened']) +
          row('What you did', d['what-you-did'])) +
        p('If this is an emergency, call 911. For an urgent safety concern, call Stephen at (818) 294-3292.'));

    case 'tutor-training-complete':
      return msg('Training recorded',
        h1('Training recorded') +
        p(hi(first) + 'thanks, we\'ve recorded your completed training. Keep this email for your records.') +
        details(
          row('Name', d['full-name']) +
          row('Signed', d['signature-date'])));

    default:
      return msg('We received your submission',
        p('Thanks, we\'ve received your submission and will be in touch shortly.'));
  }
}
