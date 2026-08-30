import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { RoomProvider, useRoom } from '../context/RoomContext';
import SharedDashboard from './SharedDashboard';
import SharedBudgetLedger from './SharedBudgetLedger';
import SharedWishlist from './SharedWishlist';
import RoomSettings from './RoomSettings';
import LoadingSpinner from './LoadingSpinner';
import './SharedRoom.css';
import io from 'socket.io-client';

const SOCKET_URL = process.env.REACT_APP_SOCKET_URL || 'http://localhost:5000';

// Helper component to display room name (must be inside RoomProvider)
const RoomNameDisplay = () => {
  const { roomData, loading } = useRoom();
  if (loading) return <span>Loading...</span>;
  return <span>{roomData?.roomName || 'Shared Room'}</span>;
};

const SharedRoomContainer = () => {
  const navigate = useNavigate();
  const { roomCode: urlRoomCode } = useParams();
  const { user } = useAuth();

  const [activeRoomCode, setActiveRoomCode] = useState(urlRoomCode || null);
  const [roomNameInput, setRoomNameInput] = useState('');
  const [roomType, setRoomType] = useState('roommates');
  const [joinCodeInput, setJoinCodeInput] = useState('');
  const [userName, setUserName] = useState('');
  const [loading, setLoading] = useState(false);
  const [socket, setSocket] = useState(null);
  const [activeTab, setActiveTab] = useState('dashboard');

  // --------------------------------------------------------------------
  // Socket connection
  // --------------------------------------------------------------------
  useEffect(() => {
    const newSocket = io(SOCKET_URL, {
      transports: ['websocket'],
      withCredentials: true,
    });
    setSocket(newSocket);

    newSocket.on('connect', () => {
      console.log('🔌 SharedRoomContainer socket connected');
    });

    newSocket.on('connect_error', (err) => {
      console.error('Socket connection error:', err);
      window.toast?.error('Connection error. Real-time updates may be delayed.');
    });

    return () => {
      newSocket.disconnect();
    };
  }, []);

  // --------------------------------------------------------------------
  // Load saved user name from localStorage
  // --------------------------------------------------------------------
  useEffect(() => {
    const savedName = localStorage.getItem('centsible_userName');
    if (savedName) setUserName(savedName);
  }, []);

  // Sync URL room code to state
  useEffect(() => {
    if (urlRoomCode) {
      setActiveRoomCode(urlRoomCode.toUpperCase());
    }
  }, [urlRoomCode]);

  // --------------------------------------------------------------------
  // Toast helper (using global window.toast from ToastContainer)
  // --------------------------------------------------------------------
  const showToast = (message, type = 'info') => {
    if (window.toast) {
      switch (type) {
        case 'success': window.toast.success(message); break;
        case 'error': window.toast.error(message); break;
        case 'warning': window.toast.warning(message); break;
        default: window.toast.info(message);
      }
    } else {
      console.warn('Toast not ready:', message);
    }
  };

  // --------------------------------------------------------------------
  // Room creation & joining
  // --------------------------------------------------------------------
  const createRoom = async () => {
    if (!roomNameInput.trim() || !userName.trim()) {
      showToast('Please enter room name and your name', 'warning');
      return;
    }
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const response = await fetch('http://localhost:5000/api/rooms/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          roomName: roomNameInput,
          roomType,
          currency: 'AED',
        }),
      });
      const data = await response.json();
      if (data.success) {
        const code = data.data.roomCode;
        setActiveRoomCode(code);
        localStorage.setItem('centsible_userName', userName);
        localStorage.setItem('centsible_roomCode', code);
        showToast(`Room created! Code: ${code}`, 'success');
        navigate(`/room/${code}`, { replace: true });
      } else {
        showToast(data.error || 'Failed to create room', 'error');
      }
    } catch (error) {
      console.error('Create room error:', error);
      showToast('Network error', 'error');
    } finally {
      setLoading(false);
    }
  };

  const joinRoom = async () => {
    if (!joinCodeInput.trim() || !userName.trim()) {
      showToast('Please enter room code and your name', 'warning');
      return;
    }
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const response = await fetch('http://localhost:5000/api/rooms/join', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          roomCode: joinCodeInput.toUpperCase(),
        }),
      });
      const data = await response.json();
      if (data.success) {
        const code = joinCodeInput.toUpperCase();
        setActiveRoomCode(code);
        localStorage.setItem('centsible_userName', userName);
        localStorage.setItem('centsible_roomCode', code);
        showToast(`Joined room: ${data.data.roomName}`, 'success');
        navigate(`/room/${code}`, { replace: true });
      } else {
        showToast(data.error || 'Room not found', 'error');
      }
    } catch (error) {
      console.error('Join room error:', error);
      showToast('Network error', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleLeaveRoom = () => {
    setActiveRoomCode(null);
    localStorage.removeItem('centsible_roomCode');
    navigate('/dashboard');
  };

  // --------------------------------------------------------------------
  // Render: No active room → show create/join UI
  // --------------------------------------------------------------------
  if (!activeRoomCode) {
    return (
      <div className="shared-room-container">
        <div className="room-onboarding">
          <h2>👥 Shared Room</h2>
          <p>Create or join a room to manage finances together</p>

          <div className="user-name-section">
            <label>Your Name</label>
            <input
              type="text"
              placeholder="How should others see you?"
              value={userName}
              onChange={(e) => setUserName(e.target.value)}
            />
          </div>

          <div className="create-room-card">
            <h3>🏠 Create New Room</h3>
            <input
              type="text"
              placeholder="Room name (e.g., 'Dubai Trip 2024')"
              value={roomNameInput}
              onChange={(e) => setRoomNameInput(e.target.value)}
            />
            <select value={roomType} onChange={(e) => setRoomType(e.target.value)}>
              <option value="roommates">🏠 Roommates</option>
              <option value="trip">✈️ Trip</option>
              <option value="wedding">💍 Wedding</option>
              <option value="event">🎉 Event</option>
              <option value="family">👨‍👩‍👧‍👦 Family</option>
              <option value="other">🎯 Other</option>
            </select>
            <button onClick={createRoom} disabled={loading}>
              {loading ? 'Creating...' : 'Create Room'}
            </button>
          </div>

          <div className="divider">OR</div>

          <div className="join-room-card">
            <h3>🔗 Join Existing Room</h3>
            <input
              type="text"
              placeholder="6-character room code"
              value={joinCodeInput}
              onChange={(e) => setJoinCodeInput(e.target.value.toUpperCase())}
              maxLength={6}
            />
            <button onClick={joinRoom} disabled={loading}>
              {loading ? 'Joining...' : 'Join Room'}
            </button>
          </div>

          <button className="back-to-dashboard" onClick={() => navigate('/dashboard')}>
            ← Back to Personal Dashboard
          </button>
        </div>
      </div>
    );
  }

  // --------------------------------------------------------------------
  // Active room → wrap in RoomProvider
  // --------------------------------------------------------------------
  return (
    <RoomProvider roomCode={activeRoomCode} socket={socket}>
      <div className="shared-room-container active">
        {/* Room Header */}
        <div className="room-header-bar">
          <div className="room-title">
            <h2>🏠 <RoomNameDisplay /></h2>
            <span className="room-code-badge">
              Code: <strong>{activeRoomCode}</strong>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(activeRoomCode);
                  showToast('Room code copied!', 'success');
                }}
                className="copy-btn"
              >
                📋
              </button>
            </span>
          </div>
          <button className="leave-room-btn" onClick={handleLeaveRoom}>
            ← Leave Room
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="room-tabs">
          <button
            className={activeTab === 'dashboard' ? 'active' : ''}
            onClick={() => setActiveTab('dashboard')}
          >
            📊 Dashboard
          </button>
          <button
            className={activeTab === 'ledger' ? 'active' : ''}
            onClick={() => setActiveTab('ledger')}
          >
            📒 Ledger
          </button>
          <button
            className={activeTab === 'wishlist' ? 'active' : ''}
            onClick={() => setActiveTab('wishlist')}
          >
            🎁 Wishlist
          </button>
          <button
            className={activeTab === 'settings' ? 'active' : ''}
            onClick={() => setActiveTab('settings')}
          >
            ⚙️ Settings
          </button>
        </div>

        {/* Tab Content */}
        <div className="room-tab-content">
          {activeTab === 'dashboard' && <SharedDashboard />}
          {activeTab === 'ledger' && <SharedBudgetLedger />}
          {activeTab === 'wishlist' && <SharedWishlist />}
          {activeTab === 'settings' && <RoomSettings onLeave={handleLeaveRoom} />}
        </div>
      </div>
    </RoomProvider>
  );
};

export default SharedRoomContainer;