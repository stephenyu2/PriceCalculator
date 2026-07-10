/* ============================================================
   Launch Valley Tutoring — card-saving checkout (no charge)

   For EXISTING families migrating from legacy payment links to
   the prepaid-hours system. Creates a Stripe Checkout Session in
   SETUP mode: the parent enters their card, Stripe creates a
   Customer with the card saved for future off-session charges,
   and nothing is charged today.

   Setup mode notes:
   - There is no payment_intent_data and no setup_future_usage
     flag here; setup mode exists specifically to save a payment
     method for future off-session use, so that behavior is
     built in.
   - The payment method is only useful if it lands on a Customer,
     so we require customer creation. If Stripe rejects
     customer_creation for this API version, we fall back to
     creating the Customer first and attaching it to the session.

   The parent must have accepted the Tutoring Services Agreement
   (Section 4 authorization) BEFORE saving a card; the migration
   flow on the site enforces that ordering.

   Reads STRIPE_SECRET_KEY from Netlify environment variables.
   Never put that key in front-end code.
   ============================================================ */

const REFILL_SIZES = [
  'Academic, 10 hours',
  'Academic, 20 hours',
  'SAT/ACT, 5 hours',
  'SAT/ACT, 10 hours',
  'SAT/ACT, 20 hours'
];

function bad(message) {
  return { statusCode: 400, body: JSON.stringify({ error: message }) };
}

function toForm(obj, prefix, params) {
  params = params || new URLSearchParams();
  Object.keys(obj).forEach(function (key) {
    const val = obj[key];
    if (val === null || val === undefined) return;
    const name = prefix ? prefix + '[' + key + ']' : key;
    if (typeof val === 'object') toForm(val, name, params);
    else params.append(name, String(val));
  });
  return params;
}

async function stripePost(path, body) {
  const res = await fetch('https://api.stripe.com/v1/' + path, {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + process.env.STRIPE_SECRET_KEY,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: toForm(body).toString()
  });
  const data = await res.json();
  return { ok: res.ok, data: data };
}

exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }
  if (!process.env.STRIPE_SECRET_KEY) {
    console.error('STRIPE_SECRET_KEY is not set');
    return { statusCode: 500, body: JSON.stringify({ error: 'Payments are not configured yet.' }) };
  }

  let input;
  try {
    input = JSON.parse(event.body || '{}');
  } catch (e) {
    return bad('Invalid request.');
  }

  // ---- Validate the raw inputs (never trust the browser) ----
  const email = String(input.email || '').trim().slice(0, 200);
  const parentName = String(input.parentName || '').trim().slice(0, 100);
  const studentName = String(input.studentName || '').trim().slice(0, 100);
  const refillSize = String(input.refillSize || '').trim();

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return bad('A valid email is required.');
  if (refillSize && REFILL_SIZES.indexOf(refillSize) === -1) return bad('Invalid refill size.');

  const siteUrl = process.env.URL || 'http://localhost:8888';

  const metadata = {
    purpose: 'migration-card-setup',
    parent_name: parentName,
    student_name: studentName,
    refill_size: refillSize || 'not specified'
  };

  const session = {
    mode: 'setup',
    currency: 'usd',
    customer_creation: 'always',
    customer_email: email,
    success_url: siteUrl + '/card-saved',
    cancel_url: siteUrl + '/parent-portal',
    metadata: metadata,
    setup_intent_data: { metadata: metadata }
  };

  try {
    let result = await stripePost('checkout/sessions', session);

    // Fallback: some API versions reject customer_creation in setup
    // mode. Create the Customer explicitly, then attach it.
    if (!result.ok && result.data.error &&
        String(result.data.error.message || '').indexOf('customer_creation') !== -1) {
      const customer = await stripePost('customers', {
        email: email,
        name: parentName || undefined,
        metadata: metadata
      });
      if (!customer.ok) {
        console.error('Stripe customer error:', customer.data.error && customer.data.error.message);
        return { statusCode: 500, body: JSON.stringify({ error: 'Could not start card setup.' }) };
      }
      const fallbackSession = {
        mode: 'setup',
        currency: 'usd',
        customer: customer.data.id,
        success_url: session.success_url,
        cancel_url: session.cancel_url,
        metadata: metadata,
        setup_intent_data: { metadata: metadata }
      };
      result = await stripePost('checkout/sessions', fallbackSession);
    }

    if (!result.ok || !result.data.url) {
      console.error('Stripe error:', result.data.error ? result.data.error.message : 'no url');
      return { statusCode: 500, body: JSON.stringify({ error: 'Could not start card setup.' }) };
    }

    return { statusCode: 200, body: JSON.stringify({ url: result.data.url }) };
  } catch (err) {
    console.error('Stripe request failed:', err.message);
    return { statusCode: 500, body: JSON.stringify({ error: 'Could not start card setup.' }) };
  }
};
