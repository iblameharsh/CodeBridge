import React, { useState } from 'react';
import { auth } from '../firebase';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword } from 'firebase/auth';
import { useNavigate, useLocation, Navigate } from 'react-router-dom';
import { useAuth } from '../AuthContext';
import { Code2, Mail, Lock, Eye, EyeOff, Loader2 } from 'lucide-react';
import './Signup.css';

const friendlyError = (code, message) => {
  switch (code) {
    case 'auth/email-already-in-use':
      return 'This email is already registered. Switch to Login.';
    case 'auth/user-not-found':
    case 'auth/wrong-password':
    case 'auth/invalid-credential':
      return 'Incorrect email or password.';
    case 'auth/invalid-email':
      return 'Please enter a valid email address.';
    case 'auth/weak-password':
      return 'Password should be at least 6 characters.';
    case 'auth/too-many-requests':
      return 'Too many attempts. Please try again later.';
    case 'auth/network-request-failed':
      return 'Network error. Check your connection and try again.';
    default:
      return message;
  }
};

const Signup = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [showLogin, setShowLogin] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = location.state?.from?.pathname || '/home';

  if (loading) {
    return (
      <div className="page-loader">
        <Loader2 className="spinner" size={28} />
        <span>Loading…</span>
      </div>
    );
  }

  if (user) {
    return <Navigate to={from} replace />;
  }

  const switchMode = (login) => {
    setShowLogin(login);
    setError('');
    setConfirmPassword('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!showLogin && password !== confirmPassword) {
      setError("Passwords don't match.");
      return;
    }
    setSubmitting(true);
    try {
      if (showLogin) {
        await signInWithEmailAndPassword(auth, email, password);
      } else {
        await createUserWithEmailAndPassword(auth, email, password);
      }
      navigate(from, { replace: true });
    } catch (err) {
      if (err.code === 'auth/email-already-in-use') {
        switchMode(true);
      }
      setError(friendlyError(err.code, err.message));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-logo">
          <Code2 size={26} />
        </div>
        <h1 className="auth-title">CodeBridge</h1>
        <p className="auth-subtitle">
          {showLogin ? 'Welcome back — login to your session' : 'Create your account to start collaborating'}
        </p>

        <form onSubmit={handleSubmit} className="auth-form">
          <div className="auth-field">
            <Mail size={18} className="auth-field-icon" />
            <input
              type="email"
              className="input"
              placeholder="Email"
              value={email}
              required
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div className="auth-field">
            <Lock size={18} className="auth-field-icon" />
            <input
              type={showPassword ? 'text' : 'password'}
              className="input"
              placeholder="Password (min 6 characters)"
              value={password}
              required
              minLength="6"
              onChange={(e) => setPassword(e.target.value)}
            />
            <button
              type="button"
              className="auth-toggle-pass"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>

          {!showLogin && (
            <div className="auth-field">
              <Lock size={18} className="auth-field-icon" />
              <input
                type={showPassword ? 'text' : 'password'}
                className="input"
                placeholder="Confirm Password"
                value={confirmPassword}
                required
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
            </div>
          )}

          {error && <p className="auth-error">{error}</p>}

          <button type="submit" className="btn btn-primary btn-lg auth-submit" disabled={submitting}>
            {submitting ? (
              <>
                <Loader2 className="spinner" size={18} />
                Please wait…
              </>
            ) : showLogin ? (
              'Login'
            ) : (
              'Sign Up'
            )}
          </button>
        </form>

        <div className="auth-switch">
          {showLogin ? (
            <p>
              Don&apos;t have an account?{' '}
              <button type="button" onClick={() => switchMode(false)}>
                Sign Up
              </button>
            </p>
          ) : (
            <p>
              Already have an account?{' '}
              <button type="button" onClick={() => switchMode(true)}>
                Login
              </button>
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

export default Signup;