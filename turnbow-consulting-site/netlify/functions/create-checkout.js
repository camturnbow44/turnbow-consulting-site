// Secure serverless function: creates a Stripe Checkout Session for the
// exact amount calculated from the customer's selections. Runs on Netlify's
// servers only — the Stripe secret key never reaches the browser, and every
// number is recalculated here (never trusted from the client) so nobody can
// tamper with the price from the page itself.

const Stripe = require('stripe');
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

const BASE_QTY = 5;
const BUNDLE_PRICE_CENTS = 150000; // $1,500 bundle (5 interviews)
const EXTRA_PRICE_CENTS = 25000;   // $250 per additional interview
const MAX_QTY = 50;
const ALLOWED_INCENTIVES_DOLLARS = [0, 50, 100, 150, 200, 250];
const SITE_URL = process.env.URL || 'https://turnbowconsulting.com';

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  let interviews, incentive;
  try {
    const body = JSON.parse(event.body || '{}');
    interviews = parseInt(body.interviews, 10);
    incentive = parseInt(body.incentive, 10);
  } catch (e) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid request body.' }) };
  }

  if (!Number.isInteger(interviews) || interviews < BASE_QTY || interviews > MAX_QTY) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid interview count.' }) };
  }
  if (!ALLOWED_INCENTIVES_DOLLARS.includes(incentive)) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid incentive amount.' }) };
  }

  const extraQty = interviews - BASE_QTY;
  const extraCostCents = extraQty * EXTRA_PRICE_CENTS;
  const incentiveCostCents = incentive * 100 * interviews;
  const totalCents = BUNDLE_PRICE_CENTS + extraCostCents + incentiveCostCents;

  const descriptionParts = [
    `${BASE_QTY}-interview bundle`,
    extraQty > 0 ? `${extraQty} additional interview${extraQty > 1 ? 's' : ''}` : null,
    incentive > 0 ? `$${incentive} incentive × ${interviews} interviews` : null
  ].filter(Boolean);

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: `Turnbow Consulting — ${interviews} Interview${interviews > 1 ? 's' : ''}`,
              description: descriptionParts.join(' + ')
            },
            unit_amount: totalCents
          },
          quantity: 1
        }
      ],
      success_url: `${SITE_URL}/?checkout=success`,
      cancel_url: `${SITE_URL}/?checkout=cancelled`
    });

    return {
      statusCode: 200,
      body: JSON.stringify({ url: session.url })
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message || 'Stripe error.' })
    };
  }
};
