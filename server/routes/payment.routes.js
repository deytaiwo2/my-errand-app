const express = require('express');
const stripe = require('stripe')(process.env.STRIPE_SECRET);
const router = express.Router();
const axios = require('axios');

const PAYPAL_CLIENT = process.env.PAYPAL_CLIENT_ID;
const PAYPAL_SECRET = process.env.PAYPAL_SECRET;
const BASE_URL = 'https://api-m.sandbox.paypal.com'; // use live.paypal.com in prod

const getAccessToken = async () => {
  const res = await axios.post(`${BASE_URL}/v1/oauth2/token`, 'grant_type=client_credentials', {
    auth: { username: PAYPAL_CLIENT, password: PAYPAL_SECRET },
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
  });
  return res.data.access_token;
};

router.post('/capture-order/:orderId', async (req, res) => {
  const accessToken = await getAccessToken();
  const { orderId } = req.params;

  const response = await axios.post(`${BASE_URL}/v2/checkout/orders/${orderId}/capture`, {}, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });

  // 👇 Confirm the errand
  const errand_id = req.body.errand_id;
  const payer = response.data.payer;

  await db.execute(
    'UPDATE errands SET is_paid = 1, status = "confirmed" WHERE id = ?',
    [errand_id]
  );

  // 👇 Save payment history
  await db.execute(
    `INSERT INTO payments (errand_id, order_id, payer_email, amount, currency, status)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      errand_id,
      orderId,
      payer.email_address,
      response.data.purchase_units[0].payments.captures[0].amount.value,
      response.data.purchase_units[0].payments.captures[0].amount.currency_code,
      'success'
    ]
  );

  res.json({ message: 'Payment captured & errand confirmed' });
});



router.post('/create-payment-intent', async (req, res) => {
  const { amount, currency = 'usd' } = req.body;

  const paymentIntent = await stripe.paymentIntents.create({
    amount: amount * 100,
    currency,
    automatic_payment_methods: { enabled: true }
  });

  res.send({ clientSecret: paymentIntent.client_secret });
});



module.exports = router;
