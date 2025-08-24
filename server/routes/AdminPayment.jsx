import { useEffect, useState } from 'react';
import axios from 'axios';

export default function AdminPayments() {
  const [payments, setPayments] = useState([]);

  useEffect(() => {
    axios.get('/api/admin/payments').then(res => setPayments(res.data));
  }, []);

  return (
    <div className="p-4">
      <h2 className="text-2xl font-bold mb-4">Payment History</h2>
      <table className="w-full table-auto">
        <thead>
          <tr>
            <th>Client</th>
            <th>Pickup</th>
            <th>Dropoff</th>
            <th>Amount</th>
            <th>Currency</th>
            <th>Email</th>
            <th>Date</th>
          </tr>
        </thead>
        <tbody>
          {payments.map(p => (
            <tr key={p.id}>
              <td>{p.client}</td>
              <td>{p.pickup}</td>
              <td>{p.dropoff}</td>
              <td>${p.amount}</td>
              <td>{p.currency}</td>
              <td>{p.payer_email}</td>
              <td>{new Date(p.created_at).toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
