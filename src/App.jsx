import { Navigate, Route, Routes } from 'react-router-dom';
import { useStore } from './lib/store';
import { homePath } from './lib/permissions';
import Layout, { allowed } from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import SchoolProfile from './pages/SchoolProfile';
import Students from './pages/Students';
import StudentForm from './pages/StudentForm';
import StudentDetail from './pages/StudentDetail';
import Guardians from './pages/Guardians';
import Academics from './pages/Academics';
import Promotion from './pages/Promotion';
import Fees from './pages/Fees';
import Debtors from './pages/Debtors';
import FeeStructure from './pages/FeeStructure';
import Staff from './pages/Staff';
import Payroll from './pages/Payroll';
import Inventory from './pages/Inventory';
import Reports from './pages/Reports';
import Announcements from './pages/Announcements';
import Users from './pages/Users';
import MyClass from './pages/MyClass';
import Portal from './pages/Portal';
import ParentDashboard from './pages/ParentDashboard';
import PayFees from './pages/PayFees';
import ParentPayments, { ParentNews } from './pages/ParentPayments';
import PaymentRequests from './pages/PaymentRequests';
import Account from './pages/Account';
import Signup from './pages/Signup';
import Signups from './pages/Signups';
import MyWork from './pages/MyWork';

function Guard({ perm, children }) {
  const { user } = useStore();
  if (!allowed(user, perm)) return <Navigate to={homePath(user)} replace />;
  return children;
}

export default function App() {
  const { user } = useStore();
  if (!user) {
    return (
      <Routes>
        <Route path="/signup" element={<Signup />} />
        <Route path="*" element={<Login />} />
      </Routes>
    );
  }
  const g = (perm, el) => <Guard perm={perm}>{el}</Guard>;
  return (
    <Routes>
      <Route path="/login" element={<Navigate to={homePath(user)} replace />} />
      <Route element={<Layout />}>
        <Route index element={g('dashboard', <Dashboard />)} />
        <Route path="school" element={g('school.view', <SchoolProfile />)} />
        <Route path="students" element={g('students.view', <Students />)} />
        <Route path="students/new" element={g('students.edit', <StudentForm />)} />
        <Route path="students/:id" element={g(['students.view', 'myclass'], <StudentDetail />)} />
        <Route path="students/:id/edit" element={g('students.edit', <StudentForm />)} />
        <Route path="guardians" element={g('guardians.edit', <Guardians />)} />
        <Route path="academics" element={g('academics.edit', <Academics />)} />
        <Route path="promotion" element={g('promotion', <Promotion />)} />
        <Route path="fees" element={g('fees.view', <Fees />)} />
        <Route path="fees/online" element={g('fees.collect', <PaymentRequests />)} />
        <Route path="fees/debtors" element={g('fees.view', <Debtors />)} />
        <Route path="fees/structure" element={g('fees.setup', <FeeStructure />)} />
        <Route path="staff" element={g('staff.view', <Staff />)} />
        <Route path="payroll" element={g('payroll', <Payroll />)} />
        <Route path="inventory" element={g('inventory', <Inventory />)} />
        <Route path="reports" element={g(['reports.financial', 'reports.academic'], <Reports />)} />
        <Route path="announcements" element={<Announcements />} />
        <Route path="users" element={g('users', <Users />)} />
        <Route path="my-class" element={g('myclass', <MyClass />)} />
        <Route path="portal" element={g('portal', <ParentDashboard />)} />
        <Route path="portal/children" element={g('portal', <Portal />)} />
        <Route path="portal/pay" element={g('portal', <PayFees />)} />
        <Route path="portal/payments" element={g('portal', <ParentPayments />)} />
        <Route path="portal/news" element={g('portal', <ParentNews />)} />
        <Route path="account" element={<Account />} />
        <Route path="me" element={g('me', <MyWork />)} />
        <Route path="signups" element={g('signups', <Signups />)} />
        <Route path="signup" element={<Navigate to={homePath(user)} replace />} />
        <Route path="*" element={<Navigate to={homePath(user)} replace />} />
      </Route>
    </Routes>
  );
}
