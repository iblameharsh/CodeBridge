import React, { useState } from 'react';
import { auth } from '../firebase';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword } from 'firebase/auth';
import { useNavigate } from 'react-router-dom';
import './Signup.css';

const Signup = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [showLogin, setShowLogin] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      if (showLogin) {
        await signInWithEmailAndPassword(auth, email, password);
      } else {
        await createUserWithEmailAndPassword(auth, email, password);
      }
      navigate('/home');
    } catch (err) {
      if (err.code === 'auth/email-already-in-use') {
        setShowLogin(true);
        setError('Email already in use. Switch to login instead.');
      } else {
        setError(err.message);
      }
    }
  };

  return (
    <div className="signup-container">
      <h2 className="signup-heading">Create an Account</h2>
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
          placeholder="Password"
          value={password}
          required
          onChange={(e) => setPassword(e.target.value)}
        />
        <button type="submit">{showLogin ? 'Login' : 'Sign Up'}</button>
        {error && <p className="error-text">{error}</p>}
        {showLogin && (
          <p style={{ marginTop: '10px' }}>
            Don't have an account?{' '}
            <button
              type="button"
              onClick={() => setShowLogin(false)}
              className="switch-auth-btn"
            >
              Switch to Sign Up
            </button>
          </p>
        )}
      </form>
    </div>
  );
};

export default Signup;
