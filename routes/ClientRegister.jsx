import { useState } from 'react';
import axios from 'axios';

export default function ClientRegister() {
  const [form, setForm] = useState({
    full_name: '',
    email: '',
    phone: '',
    password: '',
    location: '',
    weight_needed: '',
    hours_needed: '',
    work_status: '',
    family_details: '',
    privacy_agreed: false,
    terms_accepted: false,
    police_report_submitted: false,
    chatbot_tracking_agreement: false,
  });

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setForm({ ...form, [name]: type === 'checkbox' ? checked : value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await axios.post('http://localhost:5000/api/clients/register', form);
      alert('✅ Client registered successfully!');
    } catch (err) {
      alert('❌ Registration failed: ' + err.message);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="p-6 space-y-3 bg-white rounded-md shadow-md w-full max-w-lg mx-auto">
      <input name="full_name" type="text" placeholder="Full Name" onChange={handleChange} required />
      <input name="email" type="email" placeholder="Email" onChange={handleChange} required />
      <input name="phone" type="text" placeholder="Phone" onChange={handleChange} required />
      <input name="password" type="password" placeholder="Password" onChange={handleChange} required />
      <input name="location" type="text" placeholder="Location" onChange={handleChange} required />
      <input name="weight_needed" type="text" placeholder="Weight Needed (kg)" onChange={handleChange} />
      <input name="hours_needed" type="text" placeholder="Hours Needed" onChange={handleChange} />
      <input name="work_status" type="text" placeholder="Work Info" onChange={handleChange} />
      <textarea name="family_details" placeholder="Family Info" onChange={handleChange}></textarea>

      <label className="block">
        <input name="privacy_agreed" type="checkbox" onChange={handleChange} />
        I agree to the Privacy Policy
      </label>

      <label className="block">
        <input name="terms_accepted" type="checkbox" onChange={handleChange} />
        I accept Terms & Conditions
      </label>

      <label className="block">
        <input name="police_report_submitted" type="checkbox" onChange={handleChange} />
        Police Report Submitted
      </label>

      <label className="block">
        <input name="chatbot_tracking_agreement" type="checkbox" onChange={handleChange} />
        I agree to chatbot tracking
      </label>

      <button
        type="submit"
        className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
      >
        Register
      </button>
    </form>
  );
}
