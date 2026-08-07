/* ============================================================
   Launch Valley Tutoring — 6-hour introductory package checkout

   Creates a Stripe Checkout Session for the one-time intro
   package AND saves the customer's card for future off-session
   charges (manual refills), per the Tutoring Services Agreement
   the family accepts before purchasing.

   SECURITY: the browser sends only a level key, the parent's
   email, and names. Prices are hardcoded here, server-side; a
   browser-supplied price is never read, so a tampered price can
   never be charged.

   Card saving requires BOTH:
     - customer_creation: 'always'  (a real Customer to attach to)
     - payment_intent_data[setup_future_usage]: 'off_session'

   Talks to Stripe's REST API directly (no npm dependencies) so
   the function deploys reliably without a build step.

   Reads STRIPE_SECRET_KEY from Netlify environment variables.
   Never put that key in front-end code.
   ============================================================ */

// The only prices this function can ever charge. 6 hours at 20% off the
// standard hourly rate. Elementary / Middle / High split by tutor tier
// (Senior / Junior); College and SAT/ACT are a single flat rate.
// Keys are level for flat rates, or level-tier for tiered levels; the
// key is composed server-side from validated inputs (see below).
const INTRO_PACKAGES = {
  'elementary-senior': { label: 'Elementary, Senior Tutor',    amount: 38400 }, // $384
  'elementary-junior': { label: 'Elementary, Junior Tutor',    amount: 26400 }, // $264
  'middle-senior':     { label: 'Middle School, Senior Tutor', amount: 45600 }, // $456
  'middle-junior':     { label: 'Middle School, Junior Tutor', amount: 31200 }, // $312
  'high-senior':       { label: 'High School, Senior Tutor',   amount: 50400 }, // $504
  'high-junior':       { label: 'High School, Junior Tutor',   amount: 36000 }, // $360
  'college':           { label: 'College',                     amount: 60000 }, // $600
  'sat-act':           { label: 'SAT/ACT Prep',                amount: 60000 }  // $600
};

// Levels that require a tutor tier; the rest are flat-rate.
const TIERED_LEVELS = ['elementary', 'middle', 'high'];

function bad(message) {
  return { statusCode: 400, body: JSON.stringify({ error: message }) };
}

// Flatten a nested object into Stripe's form encoding:
// { payment_intent_data: { setup_future_usage: 'off_session' } }
//   -> payment_intent_data[setup_future_usage]=off_session
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
  const level = String(input.level || '').trim().toLowerCase();
  const tier = String(input.tier || '').trim().toLowerCase();
  const email = String(input.email || '').trim().slice(0, 200);
  const parentName = String(input.parentName || '').trim().slice(0, 100);
  const studentName = String(input.studentName || '').trim().slice(0, 100);

  // Tiered levels need a Senior/Junior tier; flat levels ignore it.
  // Compose the lookup key server-side so a tampered price can't be charged.
  let key = level;
  if (TIERED_LEVELS.indexOf(level) !== -1) {
    if (tier !== 'senior' && tier !== 'junior') return bad('A tutor tier is required.');
    key = level + '-' + tier;
  }

  const pkg = INTRO_PACKAGES[key];
  if (!pkg) return bad('Invalid level.');
  // Light-touch email shape check; Stripe validates deliverability rules.
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return bad('A valid email is required.');

  const siteUrl = process.env.URL || 'http://localhost:8888';

  // Everything a director needs later, attached to the payment in Stripe.
  const metadata = {
    package: '6-hour-intro',
    level: pkg.label,
    discount: '20% intro discount',
    parent_name: parentName,
    student_name: studentName
  };

  const session = {
    mode: 'payment',
    // Always create a real Customer so the saved card has an owner
    // we can charge for refills later.
    customer_creation: 'always',
    // Lock the checkout email to the one on file so it matches
    // TutorBird and the signed agreement exactly.
    customer_email: email,
    success_url: siteUrl + '/payment-success?session_id={CHECKOUT_SESSION_ID}',
    cancel_url: siteUrl + '/pricing',
    metadata: metadata,
    line_items: [{
      quantity: 1,
      price_data: {
        currency: 'usd',
        unit_amount: pkg.amount, // hardcoded server-side, in cents
        product_data: {
          name: '6-Hour Introductory Package, ' + pkg.label + ' (20% off)',
          description: '6 hours of private tutoring. Money-back guarantee per the Tutoring Services Agreement.'
        }
      }
    }],
    payment_intent_data: {
      // THE critical flag: saves the card to the Customer for
      // charging later when the parent is not present.
      setup_future_usage: 'off_session',
      metadata: metadata
    }
  };

  try {
    const res = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + process.env.STRIPE_SECRET_KEY,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: toForm(session).toString()
    });
    const data = await res.json();

    if (!res.ok || !data.url) {
      console.error('Stripe error:', data.error ? data.error.message : res.status);
      return { statusCode: 500, body: JSON.stringify({ error: 'Could not start checkout.' }) };
    }

    return { statusCode: 200, body: JSON.stringify({ url: data.url }) };
  } catch (err) {
    console.error('Stripe request failed:', err.message);
    return { statusCode: 500, body: JSON.stringify({ error: 'Could not start checkout.' }) };
  }
};
