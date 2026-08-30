import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import './Login.css';

const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { login, isAuthenticated, hasCompletedOnboarding } = useAuth();

  useEffect(() => {
    if (isAuthenticated) {
      if (hasCompletedOnboarding) {
        navigate('/dashboard');
      } else {
        navigate('/onboarding');
      }
    }
  }, [isAuthenticated, hasCompletedOnboarding, navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    console.log('Login attempt with:', { email, password: '***' });

    if (!email || !password) {
      setError('Please fill in all fields');
      setLoading(false);
      return;
    }

    try {
      const result = await login(email, password);
      
      if (result.success) {
        console.log('Login successful:', { user: result.user.email });
        // useEffect will handle redirect
      } else {
        setError(result.error || 'Login failed');
        setLoading(false);
      }
    } catch (err) {
      console.error('Login error:', err);
      
      if (err.response) {
        const status = err.response.status;
        const message = err.response.data?.message || err.response.data?.error;
        
        if (status === 401) {
          setError('Invalid email or password. Please try again.');
        } else if (status === 400) {
          setError(message || 'Please check your email and password format.');
        } else if (status === 404) {
          setError('Login service not found. Please check backend configuration.');
        } else if (status === 500) {
          setError('Server error. Please try again later.');
        } else {
          setError(message || 'Login failed. Please try again.');
        }
      } else if (err.request) {
        setError('Cannot connect to server. Please make sure the backend is running on port 5000');
      } else {
        setError('Network error. Please check your connection and try again.');
      }
      
      setLoading(false);
    }
  };

  return (
    <div className="login-container">
      <div className="login-card">
        <div className="login-header">
          <h1>💰 Centsible</h1>
          <p>Welcome back! Please login to your account</p>
        </div>

        {error && (
          <div className="error-message">
            ⚠️ {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="login-form">
          <div className="form-group">
            <label htmlFor="email">Email Address</label>
            <input
              type="email"
              id="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Enter your email"
              disabled={loading}
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="password">Password</label>
            <input
              type="password"
              id="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
              disabled={loading}
              required
            />
          </div>

          <div className="forgot-password">
            <Link to="/forgot-password">Forgot Password?</Link>
          </div>

          <button 
            type="submit" 
            className="login-btn" 
            disabled={loading}
          >
            {loading ? 'Logging in...' : 'Login'}
          </button>
        </form>

        <div className="login-footer">
          <p>
            Don't have an account? 
            <Link to="/register">Sign up here</Link>
          </p>
        </div>

        <div className="demo-credentials">
          <p><strong>📝 Demo Credentials:</strong></p>
          <p>Email: <strong>demo@centsible.com</strong></p>
          <p>Password: <strong>demo123</strong></p>
        </div>
      </div>
    </div>
  );
};

export default Login;