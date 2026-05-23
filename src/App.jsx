import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import ProtectedRoute from './components/ProtectedRoute'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import ReportForm from './pages/ReportForm'
import AdminPanel from './pages/AdminPanel'

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Navigate to="/login" replace />} />
          <Route path="/login" element={<Login />} />

          {/* Ambos roles pueden ver el mapa */}
          <Route path="/dashboard" element={
            <ProtectedRoute><Dashboard /></ProtectedRoute>
          } />

          {/* Solo trabajadores de campo */}
          <Route path="/reportar" element={
            <ProtectedRoute allowedRoles={['trabajador', 'admin']}>
              <ReportForm />
            </ProtectedRoute>
          } />

          {/* Solo admin */}
          <Route path="/admin/reportes" element={
            <ProtectedRoute allowedRoles={['admin']}>
              <AdminPanel />
            </ProtectedRoute>
          } />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}

export default App
