import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import App from './App';
import CodeEditor from './codeEditor';
import Signup from './pages/Signup';
import { AuthProvider, ProtectedRoute } from './AuthContext';
import { ToastProvider } from './components/Toast';
import './index.css';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <Router>
    <ToastProvider>
      <AuthProvider>
        <Routes>
          <Route path="/" element={<Signup />} />
          <Route path="/home" element={<ProtectedRoute><App /></ProtectedRoute>} />
          <Route path="/session/:id" element={<ProtectedRoute><CodeEditor /></ProtectedRoute>} />
        </Routes>
      </AuthProvider>
    </ToastProvider>
  </Router>
);
