import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ConfigProvider } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import Login from './pages/Login';
import AppLayout from './components/Layout';
import Generate from './pages/Generate';
import BatchGenerate from './pages/BatchGenerate';
import History from './pages/History';
import Templates from './pages/Templates';
import TemplateSets from './pages/TemplateSets';
import Employees from './pages/Employees';
import SocialWages from './pages/SocialWages';
import Companies from './pages/Companies';
import DataManagement from './pages/DataManagement';
import { isLoggedIn } from './utils/auth';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  if (!isLoggedIn()) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <ConfigProvider locale={zhCN}>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <AppLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<Navigate to="/employees" replace />} />
            <Route path="employees" element={<Employees />} />
            <Route path="companies" element={<Companies />} />
            <Route path="generate" element={<Generate />} />
            <Route path="batch" element={<BatchGenerate />} />
            <Route path="history" element={<History />} />
            <Route path="templates" element={<Templates />} />
            <Route path="template-sets" element={<TemplateSets />} />
            <Route path="social-wages" element={<SocialWages />} />
            <Route path="data-management" element={<DataManagement />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </ConfigProvider>
  );
}
