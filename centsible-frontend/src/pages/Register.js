import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom'; // Added navigate
import { useAuth } from '../context/AuthContext';
import './Register.css';

const Register = () => {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
    currency: 'AED',
    userType: 'professional'
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { register } = useAuth();
  const navigate = useNavigate(); // Added for redirect

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    // Validation
    if (!formData.name || !formData.email || !formData.password) {
      setError('Please fill in all required fields');
      setLoading(false);
      return;
    }

    if (formData.password !== formData.confirmPassword) {
      setError('Passwords do not match');
      setLoading(false);
      return;
    }

    if (formData.password.length < 6) {
      setError('Password must be at least 6 characters');
      setLoading(false);
      return;
    }

    try {
      const result = await register({
        name: formData.name,
        email: formData.email,
        password: formData.password,
        currency: formData.currency,
        userType: formData.userType
      });

      if (!result.success) {
        setError(result.error || 'Registration failed. Please try again.');
        setLoading(false);
      } else {
        // SUCCESS! Redirect to login page
        navigate('/login');
      }
    } catch (err) {
      console.error('Registration error:', err);
      setError('Network error. Please make sure the backend server is running.');
      setLoading(false);
    }
  };

  return (
    <div className="register-container">
      <div className="register-card">
        <div className="register-header">
          <h1>💰 Centsible</h1>
          <p>Create your account to start saving money</p>
        </div>

        {error && (
          <div className="error-message" style={{ 
            backgroundColor: '#fee', 
            color: '#c00', 
            padding: '10px', 
            borderRadius: '5px', 
            marginBottom: '15px',
            textAlign: 'center'
          }}>
            ⚠️ {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="register-form">
          <div className="form-group">
            <label htmlFor="name">Full Name *</label>
            <input
              type="text"
              id="name"
              name="name"
              value={formData.name}
              onChange={handleChange}
              placeholder="Enter your full name"
              disabled={loading}
              required
              style={{
                width: '100%',
                padding: '12px',
                border: '2px solid #e0e0e0',
                borderRadius: '8px',
                fontSize: '16px',
                backgroundColor: '#fafafa',
                color: '#333',  // FIXED: Explicit text color
                transition: 'all 0.3s ease'
              }}
            />
          </div>

          <div className="form-group">
            <label htmlFor="email">Email Address *</label>
            <input
              type="email"
              id="email"
              name="email"
              value={formData.email}
              onChange={handleChange}
              placeholder="Enter your email"
              disabled={loading}
              required
              style={{
                width: '100%',
                padding: '12px',
                border: '2px solid #e0e0e0',
                borderRadius: '8px',
                fontSize: '16px',
                backgroundColor: '#fafafa',
                color: '#333',  // FIXED: Explicit text color
                transition: 'all 0.3s ease'
              }}
            />
          </div>

          <div className="form-row" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
            <div className="form-group">
              <label htmlFor="password">Password *</label>
              <input
                type="password"
                id="password"
                name="password"
                value={formData.password}
                onChange={handleChange}
                placeholder="Min. 6 characters"
                disabled={loading}
                required
                style={{
                  width: '100%',
                  padding: '12px',
                  border: '2px solid #e0e0e0',
                  borderRadius: '8px',
                  fontSize: '16px',
                  backgroundColor: '#fafafa',
                  color: '#333',  // FIXED: Explicit text color
                  transition: 'all 0.3s ease'
                }}
              />
            </div>

            <div className="form-group">
              <label htmlFor="confirmPassword">Confirm Password *</label>
              <input
                type="password"
                id="confirmPassword"
                name="confirmPassword"
                value={formData.confirmPassword}
                onChange={handleChange}
                placeholder="Confirm your password"
                disabled={loading}
                required
                style={{
                  width: '100%',
                  padding: '12px',
                  border: '2px solid #e0e0e0',
                  borderRadius: '8px',
                  fontSize: '16px',
                  backgroundColor: '#fafafa',
                  color: '#333',  // FIXED: Explicit text color
                  transition: 'all 0.3s ease'
                }}
              />
            </div>
          </div>

          <div className="form-row" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
            <div className="form-group">
              <label htmlFor="currency">Preferred Currency</label>
              <select
                id="currency"
                name="currency"
                value={formData.currency}
                onChange={handleChange}
                disabled={loading}
                style={{
                  width: '100%',
                  padding: '12px',
                  border: '2px solid #e0e0e0',
                  borderRadius: '8px',
                  fontSize: '16px',
                  backgroundColor: '#fafafa',
                  color: '#333',  // FIXED: Explicit text color
                  cursor: 'pointer'
                }}
              >
                <option value="AED">AED - UAE Dirham</option>
                <option value="USD">USD - US Dollar</option>
                <option value="EUR">EUR - Euro</option>
                <option value="GBP">GBP - British Pound</option>
                <option value="SAR">SAR - Saudi Riyal</option>
              </select>
            </div>

            <div className="form-group">
              <label htmlFor="userType">How would you describe yourself?</label>
              <select
                id="userType"
                name="userType"
                value={formData.userType}
                onChange={handleChange}
                disabled={loading}
                style={{
                  width: '100%',
                  padding: '12px',
                  border: '2px solid #e0e0e0',
                  borderRadius: '8px',
                  fontSize: '16px',
                  backgroundColor: '#fafafa',
                  color: '#333',  // FIXED: Explicit text color
                  cursor: 'pointer'
                }}
              >
                <option value="student">🎓 Student</option>
                <option value="professional">💼 Professional</option>
                <option value="freelancer">✨ Freelancer</option>
                <option value="business">🏢 Business Owner</option>
                <option value="retired">🌴 Retired</option>
                <option value="other">🤔 Other</option>
              </select>
            </div>
          </div>

          <button 
            type="submit" 
            className="register-btn" 
            disabled={loading}
            style={{
              width: '100%',
              padding: '14px',
              backgroundColor: '#667eea',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              fontSize: '16px',
              fontWeight: '600',
              cursor: loading ? 'not-allowed' : 'pointer',
              marginTop: '20px',
              transition: 'all 0.3s ease'
            }}
            onMouseEnter={(e) => !loading && (e.target.style.backgroundColor = '#764ba2')}
            onMouseLeave={(e) => !loading && (e.target.style.backgroundColor = '#667eea')}
          >
            {loading ? 'Creating Account...' : 'Create Account'}
          </button>
        </form>

        <div className="register-footer" style={{ marginTop: '20px', textAlign: 'center' }}>
          <p style={{ color: '#666' }}>
            Already have an account?{' '}
            <Link to="/login" style={{ color: '#667eea', textDecoration: 'none', fontWeight: '500' }}>
              Login here
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
};

export default Register;