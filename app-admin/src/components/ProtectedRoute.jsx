import { Navigate, Outlet } from 'react-router-dom';
import { useAdminAuth } from '../context/useAdminAuth';
import Loading from './Loading';

export default function ProtectedRoute() {
  const { adminUser, authLoading } = useAdminAuth();

  if (authLoading) return <div className="page-loading"><Loading /></div>;
  if (!adminUser) return <Navigate to="/login" replace />;

  return <Outlet />;
}
