import { useEffect, useState } from 'react';
import axios from 'axios';
import { getToken } from '../services/AuthService';

export default function AgentDashboard() {
  const [errands, setErrands] = useState([]);

  useEffect(() => {
    axios.get('http://localhost:5000/api/errands/unassigned', {
      headers: { Authorization: `Bearer ${getToken()}` }
    }).then(res => setErrands(res.data));
  }, []);

  const accept = (id) => {
    axios.patch(`http://localhost:5000/api/errands/assign/${id}`, {}, {
      headers: { Authorization: `Bearer ${getToken()}` }
    }).then(() => setErrands(errands.filter(e => e.id !== id)));
  };

  return (
    <div className="p-4">
      <h2>Available Errands</h2>
      {errands.map(errand => (
        <div key={errand.id} className="p-2 border rounded mb-2">
          <p><strong>Pickup:</strong> {errand.pickup}</p>
          <p><strong>Dropoff:</strong> {errand.dropoff}</p>
          <button onClick={() => accept(errand.id)} className="mt-2 bg-green-600 text-white px-2 py-1 rounded">Accept</button>
        </div>
      ))}
    </div>
  );
}
