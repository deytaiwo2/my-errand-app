const express = require('express');
const stripe = require('stripe')(process.env.STRIPE_SECRET);
const router = express.Router();
const axios = require('axios');
const crypto = require('crypto');

// Database connection
const { pool } = require('../config/db.mysql');
const db = pool;

// Import wallet utilities
const { getAllWalletBalances } = require('../utils/wallet-utils');
// Currency catalog
const { currencies, getCurrencySymbol } = require('../utils/currencies');

const PAYPAL_CLIENT = process.env.PAYPAL_CLIENT_ID;
const PAYPAL_SECRET = process.env.PAYPAL_SECRET;
const BASE_URL = 'https://api-m.sandbox.paypal.com';

// Paystack configuration
const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY;
const PAYSTACK_PUBLIC_KEY = process.env.PAYSTACK_PUBLIC_KEY;
const PAYSTACK_BASE_URL = 'https://api.paystack.co';

// =======================
// HELPER FUNCTIONS
// =======================

const getAccessToken = async () => {
  const res = await axios.post(`${BASE_URL}/v1/oauth2/token`, 'grant_type=client_credentials', {
    auth: { username: PAYPAL_CLIENT, password: PAYPAL_SECRET },
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
  });
  return res.data.access_token;
};

// Get user's wallet by type and currency
const getUserWallet = async (userId, walletType, currency = 'USD') => {
  const [wallet] = await db.execute(
    'SELECT * FROM wallets WHERE user_id = ? AND wallet_type = ? AND currency = ? AND status = "active"',
    [userId, walletType, currency]
  );
  return wallet[0] || null;
};

// Create wallet if it doesn't exist
const createWallet = async (userId, walletType, currency = 'USD') => {
  const [result] = await db.execute(
    'INSERT INTO wallets (user_id, wallet_type, currency, balance, status) VALUES (?, ?, ?, 0.00, "active")',
    [userId, walletType, currency]
  );
  return result.insertId;
};

// Get current exchange rate
const getExchangeRate = async (fromCurrency, toCurrency) => {
  if (fromCurrency === toCurrency) return 1;
  
  const [rate] = await db.execute(
    `SELECT rate FROM currency_rates 
     WHERE from_currency = ? AND to_currency = ? 
     AND (valid_until IS NULL OR valid_until > NOW())
     ORDER BY created_at DESC LIMIT 1`,
    [fromCurrency, toCurrency]
  );
  
  return rate[0]?.rate || 1;
};

// =======================
// WALLET MANAGEMENT ROUTES
// =======================

// List supported currencies with symbols and names
router.get('/currencies', async (req, res) => {
  try {
    res.json({ success: true, currencies });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch currencies', error: error.message });
  }
});

// Get exchange rate
router.get('/exchange-rate', async (req, res) => {
  try {
    const { from = 'USD', to = 'USD' } = req.query;
    const rate = await getExchangeRate(from.toUpperCase(), to.toUpperCase());
    res.json({ success: true, from: from.toUpperCase(), to: to.toUpperCase(), rate });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch exchange rate', error: error.message });
  }
});

// Convert an amount
router.get('/convert', async (req, res) => {
  try {
    const amount = parseFloat(req.query.amount || '0');
    const from = (req.query.from || 'USD').toUpperCase();
    const to = (req.query.to || 'USD').toUpperCase();
    const rate = await getExchangeRate(from, to);
    const converted = amount * rate;
    res.json({ success: true, amount, from, to, rate, converted });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Conversion failed', error: error.message });
  }
});

// Get user's wallet balances with aggregated total
router.get('/wallets', async (req, res) => {
  try {
    const userId = req.user.id;
    
    const [wallets] = await db.execute(
      'SELECT wallet_type, currency, balance, status FROM wallets WHERE user_id = ? AND status = "active"',
      [userId]
    );
    
    // Aggregate account and escrow balances
    const aggregatedBalance = wallets.reduce((acc, wallet) => acc + parseFloat(wallet.balance), 0);
    
    res.json({ success: true, wallets, totalBalance: aggregatedBalance });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch wallets', error: error.message });
  }
});

