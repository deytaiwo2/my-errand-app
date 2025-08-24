import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';

const WalletManager = () => {
  const [wallets, setWallets] = useState([]);
  const [totalBalance, setTotalBalance] = useState(0);
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [depositAmount, setDepositAmount] = useState('');
  const [transferAmount, setTransferAmount] = useState('');
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [withdrawalMethods, setWithdrawalMethods] = useState([]);
  const [selectedWithdrawalMethod, setSelectedWithdrawalMethod] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('paystack'); // Default to Paystack
  const [userEmail, setUserEmail] = useState('');
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // Auth header helper
  const authHeaders = () => ({ headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}`, 'Content-Type': 'application/json' } });

  const [selectedCurrency, setSelectedCurrency] = useState('USD');
  const [availableCurrencies, setAvailableCurrencies] = useState([]);

  // Fetch wallet data with total balance calculation
  const fetchWallets = useCallback(async () => {
    try {
      const response = await axios.get('/api/wallet/wallets', authHeaders());
      if (response.data.success) {
        setWallets(response.data.wallets);
        setTotalBalance(response.data.totalBalance || 0);
      }
    } catch (error) {
      console.error('Error fetching wallets:', error);
    }
  }, []);
  
  // Force refresh all wallet data
  const refreshWalletData = useCallback(async () => {
    await Promise.all([
      fetchWallets(),
      fetchTransactions(),
      fetchWithdrawalMethods(),
      fetchCurrencies(),
      fetchBalanceSummary(selectedCurrency)
    ]);
    setRefreshTrigger(prev => prev + 1);
  }, [fetchWallets, selectedCurrency]);

  // Fetch transaction history
  const fetchTransactions = async () => {
    try {
      const response = await axios.get('/api/wallet/transactions?limit=10', authHeaders());
      if (response.data.success) {
        setTransactions(response.data.transactions);
      }
    } catch (error) {
      console.error('Error fetching transactions:', error);
    }
  };

  // Fetch withdrawal methods
  const fetchWithdrawalMethods = async () => {
    try {
      const response = await axios.get('/api/wallet/withdrawal-methods', authHeaders());
      if (response.data.success) {
        setWithdrawalMethods(response.data.methods);
      }
    } catch (error) {
      console.error('Error fetching withdrawal methods:', error);
    }
  };

  const fetchCurrencies = async () => {
    try {
      const response = await axios.get('/api/wallet/currencies', authHeaders());
      if (response.data.success) setAvailableCurrencies(response.data.currencies);
    } catch (e) { console.error('Error fetching currencies', e); }
  };

  const fetchBalanceSummary = async (currency) => {
    try {
      const response = await axios.get(`/api/wallet/balance-summary?currency=${currency}`, authHeaders());
      // Optionally use response.data.symbol
    } catch (e) { console.error('Error fetching balance summary', e); }
  };

  useEffect(() => {
    fetchWallets();
    fetchTransactions();
    fetchWithdrawalMethods();
    fetchCurrencies();
    fetchBalanceSummary(selectedCurrency);
  }, []);

  const handleDeposit = async () => {
    if (!depositAmount || parseFloat(depositAmount) <= 0) return;

    setLoading(true);
    try {
      if (paymentMethod === 'paystack') {
        // Step 1: Initialize Paystack transaction
        const intentResponse = await axios.post('/api/wallet/deposit/create-intent', {
          amount: parseFloat(depositAmount),
          currency: selectedCurrency,
          paymentMethod: 'paystack',
          email: userEmail || 'user@example.com' // In production, get from user profile
        }, authHeaders());

        if (intentResponse.data.success) {
          // Redirect to Paystack payment page
          window.location.href = intentResponse.data.authorization_url;
        }
      } else {
        // Stripe payment flow
        const intentResponse = await axios.post('/api/wallet/deposit/create-intent', {
          amount: parseFloat(depositAmount),
          currency: selectedCurrency,
          paymentMethod: 'stripe'
        }, authHeaders());

        if (intentResponse.data.success) {
          // In a real implementation, you would integrate with Stripe Elements here
          alert('Payment processing... (In production, this would use Stripe Elements)');
          
          // Step 2: Confirm deposit (simulate successful payment)
          const confirmResponse = await axios.post('/api/wallet/deposit/confirm', {
            paymentIntentId: intentResponse.data.paymentIntentId,
            currency: selectedCurrency
          }, authHeaders());

          if (confirmResponse.data.success) {
            alert('Deposit successful!');
            setDepositAmount('');
            await refreshWalletData();
          }
        }
      }
    } catch (error) {
      alert('Deposit failed: ' + (error.response?.data?.message || error.message));
    } finally {
      setLoading(false);
    }
  };

  // Handle Paystack callback verification
  const verifyPaystackPayment = async (reference) => {
    try {
      const response = await axios.post('/api/wallet/paystack/verify', {
        reference
      }, authHeaders());

      if (response.data.success) {
        alert('Payment verified and deposit successful!');
        await refreshWalletData();
      } else {
        alert('Payment verification failed');
      }
    } catch (error) {
      alert('Payment verification error: ' + (error.response?.data?.message || error.message));
    }
  };

  // Check for Paystack callback on component mount
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const reference = urlParams.get('reference');
    const trxref = urlParams.get('trxref');
    
    if (reference || trxref) {
      verifyPaystackPayment(reference || trxref);
      // Clean up URL
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, []);

  const handleTransfer = async () => {
    if (!transferAmount || parseFloat(transferAmount) <= 0) return;

    setLoading(true);
    try {
      const response = await axios.post('/api/wallet/transfer', {
        amount: parseFloat(transferAmount),
        fromCurrency: selectedCurrency,
        toCurrency: selectedCurrency
      }, authHeaders());

      if (response.data.success) {
        alert('Transfer successful!');
        setTransferAmount('');
        await refreshWalletData();
      }
    } catch (error) {
      alert('Transfer failed: ' + (error.response?.data?.message || error.message));
    } finally {
      setLoading(false);
    }
  };

  const handleWithdraw = async () => {
    if (!withdrawAmount || parseFloat(withdrawAmount) <= 0 || !selectedWithdrawalMethod) return;

    setLoading(true);
    try {
      const response = await axios.post('/api/wallet/withdraw', {
        amount: parseFloat(withdrawAmount),
        currency: selectedCurrency,
        withdrawalMethodId: selectedWithdrawalMethod
      }, authHeaders());

      if (response.data.success) {
        alert(`Withdrawal successful! Net amount: $${response.data.netAmount}`);
        setWithdrawAmount('');
        await refreshWalletData();
      }
    } catch (error) {
      alert('Withdrawal failed: ' + (error.response?.data?.message || error.message));
    } finally {
      setLoading(false);
    }
  };

  const getWalletBalance = (walletType) => {
    const wallet = wallets.find(w => w.wallet_type === walletType && w.currency === 'USD');
    return wallet ? wallet.balance : 0;
  };

  return (
    <div className="wallet-manager p-6 max-w-4xl mx-auto">
      <h1 className="text-3xl font-bold mb-6">Wallet Management</h1>
      
      {/* Total Balance */}
      <div className="bg-gradient-to-r from-purple-50 to-indigo-50 p-6 rounded-lg border border-purple-200 mb-6">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-semibold mb-2 text-purple-800">Total Account Balance</h2>
          <div>
            <select value={selectedCurrency} onChange={async (e) => { setSelectedCurrency(e.target.value); await fetchBalanceSummary(e.target.value); }} className="p-2 border rounded">
              {availableCurrencies.map(c => (
                <option key={c.code} value={c.code}>{c.code} - {c.name}</option>
              ))}
            </select>
          </div>
        </div>
        <p className="text-4xl font-bold text-purple-600">
          ${totalBalance.toFixed(2)} {selectedCurrency}
        </p>
        <p className="text-sm text-purple-700 mt-2">
          Combined balance across all wallet types
        </p>
      </div>

      {/* Wallet Balances */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        <div className="bg-blue-50 p-6 rounded-lg border">
          <h2 className="text-xl font-semibold mb-2">Spendable Balance</h2>
          <p className="text-3xl font-bold text-blue-600">
            ${getWalletBalance('spendable').toFixed(2)} {selectedCurrency}
          </p>
          <p className="text-sm text-gray-600 mt-2">
            Use this balance to pay for errands
          </p>
        </div>
        
        <div className="bg-green-50 p-6 rounded-lg border">
          <h2 className="text-xl font-semibold mb-2">Withdrawable Balance</h2>
          <p className="text-3xl font-bold text-green-600">
            ${getWalletBalance('withdrawable').toFixed(2)} {selectedCurrency}
          </p>
          <p className="text-sm text-gray-600 mt-2">
            Transfer to bank account or withdraw as cash
          </p>
        </div>
      </div>

      {/* Actions */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
      {/* Deposit */}
        <div className="bg-white p-6 rounded-lg border">
          <h3 className="text-lg font-semibold mb-4">Deposit Funds</h3>
          <input
            type="number"
            placeholder={`Amount (${selectedCurrency})`}
            value={depositAmount}
            onChange={(e) => setDepositAmount(e.target.value)}
            className="w-full p-2 border rounded mb-2"
          />
          <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} className="w-full p-2 border rounded mb-4">
            <option value="paystack">Paystack</option>
            <option value="stripe">Stripe</option>
          </select>
          <button
            onClick={handleDeposit}
            disabled={loading}
            className="w-full bg-blue-500 text-white p-2 rounded hover:bg-blue-600 disabled:opacity-50"
          >
            {loading ? 'Processing...' : 'Deposit'}
          </button>
          <p className="text-xs text-gray-500 mt-2">
            Funds go to spendable balance
          </p>
        </div>

      {/* Transfer */}
        <div className="bg-white p-6 rounded-lg border">
          <h3 className="text-lg font-semibold mb-4">Transfer to Withdrawable</h3>
          <input
            type="number"
            placeholder={`Amount (${selectedCurrency})`}
            value={transferAmount}
            onChange={(e) => setTransferAmount(e.target.value)}
            className="w-full p-2 border rounded mb-4"
          />
          <button
            onClick={handleTransfer}
            disabled={loading}
            className="w-full bg-orange-500 text-white p-2 rounded hover:bg-orange-600 disabled:opacity-50"
          >
            {loading ? 'Processing...' : 'Transfer'}
          </button>
          <p className="text-xs text-gray-500 mt-2">
            Move from spendable to withdrawable
          </p>
        </div>

      {/* Withdraw */}
        <div className="bg-white p-6 rounded-lg border">
          <h3 className="text-lg font-semibold mb-4">Withdraw Funds</h3>
          <input
            type="number"
            placeholder={`Amount (${selectedCurrency})`}
            value={withdrawAmount}
            onChange={(e) => setWithdrawAmount(e.target.value)}
            className="w-full p-2 border rounded mb-2"
          />
          <select
            value={selectedWithdrawalMethod}
            onChange={(e) => setSelectedWithdrawalMethod(e.target.value)}
            className="w-full p-2 border rounded mb-4"
          >
            <option value="">Select withdrawal method</option>
            {withdrawalMethods.map(method => (
              <option key={method.id} value={method.id}>
                {method.method_name} ({method.method_type})
              </option>
            ))}
          </select>
          <button
            onClick={handleWithdraw}
            disabled={loading}
            className="w-full bg-green-500 text-white p-2 rounded hover:bg-green-600 disabled:opacity-50"
          >
            {loading ? 'Processing...' : 'Withdraw'}
          </button>
          <p className="text-xs text-gray-500 mt-2">
            2% withdrawal fee applies
          </p>
        </div>
      </div>

      {/* Transaction History */}
      <div className="bg-white p-6 rounded-lg border">
        <h3 className="text-lg font-semibold mb-4">Recent Transactions</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="text-left p-2">Date</th>
                <th className="text-left p-2">Type</th>
                <th className="text-left p-2">Amount</th>
                <th className="text-left p-2">Status</th>
                <th className="text-left p-2">Description</th>
              </tr>
            </thead>
            <tbody>
              {transactions.map(tx => (
                <tr key={tx.id} className="border-b">
                  <td className="p-2">
                    {new Date(tx.created_at).toLocaleDateString()}
                  </td>
                  <td className="p-2 capitalize">{tx.transaction_type}</td>
                  <td className="p-2">
                    <span className={tx.transaction_type === 'deposit' || tx.transaction_type === 'earning' ? 'text-green-600' : 'text-red-600'}>
                      {tx.transaction_type === 'deposit' || tx.transaction_type === 'earning' ? '+' : '-'}
                      ${tx.amount} {tx.currency}
                    </span>
                  </td>
                  <td className="p-2">
                    <span className={`px-2 py-1 rounded text-xs ${
                      tx.status === 'completed' ? 'bg-green-100 text-green-800' :
                      tx.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                      'bg-red-100 text-red-800'
                    }`}>
                      {tx.status}
                    </span>
                  </td>
                  <td className="p-2">{tx.description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default WalletManager;
