import { useState } from 'react';
import axios from 'axios';
import { getToken } from '../services/AuthService';



import { GoogleMap, Marker, useJsApiLoader } from '@react-google-maps/api';
import { useState, useEffect } from 'react';
import { socket, useSocket } from '../hooks/useSocket';

export default function ClientDashboard() {
  const [location, setLocation] = useState(null);
  const { isLoaded } = useJsApiLoader({ googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_KEY });
  const user = JSON.parse(atob(localStorage.getItem('token').split('.')[1]));

  useSocket();

  useEffect(() => {
    socket.on(`client:update:${user.id}`, setLocation);
    return () => socket.off(`client:update:${user.id}`);
  }, []);

  if (!isLoaded) return <p>Loading Map...</p>;

  return (
    <div className="h-[500px] w-full">
      <GoogleMap
        center={location || { lat: 0, lng: 0 }}
        zoom={14}
        mapContainerStyle={{ height: '100%', width: '100%' }}
      >
        {location && <Marker position={location} />}
      </GoogleMap>
    </div>
  );
}

export default function ClientDashboard() {
  const [form, setForm] = useState({ pickup: '', dropoff: '', note: '', weight_kg: 0, estimated_hours: 1 });

  const handleCreate = async (e) => {
    e.preventDefault();
    await axios.post('http://localhost:5000/api/errands/create', form, {
      headers: { Authorization: `Bearer ${getToken()}` }
    });
    alert('Errand created!');
  };

  return (
    <form onSubmit={handleCreate} className="p-6 max-w-md bg-white rounded shadow space-y-3">
      <input placeholder="Pickup" onChange={e => setForm({ ...form, pickup: e.target.value })} />
      <input placeholder="Dropoff" onChange={e => setForm({ ...form, dropoff: e.target.value })} />
      <input placeholder="Note" onChange={e => setForm({ ...form, note: e.target.value })} />
      <input type="number" placeholder="Weight (kg)" onChange={e => setForm({ ...form, weight_kg: e.target.value })} />
      <input type="number" placeholder="Estimated hours" onChange={e => setForm({ ...form, estimated_hours: e.target.value })} />
      <button type="submit" className="bg-blue-600 text-white px-3 py-1 rounded">Create Errand</button>
    </form>
  );
}
