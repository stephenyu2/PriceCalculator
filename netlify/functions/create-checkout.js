/* ============================================================
   Launch Valley Tutoring — SAT planner Stripe checkout

   Creates a Stripe Checkout Session for the plan the customer
   picked on /sat-planner. SECURITY: the browser sends only the
   RAW inputs (scores, target, test date, tier, payment choice).
   The price is recomputed here, server-side, with the exact same
   shared formula (sat-pricing.js) the page uses, so a tampered
   browser price can never be charged.

   Talks to Stripe's REST API directly (no npm dependencies) so
   the function deploys reliably without a build step.

   Reads STRIPE_SECRET_KEY from Netlify environment variables.
   Never put that key in front-end code.
   ============================================================ */
const pricing = require('../../sat-pricing.js');

// The business is in Northridge, CA. Compute "today" in Los Angeles time so
// the server's week/month math matches what the customer saw on the page.
function todayInLA() {
  const iso = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles' }).format(new Date());
  return pricing.parseISO(iso);
}

function bad(message) {
  return { statusCode: 400, body: JSON.stringify({ error: message }) };
}

// Flatten a nested object into Stripe's form encoding:
// { line_items: [{ price_data: { currency: 'usd' } }] }
//   -> line_items[0][price_data][currency]=usd
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
  const currentMath = parseInt(input.currentMath, 10);
  const currentRW = parseInt(input.currentRW, 10);
  const targetTotal = parseInt(input.targetTotal, 10);
  const testDate = String(input.testDate || '');
  const tierKey = String(input.tierKey || '');
  const pay = String(input.pay || '');
  const studentName = String(input.studentName || '').trim().slice(0, 100);

  if (isNaN(currentMath) || currentMath < 200 || currentMath > 800) return bad('Math scores range from 200 to 800.');
  if (isNaN(currentRW) || currentRW < 200 || currentRW > 800) return bad('Reading & Writing scores range from 200 to 800.');
  if (isNaN(targetTotal) || targetTotal < 400 || targetTotal > 1600) return bad('Target totals range from 400 to 1600.');
  if (targetTotal <= currentMath + currentRW) return bad('Target must be above the current total.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(testDate)) return bad('Invalid test date.');
  if (pay !== 'upfront' && pay !== 'monthly') return bad('Invalid payment choice.');
  if (!studentName) return bad('Missing student name.');

  const now = todayInLA();
  if (pricing.parseISO(testDate) <= now) return bad('The test date must be in the future.');

  // ---- Recompute the price server-side with the shared formula ----
  const calc = pricing.buildTiers({
    currentMath: currentMath,
    currentRW: currentRW,
    targetTotal: targetTotal,
    concentration: 'mixed',
    testDate: testDate,
    now: now
  });

  const tier = calc.tiers.find(function (t) { return t.key === tierKey; });
  if (!tier) return bad('Invalid package.');

  const siteUrl = process.env.URL || 'http://localhost:8888';

  const packageName = 'SAT Prep ' + tier.name + ' Package (' + tier.hours + ' hours)';
  const packageDescription = tier.hours + ' tutoring hours, ' + tier.hoursPerWeek + ' hours/week over ' +
    calc.weeks + (calc.weeks === 1 ? ' week' : ' weeks') + ', for the ' + testDate + ' SAT.';

  // Everything a director needs later, attached to the payment in Stripe.
  const metadata = {
    student_name: studentName,
    current_total: String(calc.currentTotal),
    target_total: String(targetTotal),
    test_date: testDate,
    package: tier.name,
    hours: String(tier.hours),
    payment_choice: pay,
    expected_payments: pay === 'monthly' ? String(tier.months) : '1'
  };

  if (pay === 'monthly') {
    // Spell out the cancel chore so the director never has to compute it:
    // first payment is today, the last lands (months - 1) months later, and
    // the subscription should be set to cancel 3 days after that.
    const fmt = function (d) {
      return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    };
    const finalPayment = new Date(now.getFullYear(), now.getMonth() + tier.months - 1, now.getDate());
    const cancelDate = new Date(finalPayment.getFullYear(), finalPayment.getMonth(), finalPayment.getDate() + 3);
    metadata.final_payment_on = fmt(finalPayment);
    metadata.SET_CANCEL_DATE_TO = fmt(cancelDate);
  }

  const session = {
    success_url: siteUrl + '/payment-success?session_id={CHECKOUT_SESSION_ID}',
    cancel_url: siteUrl + '/sat-planner',
    metadata: metadata
  };

  if (pay === 'upfront') {
    session.mode = 'payment';
    session.line_items = [{
      quantity: 1,
      price_data: {
        currency: 'usd',
        unit_amount: tier.upfrontPrice * 100, // server-verified amount, in cents
        product_data: { name: packageName + ' — Paid in Full', description: packageDescription }
      }
    }];
    session.payment_intent_data = { metadata: metadata };
  } else {
    session.mode = 'subscription';
    session.line_items = [{
      quantity: 1,
      price_data: {
        currency: 'usd',
        unit_amount: tier.monthlyPayment * 100, // server-verified amount, in cents
        recurring: { interval: 'month' },
        product_data: {
          name: packageName + ' — Monthly Plan (' + tier.months + (tier.months === 1 ? ' payment' : ' payments') + ')',
          description: packageDescription
        }
      }
    }];
    // Also stamped on the subscription itself, so the director can see how
    // many payments it should run before they set its cancel date.
    session.subscription_data = { metadata: metadata };
  }

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
