import React, { useState, useEffect } from 'react';
import './SharedRoom.css';

function SharedRoomBackend({ userCurrency = 'AED', socket }) {
  // Room states
  const [roomCode, setRoomCode] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [roomName, setRoomName] = useState('');
  const [roomType, setRoomType] = useState('roommates');
  const [roomData, setRoomData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [userName, setUserName] = useState('');
  const [userId] = useState(`user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`);
  
  // Expense form
  const [newExpense, setNewExpense] = useState({
    description: '',
    amount: '',
    paidBy: '',
    splitBetween: []
  });

  // Get user ID from localStorage or create new
  const getUserId = () => {
    let storedId = localStorage.getItem('centsible_userId');
    if (!storedId) {
      storedId = `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      localStorage.setItem('centsible_userId', storedId);
    }
    return storedId;
  };

  // Load saved room code on component mount
  useEffect(() => {
    const savedUserId = localStorage.getItem('centsible_userId');
    const savedRoomCode = localStorage.getItem('centsible_roomCode');
    const savedUserName = localStorage.getItem('centsible_userName');
    
    if (savedUserId) {
      // Keep the existing userId from state (already set)
    }
    
    if (savedUserName) {
      setUserName(savedUserName);
    }
    
    if (savedRoomCode) {
      // Check if room still exists on backend
      checkAndLoadRoom(savedRoomCode);
    }
  }, []);

  // Check and load room from localStorage
  const checkAndLoadRoom = async (roomCode) => {
    try {
      const response = await fetch(`http://localhost:5000/api/rooms/${roomCode}`);
      const data = await response.json();
      
      if (data.success) {
        setRoomCode(roomCode);
        setRoomData(data.room);
        setRoomType(data.room.roomType);
        if (socket) {
          socket.emit('join-room', roomCode);
        }
      } else {
        // Room no longer exists, remove from localStorage
        localStorage.removeItem('centsible_roomCode');
      }
    } catch (error) {
      console.error('Error loading saved room:', error);
      localStorage.removeItem('centsible_roomCode');
    }
  };

  // Save room to localStorage
  const saveRoomToStorage = (roomCode, roomName, roomType) => {
    localStorage.setItem('centsible_roomCode', roomCode);
    localStorage.setItem('centsible_lastRoomName', roomName);
    localStorage.setItem('centsible_lastRoomType', roomType);
  };

  // Save user name to localStorage
  const saveUserNameToStorage = (name) => {
    localStorage.setItem('centsible_userName', name);
  };

  // Check if user has saved rooms
  const hasSavedRoom = () => {
    return localStorage.getItem('centsible_roomCode') !== null;
  };

  const loadSavedRoom = async () => {
    const savedCode = localStorage.getItem('centsible_roomCode');
    if (savedCode) {
      setJoinCode(savedCode);
      await joinRoom();
    }
  };

  const clearSavedRoom = () => {
    localStorage.removeItem('centsible_roomCode');
    localStorage.removeItem('centsible_lastRoomName');
    localStorage.removeItem('centsible_lastRoomType');
    alert('Saved room cleared');
  };

  // Format currency
  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: userCurrency,
      minimumFractionDigits: 0
    }).format(amount);
  };

  // Create a new room
  const createRoom = async () => {
    if (!roomName.trim() || !userName.trim()) {
      alert('Please enter room name and your name');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch('http://localhost:5000/api/rooms/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roomName,
          roomType,
          createdBy: {
            userId,
            name: userName,
            email: ''
          },
          currency: userCurrency
        })
      });

      const data = await response.json();
      if (data.success) {
        setRoomCode(data.roomCode);
        setRoomData(data.room);
        
        // Save to localStorage
        saveRoomToStorage(data.roomCode, roomName, roomType);
        saveUserNameToStorage(userName);
        
        if (socket) {
          socket.emit('join-room', data.roomCode);
        }
        alert(`Room created! Share this code: ${data.roomCode}`);
      }
    } catch (error) {
      console.error('Error creating room:', error);
      alert('Failed to create room');
    } finally {
      setLoading(false);
    }
  };

  // Join an existing room
  const joinRoom = async () => {
    if (!joinCode.trim() || !userName.trim()) {
      alert('Please enter room code and your name');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch('http://localhost:5000/api/rooms/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roomCode: joinCode.toUpperCase(),
          userId,
          userName,
          userEmail: ''
        })
      });

      const data = await response.json();
      if (data.success) {
        setRoomCode(joinCode.toUpperCase());
        setRoomData(data.room);
        setRoomType(data.room.roomType);
        
        // Save to localStorage
        saveRoomToStorage(joinCode.toUpperCase(), data.room.roomName, data.room.roomType);
        saveUserNameToStorage(userName);
        
        if (socket) {
          socket.emit('join-room', joinCode.toUpperCase());
        }
        alert(`Joined room: ${data.room.roomName}`);
      } else {
        alert(data.error || 'Failed to join room');
      }
    } catch (error) {
      console.error('Error joining room:', error);
      alert('Failed to join room');
    } finally {
      setLoading(false);
    }
  };

  // Add expense
  const addExpense = async () => {
    if (!newExpense.description || !newExpense.amount || !newExpense.paidBy) {
      alert('Please fill all required fields');
      return;
    }

    try {
      const response = await fetch(`http://localhost:5000/api/rooms/${roomCode}/expenses`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          description: newExpense.description,
          amount: parseFloat(newExpense.amount),
          paidBy: newExpense.paidBy,
          splitBetween: newExpense.splitBetween.length > 0 
            ? newExpense.splitBetween 
            : roomData.members.map(m => m.userId)
        })
      });

      const data = await response.json();
      if (data.success) {
        setRoomData(data.room);
        setNewExpense({
          description: '',
          amount: '',
          paidBy: '',
          splitBetween: []
        });
        alert('Expense added!');
      }
    } catch (error) {
      console.error('Error adding expense:', error);
      alert('Failed to add expense');
    }
  };

  // Listen for room updates via socket
  useEffect(() => {
    if (socket && roomCode) {
      socket.on('room-updated', (updatedRoom) => {
        if (updatedRoom.roomCode === roomCode) {
          setRoomData(updatedRoom);
        }
      });

      return () => {
        socket.off('room-updated');
      };
    }
  }, [socket, roomCode]);

  // Calculate balances
  const calculateBalances = () => {
    if (!roomData) return {};
    
    const balances = {};
    roomData.members.forEach(member => {
      balances[member.userId] = { ...member, balance: 0 };
    });

    roomData.expenses.forEach(expense => {
      if (!expense.settled) {
        const participants = expense.splitBetween || roomData.members.map(m => m.userId);
        const amountPerPerson = expense.amount / participants.length;
        
        // Person who paid gets credited
        if (balances[expense.paidBy]) {
          balances[expense.paidBy].balance += expense.amount;
        }
        
        // Each participant owes their share
        participants.forEach(userId => {
          if (userId !== expense.paidBy && balances[userId]) {
            balances[userId].balance -= amountPerPerson;
          }
        });
      }
    });

    return balances;
  };

  // If no room code, show create/join form
  if (!roomCode) {
    return (
      <div className="shared-room">
        <div className="room-header">
          <h2>👥 Shared Rooms</h2>
          <p>Create or join a room to track shared expenses</p>
        </div>

        <div className="user-info-section">
          <h3>👤 Your Information</h3>
          <input
            type="text"
            placeholder="Your name (shown to others)"
            value={userName}
            onChange={(e) => setUserName(e.target.value)}
            className="user-name-input"
          />
          {!userName.trim() && (
            <div className="validation-message error">
              ⚠️ Please enter your name to continue
            </div>
          )}
        </div>

        {hasSavedRoom() && (
          <div className="saved-room-indicator">
            <span>💾 You have a saved room</span>
            <button onClick={loadSavedRoom}>Load Saved Room</button>
            <button onClick={clearSavedRoom} style={{ background: '#fed7d7', color: '#c53030' }}>
              Clear
            </button>
          </div>
        )}

        <div className="room-options">
          {/* Create Room */}
          <div className="option-card create-card">
            <h3>🏠 Create New Room</h3>
            <input
              type="text"
              placeholder="Room name"
              value={roomName}
              onChange={(e) => setRoomName(e.target.value)}
            />
            {!roomName.trim() && userName.trim() && (
              <div className="validation-message hint">
                ✏️ Enter a name for your room
              </div>
            )}
            
            <select value={roomType} onChange={(e) => setRoomType(e.target.value)}>
              <option value="roommates">🏠 Roommates (Shared apartment/house)</option>
              <option value="trip">✈️ Dream Trip (Vacation planning)</option>
              <option value="wedding">💍 Wedding Planning</option>
              <option value="event">🎉 Event/Party</option>
              <option value="project">📋 Project Group (Work/school project)</option>
              <option value="family">👨‍👩‍👧‍👦 Family Expenses</option>
              <option value="friends">👫 Friends Group</option>
              <option value="business">💼 Business Partners</option>
              <option value="sports">⚽ Sports Team</option>
              <option value="custom">🎯 Custom Group</option>
            </select>
            
            <button 
              onClick={createRoom} 
              disabled={loading || !userName.trim() || !roomName.trim()}
              className="create-room-btn"
            >
              {loading ? 'Creating...' : 'Create Room'}
            </button>
            <p className="helper-text">You'll get a room code to share</p>
          </div>

          <div className="divider">OR</div>

          {/* Join Room */}
          <div className="option-card join-card">
            <h3>🔗 Join Existing Room</h3>
            <input
              type="text"
              placeholder="Enter room code"
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              className="room-code-input"
            />
            {!joinCode.trim() && userName.trim() && (
              <div className="validation-message hint">
                🔑 Enter the 6-character room code
              </div>
            )}
            
            <button 
              onClick={joinRoom} 
              disabled={loading || !userName.trim() || !joinCode.trim()}
              className="join-room-btn"
            >
              {loading ? 'Joining...' : 'Join Room'}
            </button>
            <p className="helper-text">Ask your friend for the room code</p>
          </div>
        </div>
      </div>
    );
  }

  // If room code exists, show room management
  const balances = calculateBalances();
  
  return (
    <div className="shared-room">
      {/* Room Header with Code */}
      <div className="room-header">
        <h2>🏠 {roomData?.roomName || 'Shared Room'}</h2>
        <div className="room-info">
          <div className="room-code-display">
            <strong>Room Code:</strong> 
            <span className="code-highlight">{roomCode}</span>
            <button 
              onClick={() => {
                navigator.clipboard.writeText(roomCode);
                alert('Room code copied!');
              }}
              className="copy-btn"
            >
              📋 Copy
            </button>
          </div>
          <p>Share this code with friends to join</p>
        </div>
        <button 
          onClick={() => {
            setRoomCode('');
            setRoomData(null);
            localStorage.removeItem('centsible_roomCode');
          }}
          className="leave-room-btn"
        >
          ← Leave Room
        </button>
      </div>

      {/* Room Type Badge */}
      <div className="room-type-badge">
        {roomType === 'roommates' && '🏠 Roommates'}
        {roomType === 'trip' && '✈️ Dream Trip'}
        {roomType === 'wedding' && '💍 Wedding Planning'}
        {roomType === 'event' && '🎉 Event'}
        {roomType === 'project' && '📋 Project Group'}
        {roomType === 'family' && '👨‍👩‍👧‍👦 Family'}
        {roomType === 'friends' && '👫 Friends'}
        {roomType === 'business' && '💼 Business'}
        {roomType === 'sports' && '⚽ Sports Team'}
        {roomType === 'custom' && '🎯 Custom Group'}
      </div>

      {/* Members Section */}
      <div className="room-section">
        <h3>👤 Members ({roomData?.members?.length || 0})</h3>
        <div className="members-grid">
          {roomData?.members?.map((member) => (
            <div key={member.userId} className="member-card">
              <div className="member-avatar">
                {member.userId === userId ? '👑' : '👤'}
              </div>
              <div className="member-info">
                <strong>{member.name}</strong>
                <span className="member-role">
                  {member.userId === userId ? ' (You)' : ''}
                  {member.userId === roomData?.createdBy?.userId ? ' 👑 Host' : ''}
                </span>
              </div>
              {balances[member.userId] && (
                <div className={`member-balance ${balances[member.userId].balance > 0 ? 'positive' : balances[member.userId].balance < 0 ? 'negative' : 'neutral'}`}>
                  {balances[member.userId].balance > 0 
                    ? `Gets ${formatCurrency(balances[member.userId].balance)}`
                    : balances[member.userId].balance < 0
                    ? `Owes ${formatCurrency(-balances[member.userId].balance)}`
                    : 'Settled'}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Add Expense Form */}
      <div className="room-section">
        <h3>💰 Add Shared Expense</h3>
        <div className="expense-form">
          <input
            type="text"
            placeholder="What was the expense?"
            value={newExpense.description}
            onChange={(e) => setNewExpense({...newExpense, description: e.target.value})}
          />
          <input
            type="number"
            placeholder={`Amount (${userCurrency})`}
            value={newExpense.amount}
            onChange={(e) => setNewExpense({...newExpense, amount: e.target.value})}
          />
          <select
            value={newExpense.paidBy}
            onChange={(e) => setNewExpense({...newExpense, paidBy: e.target.value})}
          >
            <option value="">Who paid?</option>
            {roomData?.members?.map(member => (
              <option key={member.userId} value={member.userId}>
                {member.name} {member.userId === userId ? '(You)' : ''}
              </option>
            ))}
          </select>
          
          <div className="split-options">
            <label>Split between:</label>
            {roomData?.members?.map(member => (
              <label key={member.userId} className="split-checkbox">
                <input
                  type="checkbox"
                  checked={newExpense.splitBetween.includes(member.userId)}
                  onChange={(e) => {
                    if (e.target.checked) {
                      setNewExpense({
                        ...newExpense,
                        splitBetween: [...newExpense.splitBetween, member.userId]
                      });
                    } else {
                      setNewExpense({
                        ...newExpense,
                        splitBetween: newExpense.splitBetween.filter(id => id !== member.userId)
                      });
                    }
                  }}
                />
                {member.name} {member.userId === userId ? '(You)' : ''}
              </label>
            ))}
          </div>
          
          <button 
            onClick={addExpense}
            disabled={!newExpense.description || !newExpense.amount || !newExpense.paidBy}
            className="add-expense-btn"
          >
            + Add Expense
          </button>
        </div>
      </div>

      {/* Expenses List */}
      <div className="room-section">
        <h3>📋 Expenses ({roomData?.expenses?.length || 0})</h3>
        <div className="expenses-list">
          {roomData?.expenses?.length === 0 ? (
            <p className="empty-state">No expenses yet</p>
          ) : (
            roomData?.expenses?.map(expense => {
              const payer = roomData.members.find(m => m.userId === expense.paidBy);
              return (
                <div key={expense.id} className={`expense-item ${expense.settled ? 'settled' : ''}`}>
                  <div className="expense-info">
                    <strong>{expense.description}</strong>
                    <span className="amount">{formatCurrency(expense.amount)}</span>
                  </div>
                  <div className="expense-details">
                    Paid by: <strong>{payer?.name || 'Unknown'}</strong> • 
                    Date: {new Date(expense.date).toLocaleDateString()} • 
                    {expense.settled ? ' ✅ Settled' : ' ⏳ Pending'}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Statistics */}
      <div className="room-stats">
        <div className="stat-card">
          <h4>Total Expenses</h4>
          <p className="stat-value">
            {formatCurrency(roomData?.expenses?.reduce((sum, exp) => sum + exp.amount, 0) || 0)}
          </p>
        </div>
        <div className="stat-card">
          <h4>Members</h4>
          <p className="stat-value">{roomData?.members?.length || 0}</p>
        </div>
        <div className="stat-card">
          <h4>Pending</h4>
          <p className="stat-value">
            {roomData?.expenses?.filter(exp => !exp.settled).length || 0}
          </p>
        </div>
      </div>
    </div>
  );
}

export default SharedRoomBackend;