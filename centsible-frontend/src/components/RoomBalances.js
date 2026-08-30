// src/components/RoomBalances.js
import React, { useState } from 'react';
import { useRoom } from '../context/RoomContext';
import { useAuth } from '../context/AuthContext';

const RoomBalances = () => {
  const { roomData, balances, settleUp } = useRoom();
  const { user } = useAuth();
  const [settleModal, setSettleModal] = useState({ open: false, from: null, to: null, amount: 0 });
  const [customAmount, setCustomAmount] = useState('');

  const formatCurrency = (amount) => {
    const currency = roomData?.currency || 'AED';
    return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount);
  };

  const myBalance = balances?.find(b => b.userId === user?.id)?.balance || 0;

  // Generate settlement suggestions
  const suggestions = [];
  if (balances) {
    const debtors = balances.filter(b => b.balance < 0).sort((a,b) => a.balance - b.balance);
    const creditors = balances.filter(b => b.balance > 0).sort((a,b) => b.balance - a.balance);
    // Simple algorithm: match largest debtor with largest creditor
    let i = 0, j = 0;
    while (i < debtors.length && j < creditors.length) {
      const debtor = debtors[i];
      const creditor = creditors[j];
      const amount = Math.min(-debtor.balance, creditor.balance);
      if (amount > 0) {
        suggestions.push({ from: debtor.userId, fromName: debtor.name, to: creditor.userId, toName: creditor.name, amount });
      }
      debtor.balance += amount;
      creditor.balance -= amount;
      if (debtor.balance === 0) i++;
      if (creditor.balance === 0) j++;
    }
  }

  const handleSettle = async () => {
    if (!settleModal.from || !settleModal.to || settleModal.amount <= 0) return;
    const result = await settleUp(settleModal.from, settleModal.to, settleModal.amount);
    if (result.success) {
      window.toast?.success('Settlement recorded!');
      setSettleModal({ open: false, from: null, to: null, amount: 0 });
      setCustomAmount('');
    } else {
      window.toast?.error(result.error);
    }
  };

  return (
    <div className="room-balances">
      <h3>⚖️ Balances & Settlements</h3>
      
      {/* My Balance Card */}
      <div className="my-balance-card">
        <h4>Your Balance</h4>
        <div className={`balance-value ${myBalance > 0 ? 'positive' : myBalance < 0 ? 'negative' : ''}`}>
          {myBalance > 0 ? `You are owed ${formatCurrency(myBalance)}` :
           myBalance < 0 ? `You owe ${formatCurrency(-myBalance)}` :
           'You are all settled up!'}
        </div>
      </div>

      {/* Member Balances Grid */}
      <div className="member-balances-grid">
        {balances?.map(member => (
          <div key={member.userId} className="member-balance-item">
            <span>{member.name}</span>
            <span className={member.balance > 0 ? 'positive' : member.balance < 0 ? 'negative' : ''}>
              {member.balance > 0 ? `Gets ${formatCurrency(member.balance)}` :
               member.balance < 0 ? `Owes ${formatCurrency(-member.balance)}` : 'Settled'}
            </span>
          </div>
        ))}
      </div>

      {/* Settlement Suggestions */}
      {suggestions.length > 0 && (
        <div className="settlement-suggestions">
          <h4>💡 Suggested Settlements</h4>
          {suggestions.map((s, idx) => (
            <div key={idx} className="suggestion-item">
              <span>{s.fromName} pays {s.toName} {formatCurrency(s.amount)}</span>
              <button onClick={() => setSettleModal({ open: true, from: s.from, to: s.to, amount: s.amount })}>
                Settle Up
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Custom Settle Button */}
      <button className="settle-up-btn" onClick={() => setSettleModal({ open: true, from: '', to: '', amount: 0 })}>
        💱 Record Settlement
      </button>

      {/* Settlement Modal */}
      {settleModal.open && (
        <div className="modal-overlay" onClick={() => setSettleModal({ open: false })}>
          <div className="modal-content settle-modal" onClick={e => e.stopPropagation()}>
            <h3>Record Settlement</h3>
            <div className="form-group">
              <label>Who paid?</label>
              <select value={settleModal.from} onChange={e => setSettleModal({...settleModal, from: e.target.value})}>
                <option value="">Select payer</option>
                {roomData?.members.map(m => (
                  <option key={m.userId} value={m.userId}>{m.name}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label>Who received?</label>
              <select value={settleModal.to} onChange={e => setSettleModal({...settleModal, to: e.target.value})}>
                <option value="">Select receiver</option>
                {roomData?.members.map(m => (
                  <option key={m.userId} value={m.userId}>{m.name}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label>Amount</label>
              <input
                type="number"
                value={settleModal.amount || customAmount}
                onChange={e => { setCustomAmount(e.target.value); setSettleModal({...settleModal, amount: parseFloat(e.target.value) || 0}); }}
                min="0.01"
                step="0.01"
              />
            </div>
            <div className="modal-actions">
              <button onClick={handleSettle}>Confirm Settlement</button>
              <button onClick={() => setSettleModal({ open: false })}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default RoomBalances;