import { useState } from 'react';
import { loginUser } from '../services/AuthService';
import { useNavigate } from 'react-router-dom';

export default function Login({ userType = 'client' }) {
  const [form, setForm] = useState({ email: '', password: '' });
  const navigate = useNavigate();

  const handleLogin = async (e) => {
    e.preventDefault();
    try {
      await loginUser(userType, form);
      navigate(userType === 'client' ? '/dashboard/client' : '/dashboard/agent');
    } catch (err) {
      alert('Login failed');
    }
  };

  return (
    <form onSubmit={handleLogin} className="p-6 bg-white rounded shadow-md w-96 mx-auto">
      <h2 className="text-xl mb-4">Login ({userType})</h2>
      <input placeholder="Email" onChange={e => setForm({ ...form, email: e.target.value })} />
      <input type="password" placeholder="Password" onChange={e => setForm({ ...form, password: e.target.value })} />
      <button type="submit" className="mt-4 bg-blue-600 text-white px-3 py-1 rounded">Login</button>
    </form>
  );
}
