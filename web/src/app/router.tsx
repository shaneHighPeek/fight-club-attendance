import { Navigate, createBrowserRouter } from 'react-router-dom';

import { RequireAuth } from '../auth/RequireAuth';
import { NotFoundPage } from '../pages/NotFoundPage';
import { AdminHomePage } from '../pages/admin/AdminHomePage';
import { AdminLoginPage } from '../pages/admin/AdminLoginPage';
import { AttendancePage } from '../pages/admin/AttendancePage';
import { ClassSchedulePage } from '../pages/admin/ClassSchedulePage';
import { MembersPage } from '../pages/admin/MembersPage';
import { SettingsPage } from '../pages/admin/SettingsPage';
import { CasualWaiverPage } from '../pages/kiosk/CasualWaiverPage';
import { ConfirmCheckInPage } from '../pages/kiosk/ConfirmCheckInPage';
import { KioskHomePage } from '../pages/kiosk/KioskHomePage';
import { KioskLockedPage } from '../pages/kiosk/KioskLockedPage';
import { KioskSuccessPage } from '../pages/kiosk/KioskSuccessPage';
import { MemberLookupPage } from '../pages/kiosk/MemberLookupPage';
import { MemberSelectPage } from '../pages/kiosk/MemberSelectPage';

export const router = createBrowserRouter([
  {
    path: '/',
    element: <Navigate to="/kiosk" replace />,
  },
  {
    path: '/kiosk',
    element: <KioskHomePage />,
  },
  {
    path: '/kiosk/member-lookup',
    element: <MemberLookupPage />,
  },
  {
    path: '/kiosk/member-select',
    element: <MemberSelectPage />,
  },
  {
    path: '/kiosk/confirm-checkin',
    element: <ConfirmCheckInPage />,
  },
  {
    path: '/kiosk/casual-waiver',
    element: <CasualWaiverPage />,
  },
  {
    path: '/kiosk/success',
    element: <KioskSuccessPage />,
  },
  {
    path: '/kiosk/locked',
    element: <KioskLockedPage />,
  },
  {
    path: '/admin/login',
    element: <AdminLoginPage />,
  },
  {
    element: <RequireAuth allowedRoles={['admin', 'manager', 'coach']} />,
    children: [
      {
        path: '/admin',
        element: <AdminHomePage />,
      },
      {
        path: '/admin/attendance',
        element: <AttendancePage />,
      },
      {
        path: '/admin/classes',
        element: <ClassSchedulePage />,
      },
      {
        path: '/admin/members',
        element: <MembersPage />,
      },
      {
        path: '/admin/settings',
        element: <SettingsPage />,
      },
    ],
  },
  {
    path: '*',
    element: <NotFoundPage />,
  },
]);
