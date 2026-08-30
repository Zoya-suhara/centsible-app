// centsible-frontend/src/pages/Profile.js
import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import LoadingSpinner from '../components/LoadingSpinner';
import './Profile.css';

const Profile = () => {
  const { user, updateUser, changePassword, logout } = useAuth();
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('profile'); // profile, password, preferences
  const [message, setMessage] = useState({ type: '', text: '' });
  
  // Profile form state – changed monthlyGoal to savingsGoal
  const [profileForm, setProfileForm] = useState({
    name: '',
    email: '',
    currency: 'AED',
    weeklyBudget: 0,
    savingsGoal: 0
  });
  
  // Password form state
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  });
  
  // Preferences state
  const [preferences, setPreferences] = useState({
    theme: 'light',
    notifications: true,
    emailDigest: 'weekly',
    language: 'en'
  });

  // Load user data – use savingsGoal instead of monthlyGoal
  useEffect(() => {
    if (user) {
      setProfileForm({
        name: user.name || '',
        email: user.email || '',
        currency: user.currency || 'AED',
        weeklyBudget: user.weeklyBudget || 0,
        savingsGoal: user.savingsGoal || 0
      });
      setPreferences({
        theme: user.theme || 'light',
        notifications: user.notifications !== false,
        emailDigest: user.emailDigest || 'weekly',
        language: user.language || 'en'
      });
    }
  }, [user]);

  // NEW: Apply saved theme on page load (persistence fix)
  useEffect(() => {
    if (user?.theme === 'dark') {
      document.body.classList.add('dark-mode');
    } else {
      document.body.classList.remove('dark-mode');
    }
  }, [user?.theme]);

  // Show temporary message
  const showMessage = (type, text) => {
    setMessage({ type, text });
    setTimeout(() => setMessage({ type: '', text: '' }), 3000);
  };

  // Handle profile update – send savingsGoal, not monthlyGoal
  const handleProfileUpdate = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await updateUser({
        name: profileForm.name,
        currency: profileForm.currency,
        weeklyBudget: profileForm.weeklyBudget,
        savingsGoal: profileForm.savingsGoal
      });
      showMessage('success', 'Profile updated successfully!');
    } catch (error) {
      showMessage('error', error.response?.data?.message || 'Failed to update profile');
    } finally {
      setLoading(false);
    }
  };

  // Handle password change – added current password validation
  const handlePasswordChange = async (e) => {
    e.preventDefault();
    
    // NEW: Check that current password is not empty
    if (!passwordForm.currentPassword) {
      showMessage('error', 'Please enter your current password');
      return;
    }
    
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      showMessage('error', 'New passwords do not match');
      return;
    }
    
    if (passwordForm.newPassword.length < 6) {
      showMessage('error', 'Password must be at least 6 characters');
      return;
    }
    
    setLoading(true);
    try {
      await changePassword({
        currentPassword: passwordForm.currentPassword,
        newPassword: passwordForm.newPassword
      });
      showMessage('success', 'Password changed successfully!');
      setPasswordForm({
        currentPassword: '',
        newPassword: '',
        confirmPassword: ''
      });
    } catch (error) {
      showMessage('error', error.response?.data?.message || 'Failed to change password');
    } finally {
      setLoading(false);
    }
  };

  // Handle preferences update
  const handlePreferencesUpdate = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await updateUser({
        theme: preferences.theme,
        notifications: preferences.notifications,
        emailDigest: preferences.emailDigest,
        language: preferences.language
      });
      
      // Apply theme immediately
      if (preferences.theme === 'dark') {
        document.body.classList.add('dark-mode');
      } else {
        document.body.classList.remove('dark-mode');
      }
      
      showMessage('success', 'Preferences saved!');
    } catch (error) {
      showMessage('error', 'Failed to save preferences');
    } finally {
      setLoading(false);
    }
  };

  // Handle logout
  const handleLogout = async () => {
    if (window.confirm('Are you sure you want to logout?')) {
      await logout();
    }
  };

  // Handle account deletion (unchanged – requires backend endpoint)
  const handleDeleteAccount = async () => {
    const confirmed = window.confirm(
      'WARNING: This will permanently delete ALL your data (transactions, wishlist, rooms). This action cannot be undone. Are you absolutely sure?'
    );
    
    if (confirmed) {
      const finalConfirm = window.prompt(
        'Type "DELETE MY ACCOUNT" to confirm permanent deletion:'
      );
      
      if (finalConfirm === 'DELETE MY ACCOUNT') {
        setLoading(true);
        try {
          const response = await fetch('/api/users/me', {
            method: 'DELETE',
            headers: {
              'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
          });
          
          if (response.ok) {
            await logout();
            showMessage('success', 'Account deleted successfully');
            window.location.href = '/register';
          }
        } catch (error) {
          showMessage('error', 'Failed to delete account');
        } finally {
          setLoading(false);
        }
      }
    }
  };

  if (!user) {
    return <LoadingSpinner fullScreen message="Loading profile..." />;
  }

  return (
    <div className="profile-page">
      <div className="profile-container">
        {/* Header */}
        <div className="profile-header">
          <div className="profile-avatar">
            <span className="avatar-initials">
              {profileForm.name.charAt(0).toUpperCase()}
            </span>
          </div>
          <h1>{profileForm.name}</h1>
          <p className="profile-email">{profileForm.email}</p>
        </div>

        {/* Message Toast */}
        {message.text && (
          <div className={`profile-message profile-message-${message.type}`}>
            {message.type === 'success' ? '✓' : '⚠️'} {message.text}
          </div>
        )}

        {/* Tabs */}
        <div className="profile-tabs">
          <button
            className={`tab-btn ${activeTab === 'profile' ? 'active' : ''}`}
            onClick={() => setActiveTab('profile')}
          >
            📝 Profile Info
          </button>
          <button
            className={`tab-btn ${activeTab === 'password' ? 'active' : ''}`}
            onClick={() => setActiveTab('password')}
          >
            🔒 Change Password
          </button>
          <button
            className={`tab-btn ${activeTab === 'preferences' ? 'active' : ''}`}
            onClick={() => setActiveTab('preferences')}
          >
            ⚙️ Preferences
          </button>
        </div>

        {/* Profile Info Tab */}
        {activeTab === 'profile' && (
          <form onSubmit={handleProfileUpdate} className="profile-form">
            <div className="form-group">
              <label>Full Name</label>
              <input
                type="text"
                value={profileForm.name}
                onChange={(e) => setProfileForm({ ...profileForm, name: e.target.value })}
                placeholder="Your name"
                required
              />
            </div>

            <div className="form-group">
              <label>Email Address</label>
              <input
                type="email"
                value={profileForm.email}
                disabled
                className="disabled-input"
              />
              <small>Email cannot be changed. Contact support if needed.</small>
            </div>

            <div className="form-group">
              <label>Default Currency</label>
              <select
                value={profileForm.currency}
                onChange={(e) => setProfileForm({ ...profileForm, currency: e.target.value })}
              >
                <option value="AED">AED - UAE Dirham</option>
                <option value="USD">USD - US Dollar</option>
                <option value="EUR">EUR - Euro</option>
                <option value="GBP">GBP - British Pound</option>
                <option value="SAR">SAR - Saudi Riyal</option>
                <option value="QAR">QAR - Qatari Riyal</option>
                <option value="KWD">KWD - Kuwaiti Dinar</option>
                <option value="BHD">BHD - Bahraini Dinar</option>
                <option value="OMR">OMR - Omani Rial</option>
              </select>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Weekly Budget Goal (AED)</label>
                <input
                  type="number"
                  value={profileForm.weeklyBudget}
                  onChange={(e) => setProfileForm({ ...profileForm, weeklyBudget: Number(e.target.value) })}
                  placeholder="0"
                  min="0"
                  step="100"
                />
                <small>Target spending per week</small>
              </div>

              <div className="form-group">
                <label>Monthly Savings Goal (AED)</label>
                <input
                  type="number"
                  value={profileForm.savingsGoal}
                  onChange={(e) => setProfileForm({ ...profileForm, savingsGoal: Number(e.target.value) })}
                  placeholder="0"
                  min="0"
                  step="500"
                />
                <small>How much to save each month</small>
              </div>
            </div>

            <button type="submit" className="save-btn" disabled={loading}>
              {loading ? <LoadingSpinner size="small" /> : '💾 Save Changes'}
            </button>
          </form>
        )}

        {/* Change Password Tab */}
        {activeTab === 'password' && (
          <form onSubmit={handlePasswordChange} className="profile-form">
            <div className="form-group">
              <label>Current Password</label>
              <input
                type="password"
                value={passwordForm.currentPassword}
                onChange={(e) => setPasswordForm({ ...passwordForm, currentPassword: e.target.value })}
                placeholder="Enter current password"
                required
              />
            </div>

            <div className="form-group">
              <label>New Password</label>
              <input
                type="password"
                value={passwordForm.newPassword}
                onChange={(e) => setPasswordForm({ ...passwordForm, newPassword: e.target.value })}
                placeholder="Enter new password"
                required
              />
              <small>Minimum 6 characters</small>
            </div>

            <div className="form-group">
              <label>Confirm New Password</label>
              <input
                type="password"
                value={passwordForm.confirmPassword}
                onChange={(e) => setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })}
                placeholder="Confirm new password"
                required
              />
            </div>

            <button type="submit" className="save-btn" disabled={loading}>
              {loading ? <LoadingSpinner size="small" /> : '🔐 Update Password'}
            </button>
          </form>
        )}

        {/* Preferences Tab */}
        {activeTab === 'preferences' && (
          <form onSubmit={handlePreferencesUpdate} className="profile-form">
            <div className="form-group">
              <label>Theme</label>
              <div className="theme-selector">
                <button
                  type="button"
                  className={`theme-option ${preferences.theme === 'light' ? 'active' : ''}`}
                  onClick={() => setPreferences({ ...preferences, theme: 'light' })}
                >
                  ☀️ Light
                </button>
                <button
                  type="button"
                  className={`theme-option ${preferences.theme === 'dark' ? 'active' : ''}`}
                  onClick={() => setPreferences({ ...preferences, theme: 'dark' })}
                >
                  🌙 Dark
                </button>
              </div>
            </div>

            <div className="form-group">
              <label>Language</label>
              <select
                value={preferences.language}
                onChange={(e) => setPreferences({ ...preferences, language: e.target.value })}
              >
                <option value="en">English</option>
                <option value="ar">العربية (Arabic)</option>
                <option value="ur">اردو (Urdu)</option>
                <option value="hi">हिन्दी (Hindi)</option>
              </select>
            </div>

            <div className="form-group">
              <label>Email Digest</label>
              <select
                value={preferences.emailDigest}
                onChange={(e) => setPreferences({ ...preferences, emailDigest: e.target.value })}
              >
                <option value="daily">Daily Summary</option>
                <option value="weekly">Weekly Report</option>
                <option value="monthly">Monthly Overview</option>
                <option value="never">Never</option>
              </select>
            </div>

            <div className="form-group checkbox-group">
              <label>
                <input
                  type="checkbox"
                  checked={preferences.notifications}
                  onChange={(e) => setPreferences({ ...preferences, notifications: e.target.checked })}
                />
                Enable Push Notifications
              </label>
              <small>Get alerts for budget limits and bill reminders</small>
            </div>

            <button type="submit" className="save-btn" disabled={loading}>
              {loading ? <LoadingSpinner size="small" /> : '⚙️ Save Preferences'}
            </button>
          </form>
        )}

        {/* Danger Zone */}
        <div className="profile-danger-zone">
          <h3>⚠️ Danger Zone</h3>
          <div className="danger-actions">
            <button onClick={handleLogout} className="logout-btn">
              🚪 Logout
            </button>
            <button onClick={handleDeleteAccount} className="delete-btn">
              🗑️ Delete Account
            </button>
          </div>
          <small>Deleting your account will permanently remove all your data</small>
        </div>

        {/* Stats Section – only Member Since (removed broken stats) */}
        <div className="profile-stats">
          <h3>📊 Account Stats</h3>
          <div className="stats-grid">
            <div className="stat-card">
              <span className="stat-label">Member Since</span>
              <span className="stat-value">
                {user.createdAt ? new Date(user.createdAt).toLocaleDateString() : 'N/A'}
              </span>
            </div>
            {/* transactionCount and totalSaved removed because backend doesn't provide them yet */}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Profile;