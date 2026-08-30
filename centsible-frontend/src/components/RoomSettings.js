import React, { useState } from 'react';
import { useRoom } from '../context/RoomContext';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import './RoomSettings.css'; // You'll need to create this CSS file

const RoomSettings = ({ onLeave }) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const {
    roomData,
    balances,
    updateBudgets,
    leaveRoom,
    isAdmin,
    isOwner,
    refreshRoom,
  } = useRoom();

  const [activeTab, setActiveTab] = useState('members'); // members, budgets, settings
  const [budgetEditMode, setBudgetEditMode] = useState(false);
  const [budgetValues, setBudgetValues] = useState({});
  const [roomName, setRoomName] = useState(roomData?.roomName || '');
  const [roomType, setRoomType] = useState(roomData?.roomType || 'other');
  const [currency, setCurrency] = useState(roomData?.currency || 'AED');
  const [settings, setSettings] = useState(roomData?.settings || {});
  const [loading, setLoading] = useState(false);

  const toast = (message, type = 'info') => {
    if (window.toast) {
      window.toast[type]?.(message) || window.toast.info(message);
    } else {
      console.log(`[Toast] ${type}: ${message}`);
    }
  };

  const formatCurrency = (amount) => {
    const curr = roomData?.currency || 'AED';
    try {
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: curr,
        minimumFractionDigits: 0,
      }).format(amount);
    } catch {
      return `${amount} ${curr}`;
    }
  };

  // --------------------------------------------------------------------
  // Member Actions (to be implemented via API calls)
  // --------------------------------------------------------------------
  const handleRemoveMember = async (userId) => {
    if (!window.confirm('Remove this member from the room?')) return;
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`http://localhost:5000/api/rooms/${roomData.roomCode}/members/${userId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) {
        toast('Member removed', 'success');
        refreshRoom();
      } else {
        toast(data.error || 'Failed to remove member', 'error');
      }
    } catch (err) {
      toast('Network error', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handlePromoteDemote = async (userId, currentRole) => {
    const newRole = currentRole === 'admin' ? 'member' : 'admin';
    if (!window.confirm(`Change role to ${newRole}?`)) return;
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`http://localhost:5000/api/rooms/${roomData.roomCode}/members/${userId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ role: newRole }),
      });
      const data = await res.json();
      if (data.success) {
        toast(`Role updated to ${newRole}`, 'success');
        refreshRoom();
      } else {
        toast(data.error || 'Failed to update role', 'error');
      }
    } catch (err) {
      toast('Network error', 'error');
    } finally {
      setLoading(false);
    }
  };

  const copyInviteLink = () => {
    const link = `${window.location.origin}/room/${roomData.roomCode}`;
    navigator.clipboard.writeText(link);
    toast('Invite link copied!', 'success');
  };

  const copyRoomCode = () => {
    navigator.clipboard.writeText(roomData.roomCode);
    toast('Room code copied!', 'success');
  };

  // --------------------------------------------------------------------
  // Budget Actions
  // --------------------------------------------------------------------
  const handleSaveBudgets = async () => {
    setLoading(true);
    const result = await updateBudgets(budgetValues);
    if (result.success) {
      toast('Budgets updated', 'success');
      setBudgetEditMode(false);
    } else {
      toast(result.error || 'Failed to update budgets', 'error');
    }
    setLoading(false);
  };

  const startBudgetEdit = () => {
    setBudgetValues(roomData?.budgets || {});
    setBudgetEditMode(true);
  };

  const updateBudgetField = (category, value) => {
    setBudgetValues(prev => ({
      ...prev,
      [category]: parseFloat(value) || 0,
    }));
  };

  // --------------------------------------------------------------------
  // Room Settings Actions
  // --------------------------------------------------------------------
  const handleSaveRoomSettings = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`http://localhost:5000/api/rooms/${roomData.roomCode}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          roomName,
          roomType,
          currency,
          settings,
        }),
      });
      const data = await res.json();
      if (data.success) {
        toast('Room settings updated', 'success');
        refreshRoom();
      } else {
        toast(data.error || 'Update failed', 'error');
      }
    } catch (err) {
      toast('Network error', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteRoom = async () => {
    if (!window.confirm('⚠️ DELETE this room permanently? All data will be lost. This cannot be undone!')) return;
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`http://localhost:5000/api/rooms/${roomData.roomCode}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) {
        toast('Room deleted', 'success');
        localStorage.removeItem('centsible_roomCode');
        navigate('/dashboard');
      } else {
        toast(data.error || 'Delete failed', 'error');
      }
    } catch (err) {
      toast('Network error', 'error');
    } finally {
      setLoading(false);
    }
  };

    const handleLeaveRoom = async () => {
    if (!window.confirm('Remove yourself from this room? You will lose access and can only rejoin with a new invite.')) return;
    const result = await leaveRoom();
    if (result.success) {
      toast('You have been removed from the room', 'success');
      localStorage.removeItem('centsible_roomCode');
      if (onLeave) onLeave();
      navigate('/rooms');  // 👈 Changed from '/dashboard' to '/rooms'
    } else {
      toast(result.error || 'Failed to remove from room', 'error');
    }
  };

  // --------------------------------------------------------------------
  // Budget categories preset
  // --------------------------------------------------------------------
  const budgetCategories = [
    'rent', 'groceries', 'utilities', 'transportation',
    'dining', 'shopping', 'entertainment', 'other'
  ];

  if (!roomData) return <div className="loading">Loading room settings...</div>;

  return (
    <div className="room-settings">
      <h2>⚙️ Room Settings</h2>

      {/* Tab Navigation */}
      <div className="settings-tabs">
        <button
          className={activeTab === 'members' ? 'active' : ''}
          onClick={() => setActiveTab('members')}
        >
          👥 Members
        </button>
        <button
          className={activeTab === 'budgets' ? 'active' : ''}
          onClick={() => setActiveTab('budgets')}
        >
          📊 Budgets
        </button>
        <button
          className={activeTab === 'settings' ? 'active' : ''}
          onClick={() => setActiveTab('settings')}
        >
          🏠 Room
        </button>
      </div>

      {/* ------------------------------------------------------------------
          MEMBERS TAB
      ------------------------------------------------------------------ */}
      {activeTab === 'members' && (
        <div className="members-tab">
          <div className="invite-section">
            <h3>🔗 Invite Members</h3>
            <div className="invite-actions">
              <div className="invite-code">
                <span>Room Code:</span>
                <strong>{roomData.roomCode}</strong>
                <button onClick={copyRoomCode}>📋 Copy</button>
              </div>
              <button className="invite-link-btn" onClick={copyInviteLink}>
                📎 Copy Invite Link
              </button>
            </div>
            <p className="hint">Share this code or link with friends to join.</p>
          </div>

          <div className="members-list-section">
            <h3>👤 Members ({roomData.members?.length || 0})</h3>
            <div className="members-table">
              <table>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Role</th>
                    <th>Balance</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {roomData.members?.map(member => {
                    const memberBalance = balances?.find(b => b.userId === member.userId)?.balance || 0;
                    const isCurrentUser = member.userId === user?.id;
                    return (
                      <tr key={member.userId}>
                        <td>
                          {member.name}
                          {isCurrentUser && <span className="you-badge"> (You)</span>}
                        </td>
                        <td>
                          <span className={`role-badge ${member.role}`}>
                            {member.role === 'owner' ? '👑 Owner' : member.role === 'admin' ? '⭐ Admin' : '👤 Member'}
                          </span>
                        </td>
                        <td className={memberBalance > 0 ? 'positive' : memberBalance < 0 ? 'negative' : ''}>
                          {memberBalance > 0
                            ? `Gets ${formatCurrency(memberBalance)}`
                            : memberBalance < 0
                            ? `Owes ${formatCurrency(-memberBalance)}`
                            : 'Settled'}
                        </td>
                        <td>
                          {isAdmin && !isCurrentUser && member.role !== 'owner' && (
                            <>
                              <button
                                className="action-btn-small"
                                onClick={() => handlePromoteDemote(member.userId, member.role)}
                                title={member.role === 'admin' ? 'Demote to member' : 'Promote to admin'}
                              >
                                {member.role === 'admin' ? '⬇️' : '⬆️'}
                              </button>
                              <button
                                className="action-btn-small danger"
                                onClick={() => handleRemoveMember(member.userId)}
                                title="Remove member"
                              >
                                🗑️
                              </button>
                            </>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------------
          BUDGETS TAB
      ------------------------------------------------------------------ */}
      {activeTab === 'budgets' && (
        <div className="budgets-tab">
          <div className="budgets-header">
            <h3>📊 Monthly Budget Limits</h3>
            {isAdmin && !budgetEditMode && (
              <button className="edit-budgets-btn" onClick={startBudgetEdit}>
                ✏️ Edit Budgets
              </button>
            )}
          </div>

          {!isAdmin && (
            <p className="info-message">Only admins can edit budgets.</p>
          )}

          {budgetEditMode ? (
            <div className="budget-edit-form">
              {budgetCategories.map(cat => (
                <div key={cat} className="budget-edit-row">
                  <label>{cat.charAt(0).toUpperCase() + cat.slice(1)}</label>
                  <input
                    type="number"
                    min="0"
                    step="10"
                    value={budgetValues[cat] || 0}
                    onChange={(e) => updateBudgetField(cat, e.target.value)}
                    placeholder="0"
                  />
                  <span className="currency-symbol">{roomData.currency}</span>
                </div>
              ))}
              <div className="budget-edit-actions">
                <button onClick={handleSaveBudgets} disabled={loading}>
                  {loading ? 'Saving...' : '💾 Save Budgets'}
                </button>
                <button onClick={() => setBudgetEditMode(false)}>Cancel</button>
              </div>
            </div>
          ) : (
            <div className="budgets-display">
              {Object.keys(roomData.budgets || {}).length === 0 ? (
                <p className="empty-message">No budgets set yet.</p>
              ) : (
                <table className="budgets-table">
                  <thead>
                    <tr>
                      <th>Category</th>
                      <th>Monthly Limit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(roomData.budgets || {}).map(([cat, amount]) => (
                      <tr key={cat}>
                        <td>{cat}</td>
                        <td>{formatCurrency(amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>
      )}

      {/* ------------------------------------------------------------------
          ROOM SETTINGS TAB
      ------------------------------------------------------------------ */}
      {activeTab === 'settings' && (
        <div className="room-tab">
          {!isOwner ? (
            <p className="info-message">Only the room owner can change room settings.</p>
          ) : (
            <div className="room-edit-form">
              <div className="form-group">
                <label>Room Name</label>
                <input
                  type="text"
                  value={roomName}
                  onChange={(e) => setRoomName(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label>Room Type</label>
                <select value={roomType} onChange={(e) => setRoomType(e.target.value)}>
                  <option value="roommates">🏠 Roommates</option>
                  <option value="trip">✈️ Trip</option>
                  <option value="wedding">💍 Wedding</option>
                  <option value="event">🎉 Event</option>
                  <option value="family">👨‍👩‍👧‍👦 Family</option>
                  <option value="other">🎯 Other</option>
                </select>
              </div>
              <div className="form-group">
                <label>Currency</label>
                <select value={currency} onChange={(e) => setCurrency(e.target.value)}>
                  <option value="AED">AED (UAE Dirham)</option>
                  <option value="USD">USD (US Dollar)</option>
                  <option value="EUR">EUR (Euro)</option>
                  <option value="GBP">GBP (British Pound)</option>
                  <option value="INR">INR (Indian Rupee)</option>
                </select>
              </div>

              <h4>Room Permissions</h4>
              <div className="checkbox-group">
                <label>
                  <input
                    type="checkbox"
                    checked={settings.allowMemberInvite !== false}
                    onChange={(e) => setSettings({ ...settings, allowMemberInvite: e.target.checked })}
                  />
                  Allow members to invite others
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={settings.showMemberBalances !== false}
                    onChange={(e) => setSettings({ ...settings, showMemberBalances: e.target.checked })}
                  />
                  Show member balances to everyone
                </label>
              </div>

              <button className="save-settings-btn" onClick={handleSaveRoomSettings} disabled={loading}>
                {loading ? 'Saving...' : 'Save Room Settings'}
              </button>
            </div>
          )}

          {/* Danger Zone */}
                    <div className="danger-zone">
            <h3>⚠️ Danger Zone</h3>
            <div className="danger-actions">
              <button className="leave-room-btn" onClick={handleLeaveRoom}>
                🚪 Remove Me from Room
              </button>
              {isOwner && (
                <button className="delete-room-btn" onClick={handleDeleteRoom}>
                  💣 Delete Room
                </button>
              )}
            </div>
            <p className="warning-text">
              {isOwner
                ? 'Deleting the room will permanently remove all shared data.'
                : 'Removing yourself will delete your membership. You can only rejoin with a new invite.'}
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

export default RoomSettings;