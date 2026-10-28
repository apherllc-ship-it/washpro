import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useApp, homeFor } from './context/AppContext.jsx';
import AppLayout, { PublicLayout } from './components/Layout.jsx';
import { PageLoader } from './components/ui.jsx';
import Home from './pages/Home.jsx';
import { Login, Signup, ForgotPassword, ResetPassword } from './pages/Auth.jsx';

const QuoteBuilder = lazy(() => import('./pages/QuoteBuilder.jsx'));
const CustomerDashboard = lazy(() => import('./pages/customer/Dashboard.jsx'));
const CustomerQuotes = lazy(() => import('./pages/customer/Quotes.jsx'));
const QuoteDetail = lazy(() => import('./pages/customer/QuoteDetail.jsx'));
const BookQuote = lazy(() => import('./pages/customer/BookQuote.jsx'));
const CustomerBookings = lazy(() => import('./pages/customer/Bookings.jsx'));
const BookingDetail = lazy(() => import('./pages/customer/BookingDetail.jsx'));
const Profile = lazy(() => import('./pages/customer/Profile.jsx'));
const ProJobs = lazy(() => import('./pages/pro/Jobs.jsx'));
const ProCalendar = lazy(() => import('./pages/pro/ProCalendar.jsx'));
const ProJobDetail = lazy(() => import('./pages/pro/JobDetail.jsx'));
const AdminDashboard = lazy(() => import('./pages/admin/Dashboard.jsx'));
const AdminCalendar = lazy(() => import('./pages/admin/AdminCalendar.jsx'));
const AdminBookings = lazy(() => import('./pages/admin/Bookings.jsx'));
const AdminBookingDetail = lazy(() => import('./pages/admin/BookingDetail.jsx'));
const AdminQuotes = lazy(() => import('./pages/admin/Quotes.jsx'));
const AdminCustomers = lazy(() => import('./pages/admin/Customers.jsx'));
const AdminCustomerDetail = lazy(() => import('./pages/admin/CustomerDetail.jsx'));
const AdminUsers = lazy(() => import('./pages/admin/Users.jsx'));
const AdminServices = lazy(() => import('./pages/admin/Services.jsx'));
const AdminSettings = lazy(() => import('./pages/admin/Settings.jsx'));

// Route guard: requires sign-in and (optionally) one of the given roles.
function Protected({ roles, children }) {
  const { user, ready } = useApp();
  const loc = useLocation();
  if (!ready) return <PageLoader />;
  if (!user) return <Navigate to={`/login?next=${encodeURIComponent(loc.pathname + loc.search)}`} replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to={homeFor(user)} replace />;
  return children;
}

function GuestOnly({ children }) {
  const { user, ready } = useApp();
  if (!ready) return <PageLoader />;
  return user ? <Navigate to={homeFor(user)} replace /> : children;
}

export default function App() {
  const { ready, user } = useApp();
  if (!ready) return <PageLoader />;

  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
        <Route element={<PublicLayout />}>
          <Route index element={<Home />} />
          <Route path="login" element={<GuestOnly><Login /></GuestOnly>} />
          <Route path="signup" element={<GuestOnly><Signup /></GuestOnly>} />
          <Route path="forgot-password" element={<ForgotPassword />} />
          <Route path="reset-password" element={<ResetPassword />} />
          {!user && <Route path="quote" element={<QuoteBuilder />} />}
        </Route>

        <Route element={<Protected><AppLayout /></Protected>}>
          {user && <Route path="quote" element={<QuoteBuilder />} />}
          <Route path="app/profile" element={<Profile />} />
        </Route>

        <Route path="app" element={<Protected roles={['CUSTOMER']}><AppLayout /></Protected>}>
          <Route index element={<CustomerDashboard />} />
          <Route path="quotes" element={<CustomerQuotes />} />
          <Route path="quotes/:id" element={<QuoteDetail />} />
          <Route path="quotes/:id/book" element={<BookQuote />} />
          <Route path="bookings" element={<CustomerBookings />} />
          <Route path="bookings/:id" element={<BookingDetail />} />
        </Route>

        <Route path="pro" element={<Protected roles={['PRO', 'ADMIN']}><AppLayout /></Protected>}>
          <Route index element={<ProJobs />} />
          <Route path="calendar" element={<ProCalendar />} />
          <Route path="jobs/:id" element={<ProJobDetail />} />
        </Route>

        <Route path="admin" element={<Protected roles={['ADMIN']}><AppLayout /></Protected>}>
          <Route index element={<AdminDashboard />} />
          <Route path="calendar" element={<AdminCalendar />} />
          <Route path="bookings" element={<AdminBookings />} />
          <Route path="bookings/:id" element={<AdminBookingDetail />} />
          <Route path="quotes" element={<AdminQuotes />} />
          <Route path="quotes/:id" element={<QuoteDetail admin />} />
          <Route path="customers" element={<AdminCustomers />} />
          <Route path="customers/:id" element={<AdminCustomerDetail />} />
          <Route path="users" element={<AdminUsers />} />
          <Route path="services" element={<AdminServices />} />
          <Route path="settings" element={<AdminSettings />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}
