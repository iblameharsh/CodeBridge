import React, { useState } from 'react';
import { auth } from '../firebase';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword } from 'firebase/auth';
import { useNavigate, useLocation, Navigate } from 'react-router-dom';
import { useAuth } from '../AuthContext';
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
  const [error, setError] = useState('');
  const [showLogin, setShowLogin] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = location.state?.from?.pathname || '/home';

  if (loading) {
    return <div className="auth-loading">Loading…</div>;
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
    <div className="signup-container">
      <div className="signup-card">
        <h1 className="signup-heading">CodeBridge</h1>
        <p className="signup-subtitle">
          {showLogin ? 'Login to join a live coding session' : 'Create an account to start collaborating'}
        </p>
        <form onSubmit={handleSubmit} className="signup-form">
          <input
            type="email"
            placeholder="Email"
            value={email}
            required
            onChange={(e) => setEmail(e.target.value)}
          />
          <input
            type="password"
            placeholder="Password (min 6 characters)"
            value={password}
            required
            minLength="6"
            onChange={(e) => setPassword(e.target.value)}
          />
          {!showLogin && (
            <input
              type="password"
              placeholder="Confirm Password"
              value={confirmPassword}
              required
              onChange={(e) => setConfirmPassword(e.target.value)}
            />
          )}
          <button type="submit" className="signup-submit" disabled={submitting}>
            {submitting ? 'Please wait…' : showLogin ? 'Login' : 'Sign Up'}
          </button>
          {error && <p className="error-text">{error}</p>}
        </form>
        <div className="switch-auth">
          {showLogin ? (
            <p>
              Don't have an account?{' '}
              <button type="button" className="switch-auth-btn" onClick={() => switchMode(false)}>
                Sign Up
              </button>
            </p>
          ) : (
            <p>
              Already have an account?{' '}
              <button type="button" className="switch-auth-btn" onClick={() => switchMode(true)}>
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