// Get user balance summary for header display (optionally in a target currency)
router.get('/balance-summary', async (req, res) => {
  try {
    const userId = req.user.id;
    const currency = (req.query.currency || 'USD').toUpperCase();

    const balances = await getAllWalletBalances(userId, currency);

    res.json({ 
      success: true, 
      currency,
      symbol: getCurrencySymbol(currency),
      balances: {
        spendable: balances.spendable,
        withdrawable: balances.withdrawable,
        escrow: balances.escrow,
        total: balances.total
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch balance summary', error: error.message });
  }
});

// =======================
// DEPOSIT FUNCTIONALITY
// =======================

// Create deposit intent (Step 1: Generate payment intent)
router.post('/deposit/create-intent', async (req, res) => {
  const { amount, currency = 'USD', paymentMethod = 'stripe', email } = req.body;
  
  try {
    if (paymentMethod === 'stripe') {
      const paymentIntent = await stripe.paymentIntents.create({
        amount: Math.round(amount * 100), // Convert to cents
        currency: currency.toLowerCase(),
        automatic_payment_methods: { enabled: true },
        metadata: {
          user_id: req.user.id,
          transaction_type: 'deposit'
        }
      });
      
      res.json({ 
        success: true, 
        clientSecret: paymentIntent.client_secret,
        paymentIntentId: paymentIntent.id
      });
    } else if (paymentMethod === 'paystack') {
      // Initialize Paystack transaction
      const paystackResponse = await axios.post(
        `${PAYSTACK_BASE_URL}/transaction/initialize`,
        {
          email: email || req.user.email,
          amount: Math.round(amount * 100), // Paystack expects amount in kobo (for NGN)
          currency: currency.toUpperCase(),
          reference: `dep_${Date.now()}_${req.user.id}`,
          callback_url: `${process.env.FRONTEND_URL}/wallet/deposit/callback`,
          metadata: {
            user_id: req.user.id,
            transaction_type: 'deposit'
          }
        },
        {
          headers: {
            Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
            'Content-Type': 'application/json'
          }
        }
      );

      if (paystackResponse.data.status) {
        res.json({
          success: true,
          authorization_url: paystackResponse.data.data.authorization_url,
          access_code: paystackResponse.data.data.access_code,
          reference: paystackResponse.data.data.reference
        });
      } else {
        res.status(400).json({ success: false, message: 'Failed to initialize Paystack transaction' });
      }
    } else {
      res.status(400).json({ success: false, message: 'Unsupported payment method' });
    }
  } catch (error) {
    console.error('Payment intent creation error:', error.response?.data || error.message);
    res.status(500).json({ success: false, message: 'Failed to create payment intent', error: error.message });
  }
});

// Confirm deposit (Step 2: After payment confirmation)
router.post('/deposit/confirm', async (req, res) => {
  const { paymentIntentId, currency = 'USD' } = req.body;
  const userId = req.user.id;
  
  try {
    // Verify payment with Stripe
    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
    
    if (paymentIntent.status !== 'succeeded') {
      return res.status(400).json({ success: false, message: 'Payment not confirmed' });
    }
    
    const amount = paymentIntent.amount / 100; // Convert from cents
    
    // Get or create spendable wallet
    let wallet = await getUserWallet(userId, 'spendable', currency);
    if (!wallet) {
      const walletId = await createWallet(userId, 'spendable', currency);
      wallet = await getUserWallet(userId, 'spendable', currency);
    }
    
    // Update wallet balance
    await db.execute(
      'UPDATE wallets SET balance = balance + ? WHERE id = ?',
      [amount, wallet.id]
    );

    console.log(`Deposit confirmed: +${amount} ${currency} to wallet ${wallet.id} for user ${userId}`);
    
    // Record transaction
    await db.execute(
      `INSERT INTO wallet_transactions (
        to_wallet_id, transaction_type, amount, currency, description, 
        payment_gateway, gateway_transaction_id, status, processed_at
      ) VALUES (?, 'deposit', ?, ?, ?, 'stripe', ?, 'completed', NOW())`,
      [wallet.id, amount, currency, `Deposit via Stripe`, paymentIntentId]
    );
    
    res.json({ success: true, message: 'Deposit successful', amount, currency });
  } catch (error) {
    console.error('Deposit confirmation failed:', error);
    res.status(500).json({ success: false, message: 'Deposit confirmation failed', error: error.message });
  }
});

// Paystack webhook handler
router.post('/paystack/webhook', async (req, res) => {
  const hash = crypto.createHmac('sha512', PAYSTACK_SECRET_KEY).update(JSON.stringify(req.body)).digest('hex');
  
  if (hash === req.headers['x-paystack-signature']) {
    const event = req.body;
    
    if (event.event === 'charge.success') {
      const { reference, amount, currency, customer } = event.data;
      
      // Extract user ID from reference
      const referenceMatch = reference.match(/dep_(\d+)_(\d+)/);
      if (referenceMatch) {
        const userId = parseInt(referenceMatch[2]);
        const finalAmount = amount / 100; // Convert from kobo to main currency
        
        try {
          // Get or create spendable wallet
          let wallet = await getUserWallet(userId, 'spendable', currency);
          if (!wallet) {
            await createWallet(userId, 'spendable', currency);
            wallet = await getUserWallet(userId, 'spendable', currency);
          }
          
          // Update wallet balance
          await db.execute(
            'UPDATE wallets SET balance = balance + ? WHERE id = ?',
            [finalAmount, wallet.id]
          );
          
          // Record transaction
          await db.execute(
            `INSERT INTO wallet_transactions (
              to_wallet_id, transaction_type, amount, currency, description, 
              payment_gateway, gateway_transaction_id, status, processed_at
            ) VALUES (?, 'deposit', ?, ?, ?, 'paystack', ?, 'completed', NOW())`,
            [wallet.id, finalAmount, currency, 'Deposit via Paystack', reference]
          );
          
          console.log(`Paystack deposit processed: ${finalAmount} ${currency} for user ${userId}`);
        } catch (error) {
          console.error('Error processing Paystack deposit:', error);
        }
      }
    }
  }
  
  res.status(200).send('OK');
});

// Verify Paystack transaction
router.post('/paystack/verify', async (req, res) => {
  const { reference } = req.body;
  
  try {
    const response = await axios.get(
      `${PAYSTACK_BASE_URL}/transaction/verify/${reference}`,
      {
        headers: {
          Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`
        }
      }
    );
    
    if (response.data.status && response.data.data.status === 'success') {
      const { amount, currency } = response.data.data;
      const finalAmount = amount / 100;
      
      // Extract user ID from reference
      const referenceMatch = reference.match(/dep_(\d+)_(\d+)/);
      if (referenceMatch) {
        const userId = parseInt(referenceMatch[2]);
        
        // Get or create spendable wallet
        let wallet = await getUserWallet(userId, 'spendable', currency);
        if (!wallet) {
          await createWallet(userId, 'spendable', currency);
          wallet = await getUserWallet(userId, 'spendable', currency);
        }
        
        // Check if transaction already processed
        const [existingTx] = await db.execute(
          'SELECT id FROM wallet_transactions WHERE gateway_transaction_id = ? AND payment_gateway = "paystack"',
          [reference]
        );
        
        if (existingTx.length === 0) {
          // Update wallet balance
          await db.execute(
            'UPDATE wallets SET balance = balance + ? WHERE id = ?',
            [finalAmount, wallet.id]
          );
          
          // Record transaction
          await db.execute(
            `INSERT INTO wallet_transactions (
              to_wallet_id, transaction_type, amount, currency, description, 
              payment_gateway, gateway_transaction_id, status, processed_at
            ) VALUES (?, 'deposit', ?, ?, ?, 'paystack', ?, 'completed', NOW())`,
            [wallet.id, finalAmount, currency, 'Deposit via Paystack', reference]
          );
        }
        
        res.json({ success: true, message: 'Payment verified and processed', amount: finalAmount, currency });
      } else {
        res.status(400).json({ success: false, message: 'Invalid transaction reference' });
      }
    } else {
      res.status(400).json({ success: false, message: 'Transaction verification failed' });
    }
  } catch (error) {
    console.error('Paystack verification error:', error.response?.data || error.message);
    res.status(500).json({ success: false, message: 'Verification failed', error: error.message });
  }
});

// =======================
// TRANSFER FUNCTIONALITY (Spendable to Withdrawable)
// =======================

router.post('/transfer', async (req, res) => {
  const { amount, fromCurrency = 'USD', toCurrency = 'USD' } = req.body;
  const userId = req.user.id;
  
  try {
    // Get spendable wallet
    const spendableWallet = await getUserWallet(userId, 'spendable', fromCurrency);
    if (!spendableWallet || spendableWallet.balance < amount) {
      return res.status(400).json({ success: false, message: 'Insufficient spendable balance' });
    }
    
    // Get or create withdrawable wallet
    let withdrawableWallet = await getUserWallet(userId, 'withdrawable', toCurrency);
    if (!withdrawableWallet) {
      await createWallet(userId, 'withdrawable', toCurrency);
      withdrawableWallet = await getUserWallet(userId, 'withdrawable', toCurrency);
    }
    
    // Calculate conversion if needed
    const exchangeRate = await getExchangeRate(fromCurrency, toCurrency);
    const convertedAmount = amount * exchangeRate;
    const conversionFee = fromCurrency !== toCurrency ? amount * 0.01 : 0; // 1% conversion fee
    const finalAmount = convertedAmount - conversionFee;
    
    // Start transaction
    await db.beginTransaction();
    
    try {
      // Deduct from spendable wallet
      await db.execute(
        'UPDATE wallets SET balance = balance - ? WHERE id = ?',
        [amount, spendableWallet.id]
      );

      console.log(`Transfer: -${amount} ${fromCurrency} from wallet ${spendableWallet.id} for user ${userId}`);

      // Add to withdrawable wallet
      await db.execute(
        'UPDATE wallets SET balance = balance + ? WHERE id = ?',
        [finalAmount, withdrawableWallet.id]
      );

      console.log(`Transfer: +${finalAmount} ${toCurrency} to wallet ${withdrawableWallet.id} for user ${userId}`);
      
      // Record transfer transaction
      await db.execute(
        `INSERT INTO wallet_transactions (
          from_wallet_id, to_wallet_id, transaction_type, amount, currency,
          original_amount, original_currency, exchange_rate, conversion_fee,
          description, status, processed_at
        ) VALUES (?, ?, 'transfer', ?, ?, ?, ?, ?, ?, ?, 'completed', NOW())`,
        [
          spendableWallet.id, withdrawableWallet.id, finalAmount, toCurrency,
          amount, fromCurrency, exchangeRate, conversionFee,
          `Transfer from spendable to withdrawable account`
        ]
      );
      
      await db.commit();
      
      res.json({ 
        success: true, 
        message: 'Transfer successful',
        transferredAmount: finalAmount,
        conversionFee,
        exchangeRate
      });
    } catch (error) {
      await db.rollback();
      throw error;
    }
  } catch (error) {
    console.error('Transfer failed:', error);
    res.status(500).json({ success: false, message: 'Transfer failed', error: error.message });
  }
});

// =======================
// WITHDRAWAL FUNCTIONALITY
// =======================

// Get user's withdrawal methods
router.get('/withdrawal-methods', async (req, res) => {
  try {
    const userId = req.user.id;
    
    const [methods] = await db.execute(
      'SELECT id, method_type, method_name, is_verified, is_default FROM withdrawal_methods WHERE user_id = ? AND is_active = 1',
      [userId]
    );
    
    res.json({ success: true, methods });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch withdrawal methods', error: error.message });
  }
});

// Add withdrawal method
router.post('/withdrawal-methods', async (req, res) => {
  const { methodType, methodName, accountDetails } = req.body;
  const userId = req.user.id;
  
  try {
    const [result] = await db.execute(
      'INSERT INTO withdrawal_methods (user_id, method_type, method_name, account_details) VALUES (?, ?, ?, ?)',
      [userId, methodType, methodName, JSON.stringify(accountDetails)]
    );
    
    res.json({ success: true, message: 'Withdrawal method added', methodId: result.insertId });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to add withdrawal method', error: error.message });
  }
});

// Process withdrawal
router.post('/withdraw', async (req, res) => {
  const { amount, currency = 'USD', withdrawalMethodId } = req.body;
  const userId = req.user.id;
  
  try {
    // Get withdrawable wallet
    const withdrawableWallet = await getUserWallet(userId, 'withdrawable', currency);
    if (!withdrawableWallet || withdrawableWallet.balance < amount) {
      return res.status(400).json({ success: false, message: 'Insufficient withdrawable balance' });
    }
    
    // Get withdrawal method
    const [method] = await db.execute(
      'SELECT * FROM withdrawal_methods WHERE id = ? AND user_id = ? AND is_active = 1',
      [withdrawalMethodId, userId]
    );
    
    if (!method[0]) {
      return res.status(404).json({ success: false, message: 'Withdrawal method not found' });
    }
    
    const withdrawalMethod = method[0];
    
    // Calculate withdrawal fee (example: 2% fee)
    const withdrawalFee = amount * 0.02;
    const netAmount = amount - withdrawalFee;
    
    // Process withdrawal based on method type
    let withdrawalSuccessful = false;
    let gatewayTransactionId = null;
    
    if (withdrawalMethod.method_type === 'stripe') {
      // In production, implement Stripe Connect transfers
      // For now, simulate successful withdrawal
      withdrawalSuccessful = true;
      gatewayTransactionId = `stripe_${Date.now()}`;
    } else if (withdrawalMethod.method_type === 'paypal') {
      // In production, implement PayPal payouts
      withdrawalSuccessful = true;
      gatewayTransactionId = `paypal_${Date.now()}`;
    }
    
    if (withdrawalSuccessful) {
      // Start transaction
      await db.beginTransaction();
      
      try {
        // Deduct from withdrawable wallet
        await db.execute(
          'UPDATE wallets SET balance = balance - ? WHERE id = ?',
          [amount, withdrawableWallet.id]
        );

        console.log(`Withdrawal: -${amount} ${currency} from wallet ${withdrawableWallet.id} for user ${userId}`);

        // Record withdrawal transaction
        await db.execute(
          `INSERT INTO wallet_transactions (
            from_wallet_id, transaction_type, amount, currency, description,
            payment_gateway, gateway_transaction_id, gateway_fee, status, processed_at
          ) VALUES (?, 'withdrawal', ?, ?, ?, ?, ?, ?, 'completed', NOW())`,
          [
            withdrawableWallet.id, netAmount, currency,
            `Withdrawal via ${withdrawalMethod.method_type}`,
            withdrawalMethod.method_type, gatewayTransactionId, withdrawalFee
          ]
        );
        
        await db.commit();
        
        res.json({ 
          success: true, 
          message: 'Withdrawal successful',
          netAmount,
          withdrawalFee,
          gatewayTransactionId
        });
      } catch (error) {
        await db.rollback();
        throw error;
      }
    } else {
      res.status(500).json({ success: false, message: 'Withdrawal processing failed' });
    }
  } catch (error) {
    console.error('Withdrawal failed:', error);
    res.status(500).json({ success: false, message: 'Withdrawal failed', error: error.message });
  }
});

// =======================
// EARNINGS MANAGEMENT (For runners)
// =======================

// Convert earnings to spendable balance (when errand is completed)
router.post('/convert-earnings', async (req, res) => {
  const { errandId, amount, currency = 'USD' } = req.body;
  const userId = req.user.id;
  
  try {
    // Verify errand completion and runner assignment
    const [errand] = await db.execute(
      'SELECT * FROM errands WHERE id = ? AND runner_id = ? AND status = "completed"',
      [errandId, userId]
    );
    
    if (!errand[0]) {
      return res.status(400).json({ success: false, message: 'Invalid errand or not completed' });
    }
    
    // Get or create spendable wallet
    let spendableWallet = await getUserWallet(userId, 'spendable', currency);
    if (!spendableWallet) {
      await createWallet(userId, 'spendable', currency);
      spendableWallet = await getUserWallet(userId, 'spendable', currency);
    }
    
    // Add earnings to spendable wallet
    await db.execute(
      'UPDATE wallets SET balance = balance + ? WHERE id = ?',
      [amount, spendableWallet.id]
    );
    
    // Record earning transaction
    await db.execute(
      `INSERT INTO wallet_transactions (
        to_wallet_id, transaction_type, amount, currency, errand_id,
        description, status, processed_at
      ) VALUES (?, 'earning', ?, ?, ?, ?, 'completed', NOW())`,
      [spendableWallet.id, amount, currency, errandId, `Earnings from errand #${errandId}`]
    );
    
    res.json({ success: true, message: 'Earnings converted to spendable balance', amount });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Earnings conversion failed', error: error.message });
  }
});

// =======================
// TRANSACTION HISTORY
// =======================

router.get('/transactions', async (req, res) => {
  const { page = 1, limit = 20, type } = req.query;
  const userId = req.user.id;
  const offset = (page - 1) * limit;
  
  try {
    let query = `
      SELECT wt.*, 
             fw.wallet_type as from_wallet_type,
             tw.wallet_type as to_wallet_type
      FROM wallet_transactions wt
      LEFT JOIN wallets fw ON wt.from_wallet_id = fw.id
      LEFT JOIN wallets tw ON wt.to_wallet_id = tw.id
      WHERE (fw.user_id = ? OR tw.user_id = ?)
    `;
    
    const params = [userId, userId];
    
    if (type) {
      query += ' AND wt.transaction_type = ?';
      params.push(type);
    }
    
    query += ' ORDER BY wt.created_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), parseInt(offset));
    
    const [transactions] = await db.execute(query, params);

    console.log(`Fetched ${transactions.length} transactions for user ${userId}`);

    res.json({ success: true, transactions, page: parseInt(page), limit: parseInt(limit) });
  } catch (error) {
    console.error('Error fetching transactions:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch transactions', error: error.message });
  }
});

// DEBUG ROUTE: Check wallet status for runner
router.get('/debug/status', async (req, res) => {
  try {
    const userId = req.user.id;
    
    // Get all wallet information
    const [wallets] = await db.execute(
      'SELECT * FROM wallets WHERE user_id = ? ORDER BY wallet_type',
      [userId]
    );
    
    // Get recent transactions
    const [transactions] = await db.execute(
      `SELECT wt.*, fw.wallet_type as from_wallet_type, tw.wallet_type as to_wallet_type
       FROM wallet_transactions wt
       LEFT JOIN wallets fw ON wt.from_wallet_id = fw.id
       LEFT JOIN wallets tw ON wt.to_wallet_id = tw.id
       WHERE (fw.user_id = ? OR tw.user_id = ?)
       ORDER BY wt.created_at DESC LIMIT 10`,
      [userId, userId]
    );
    
    // Get errands for this user
    const [errands] = await db.execute(
      'SELECT id, status, payment_status, amount FROM errands WHERE runner_id = ? ORDER BY created_at DESC LIMIT 5',
      [userId]
    );
    
    res.json({
      success: true,
      debug: {
        userId,
        wallets,
        recentTransactions: transactions,
        recentErrands: errands,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Debug failed', error: error.message });
  }
});

// Transfer from withdrawable to spendable (for runners who want to use earnings)
router.post('/transfer-to-spendable', async (req, res) => {
  const { amount, currency = 'USD' } = req.body;
  const userId = req.user.id;
  
  try {
    // Get withdrawable wallet
    const withdrawableWallet = await getUserWallet(userId, 'withdrawable', currency);
    if (!withdrawableWallet || withdrawableWallet.balance < amount) {
      return res.status(400).json({ success: false, message: 'Insufficient withdrawable balance' });
    }
    
    // Get or create spendable wallet
    let spendableWallet = await getUserWallet(userId, 'spendable', currency);
    if (!spendableWallet) {
      await createWallet(userId, 'spendable', currency);
      spendableWallet = await getUserWallet(userId, 'spendable', currency);
    }
    
    // Start transaction
    await db.beginTransaction();
    
    try {
      // Transfer from withdrawable to spendable
      await db.execute(
        'UPDATE wallets SET balance = balance - ? WHERE id = ?',
        [amount, withdrawableWallet.id]
      );
      
      await db.execute(
        'UPDATE wallets SET balance = balance + ? WHERE id = ?',
        [amount, spendableWallet.id]
      );
      
      // Record transfer transaction
      await db.execute(
        `INSERT INTO wallet_transactions (
          from_wallet_id, to_wallet_id, transaction_type, amount, currency,
          description, status, processed_at
        ) VALUES (?, ?, 'internal_transfer', ?, ?, ?, 'completed', NOW())`,
        [
          withdrawableWallet.id, spendableWallet.id, amount, currency,
          `Transfer from withdrawable to spendable wallet`
        ]
      );
      
      await db.commit();
      
      res.json({ 
        success: true, 
        message: 'Transfer successful',
        transferredAmount: amount
      });
    } catch (error) {
      await db.rollback();
      throw error;
    }
  } catch (error) {
    res.status(500).json({ success: false, message: 'Transfer failed', error: error.message });
  }
});

module.exports = router;
