import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import './MyRooms.css';

const MyRooms = () => {
  const navigate = useNavigate();
  const { user, userRooms, loadingRooms, fetchUserRooms } = useAuth();

  // Use authenticated user's name as default
  const defaultName = user?.name || localStorage.getItem('centsible_userName') || '';
  const [userName, setUserName] = useState(defaultName);
  const [roomNameInput, setRoomNameInput] = useState('');
  const [roomType, setRoomType] = useState('roommates');
  const [joinCodeInput, setJoinCodeInput] = useState('');
  const [loading, setLoading] = useState(false);

  // ✅ Fetch rooms on component mount if not already loaded
  useEffect(() => {
    if (!userRooms && !loadingRooms) {
      fetchUserRooms();
    }
  }, [userRooms, loadingRooms, fetchUserRooms]);

  const showToast = (message, type = 'info') => {
    if (window.toast) window.toast[type]?.(message);
  };

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
        body: JSON.stringify({ roomName: roomNameInput, roomType, currency: 'AED' }),
      });
      const data = await response.json();
      if (data.success) {
        const code = data.data.roomCode;
        localStorage.setItem('centsible_userName', userName);
        await fetchUserRooms(); // ✅ wait for rooms to update
        showToast(`Room created! Code: ${code}`, 'success');
        navigate(`/room/${code}`);
      } else {
        showToast(data.error || 'Failed to create room', 'error');
      }
    } catch (error) {
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
        body: JSON.stringify({ roomCode: joinCodeInput.toUpperCase() }),
      });
      const data = await response.json();
      if (data.success) {
        localStorage.setItem('centsible_userName', userName);
        await fetchUserRooms(); // ✅ wait for rooms to update
        showToast('Joined room!', 'success');
        navigate(`/room/${joinCodeInput.toUpperCase()}`);
      } else {
        showToast(data.error || 'Room not found', 'error');
      }
    } catch (error) {
      showToast('Network error', 'error');
    } finally {
      setLoading(false);
    }
  };

  if (loadingRooms) {
    return <div className="my-rooms-loading">Loading your rooms...</div>;
  }

  return (
    <div className="my-rooms-container">
      <div className="my-rooms-header">
        <h2>🏠 Shared Rooms</h2>
        <button
          className="refresh-btn"
          onClick={() => fetchUserRooms()}
          title="Refresh room list"
        >
          🔄
        </button>
      </div>

      {/* Create & Join Section */}
      <div className="create-join-section">
        <div className="create-card">
          <h3>✨ Create New Room</h3>
          <input
            type="text"
            placeholder="Your name"
            value={userName}
            onChange={(e) => setUserName(e.target.value)}
          />
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

        <div className="join-card">
          <h3>🔗 Join Existing Room</h3>
          <input
            type="text"
            placeholder="Your name"
            value={userName}
            onChange={(e) => setUserName(e.target.value)}
          />
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
      </div>

      {/* Room Cards */}
      <div className="rooms-section">
        <h3>📋 My Rooms ({userRooms?.length || 0})</h3>
        {!userRooms || userRooms.length === 0 ? (
          <p className="no-rooms-message">
            You're not a member of any rooms yet. Create or join one above!
          </p>
        ) : (
          <div className="rooms-grid">
            {userRooms.map(room => (
              <div
                key={room._id}
                className="room-card"
                onClick={() => navigate(`/room/${room.roomCode}`)}
              >
                <div className="room-card-header">
                  <h3>{room.roomName}</h3>
                  <span className="room-type-badge">{room.roomType}</span>
                </div>
                <div className="room-card-details">
                  <p>👥 {room.members?.length || 0} members</p>
                  <p>🔑 Code: {room.roomCode}</p>
                </div>
                <button className="enter-room-btn">Enter Room →</button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default MyRooms;