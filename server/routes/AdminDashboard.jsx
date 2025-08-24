import { useEffect, useState } from 'react';
import axios from 'axios';

export default function AdminDashboard() {
  const [agents, setAgents] = useState([]);

  useEffect(() => {
    axios.get('http://localhost:5000/api/admin/unverified-agents')
      .then(res => setAgents(res.data));
  }, []);

  const verify = (id) => {
    axios.patch(`http://localhost:5000/api/admin/verify-agent/${id}`)
      .then(() => setAgents(agents.filter(a => a.id !== id)));
  };

  return (
    <div className="p-4">
      <h2 className="text-xl mb-4">Pending Agent Verifications</h2>
      <ul>
        {agents.map(agent => (
          <li key={agent.id} className="mb-3">
            {agent.full_name} — {agent.email}
            <button onClick={() => verify(agent.id)} className="ml-4 bg-green-600 text-white px-2 py-1 rounded">
              Verify
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
