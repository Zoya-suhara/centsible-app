import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import './Settings.css';

const Settings = () => {
  const { user, updateUser, logout } = useAuth();
  const [formData, setFormData] = useState({
    name: user?.name || '',
    currency: user?.currency || 'AED',
    userType: user?.userType || 'professional',
    monthlyIncome: user?.monthlyIncome || 0,
    savingsGoal: user?.savingsGoal || 0
  });
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage({ type: '', text: '' });

    const result = await updateUser(formData);

    if (result.success) {
      setMessage({ type: 'success', text: 'Settings updated successfully!' });
      setTimeout(() => setMessage({ type: '', text: '' }), 3000);
    } else {
      setMessage({ type: 'error', text: result.error || 'Failed to update settings' });
    }

    setLoading(false);
  };

  const handleLogout = () => {
    if (window.confirm('Are you sure you want to logout?')) {
      logout();
    }
  };

  const handleResetData = () => {
    if (window.confirm('⚠️ WARNING: This will delete all your data. This action cannot be undone. Are you sure?')) {
      // Implement data reset logic
      localStorage.clear();
      window.location.reload();
    }
  };

  return (
    <div className="settings-container">
      <div className="settings-header">
        <h1>⚙️ Settings</h1>
        <p>Manage your account preferences and financial goals</p>
      </div>

      {message.text && (
        <div className={`settings-message ${message.type}`}>
          {message.type === 'success' ? '✅' : '⚠️'} {message.text}
        </div>
      )}

      <div className="settings-content">
        <form onSubmit={handleSubmit} className="settings-form">
          <div className="settings-section">
            <h2>Profile Information</h2>
            
            <div className="form-group">
              <label htmlFor="name">Full Name</label>
              <input
                type="text"
                id="name"
                name="name"
                value={formData.name}
                onChange={handleChange}
                placeholder="Your name"
              />
            </div>

            <div className="form-group">
              <label htmlFor="email">Email Address</label>
              <input
                type="email"
                id="email"
                value={user?.email || ''}
                disabled
                className="disabled-input"
              />
              <small>Email cannot be changed</small>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label htmlFor="currency">Currency</label>
                <select
                  id="currency"
                  name="currency"
                  value={formData.currency}
                  onChange={handleChange}
                >
                  <option value="AED">AED - UAE Dirham</option>
                  <option value="USD">USD - US Dollar</option>
                  <option value="EUR">EUR - Euro</option>
                  <option value="GBP">GBP - British Pound</option>
                  <option value="SAR">SAR - Saudi Riyal</option>
                </select>
              </div>

              <div className="form-group">
                <label htmlFor="userType">User Type</label>
                <select
                  id="userType"
                  name="userType"
                  value={formData.userType}
                  onChange={handleChange}
                >
                  <option value="student">Student</option>
                  <option value="professional">Professional</option>
                  <option value="freelancer">Freelancer</option>
                  <option value="business">Business Owner</option>
                  <option value="retired">Retired</option>
                </select>
              </div>
            </div>
          </div>

          <div className="settings-section">
            <h2>Financial Goals</h2>
            
            <div className="form-row">
              <div className="form-group">
                <label htmlFor="monthlyIncome">Monthly Income (AED)</label>
                <input
                  type="number"
                  id="monthlyIncome"
                  name="monthlyIncome"
                  value={formData.monthlyIncome}
                  onChange={handleChange}
                  placeholder="0"
                  min="0"
                  step="100"
                />
              </div>

              <div className="form-group">
                <label htmlFor="savingsGoal">Monthly Savings Goal (AED)</label>
                <input
                  type="number"
                  id="savingsGoal"
                  name="savingsGoal"
                  value={formData.savingsGoal}
                  onChange={handleChange}
                  placeholder="0"
                  min="0"
                  step="100"
                />
              </div>
            </div>
          </div>

          <div className="settings-actions">
            <button type="submit" className="save-btn" disabled={loading}>
              {loading ? 'Saving...' : '💾 Save Changes'}
            </button>
          </div>
        </form>

        <div className="settings-sidebar">
          <div className="settings-section">
            <h2>Account Management</h2>
            
            <button onClick={handleLogout} className="logout-btn">
              🚪 Logout
            </button>
            
            <button onClick={handleResetData} className="reset-btn">
              ⚠️ Reset All Data
            </button>
          </div>

          <div className="settings-section">
            <h2>App Information</h2>
            <div className="info-item">
              <strong>Version:</strong> 2.0.0
            </div>
            <div className="info-item">
              <strong>Account Created:</strong>{' '}
              {user?.createdAt ? new Date(user.createdAt).toLocaleDateString() : 'N/A'}
            </div>
          </div>

          <div className="settings-section">
            <h2>Support</h2>
            <p>Need help? Contact us at:</p>
            <a href="mailto:support@centsible.com">support@centsible.com</a>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Settings;