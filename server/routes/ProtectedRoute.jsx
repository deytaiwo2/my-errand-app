import { Navigate, Outlet } from 'react-router-dom';
import jwtDecode from 'jwt-decode';
import { getToken } from '../services/AuthService';

export default function ProtectedRoute({ role }) {
  const token = getToken();
  if (!token) return <Navigate to={`/login/${role}`} />;

  try {
    const decoded = jwtDecode(token);
    if (decoded.role !== role) return <Navigate to={`/login/${role}`} />;
    return <Outlet />;
  } catch (err) {
    return <Navigate to={`/login/${role}`} />;
  }
}
