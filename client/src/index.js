import React, { Component } from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import App from './App';
import CodeEditor from './codeEditor';
import Signup from './pages/Signup';
import { AuthProvider, ProtectedRoute } from './AuthContext';
import { ToastProvider } from './components/Toast';
import './index.css';

class ErrorBoundary extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('CodeBridge crashed:', error, errorInfo);
    this.setState({ error, errorInfo });
  }

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.error) {
      return (
        <div className="auth-page">
          <div className="auth-card">
            <h1 className="auth-title">Something went wrong</h1>
            <p className="auth-subtitle">
              An unexpected error occurred. Reload to continue.
            </p>
            <pre style={{ fontSize: 12, textAlign: 'left', whiteSpace: 'pre-wrap', maxHeight: 200, overflow: 'auto', marginBottom: 16 }}>
              {String(this.state.error && (this.state.error.message || this.state.error))}
              {this.state.errorInfo && '\n\n' + String(this.state.errorInfo.componentStack || '')}
            </pre>
            <button className="btn btn-primary btn-lg auth-submit" onClick={this.handleReload}>
              Reload
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <Router>
    <ErrorBoundary>
      <ToastProvider>
        <AuthProvider>
          <Routes>
            <Route path="/" element={<Signup />} />
            <Route path="/home" element={<ProtectedRoute><App /></ProtectedRoute>} />
            <Route path="/session/:id" element={<ProtectedRoute><CodeEditor /></ProtectedRoute>} />
          </Routes>
        </AuthProvider>
      </ToastProvider>
    </ErrorBoundary>
  </Router>
);
