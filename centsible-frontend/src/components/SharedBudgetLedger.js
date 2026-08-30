import React, { useState, useMemo } from 'react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format } from 'date-fns';
import { useRoom } from '../context/RoomContext';
import { useAuth } from '../context/AuthContext';
import './BudgetLedger.css';

const SharedBudgetLedger = () => {
  const { user } = useAuth();
  const {
    roomData,
    transactions = [],
    updateTransaction,
    deleteTransaction,
    isAdmin,
  } = useRoom();

  const [viewPeriod, setViewPeriod] = useState('monthly');
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [showExplanations, setShowExplanations] = useState(true);
  const [showPdfPreview, setShowPdfPreview] = useState(false);
  const [pdfBlobUrl, setPdfBlobUrl] = useState(null);
  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState(null);
  const [editingTransaction, setEditingTransaction] = useState(null);
  const [editAmount, setEditAmount] = useState('');
  const [editDescription, setEditDescription] = useState('');

  // Helper: format currency using room's currency
  const formatCurrency = (amount) => {
    const currency = roomData?.currency || 'AED';
    try {
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency,
        minimumFractionDigits: 0,
      }).format(amount);
    } catch {
      return `${amount} ${currency}`;
    }
  };

  // Helper: safe toast
  const toast = (message, type = 'info') => {
    if (window.toast) {
      window.toast[type]?.(message) || window.toast.info(message);
    } else {
      console.log(`[Toast] ${type}: ${message}`);
    }
  };

  // Normalize room transactions for ledger compatibility
  const normalizedTransactions = useMemo(() => {
    if (!Array.isArray(transactions)) return [];
    return transactions.map(tx => ({
      ...tx,
      id: tx._id || tx.id,              // support both _id (Mongo) and id
      amount: Number(tx.amount) || 0,
      type: tx.type,
      category: tx.category || 'other',
      description: tx.description || '',
      date: tx.date,
      paymentMethod: tx.paymentMethod || 'cash',
      paidBy: tx.paidBy,
      splits: tx.splits || [],
      isSettlement: !!tx.settlementBetween,
    }));
  }, [transactions]);

  // Get week range (Monday to Sunday)
  const getWeekRange = (date) => {
    const d = new Date(date);
    const day = d.getDay();
    const diffToMonday = day === 0 ? -6 : 1 - day;
    const monday = new Date(d);
    monday.setDate(d.getDate() + diffToMonday);
    monday.setHours(0, 0, 0, 0);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    sunday.setHours(23, 59, 59, 999);
    return { start: monday, end: sunday };
  };

  // Filter transactions by period
  const filterTransactionsByPeriod = (txs, date, period) => {
    if (!Array.isArray(txs)) return [];
    if (!date || isNaN(new Date(date))) return [];

    const currentDate = new Date(date);
    if (period === 'monthly') {
      return txs.filter(t => {
        const tDate = new Date(t.date);
        return tDate.getMonth() === currentDate.getMonth() &&
               tDate.getFullYear() === currentDate.getFullYear();
      });
    } else if (period === 'yearly') {
      return txs.filter(t => {
        const tDate = new Date(t.date);
        return tDate.getFullYear() === currentDate.getFullYear();
      });
    } else {
      const { start, end } = getWeekRange(currentDate);
      return txs.filter(t => {
        const tDate = new Date(t.date);
        return tDate >= start && tDate <= end;
      });
    }
  };

  // Edit/Delete handlers
  const handleEditClick = (tx) => {
    setEditingTransaction(tx);
    setEditAmount(tx.amount);
    setEditDescription(tx.description || tx.category || '');
  };

  const handleSaveEdit = async () => {
    if (!editingTransaction) return;
    const result = await updateTransaction(editingTransaction.id, {
      amount: parseFloat(editAmount),
      description: editDescription,
    });
    if (result.success) {
      toast('Transaction updated', 'success');
    } else {
      toast(result.error || 'Update failed', 'error');
    }
    setEditingTransaction(null);
  };

  const handleDeleteClick = async (id) => {
    if (!window.confirm('Delete this transaction? This affects all room members.')) return;
    const result = await deleteTransaction(id);
    if (result.success) {
      toast('Transaction deleted', 'success');
    } else {
      toast(result.error || 'Delete failed', 'error');
    }
  };

  // Calculate all financial metrics
  const ledger = useMemo(() => {
    const periodTransactions = filterTransactionsByPeriod(normalizedTransactions, selectedDate, viewPeriod);

    const totalIncome = periodTransactions
      .filter(t => t.type === 'income')
      .reduce((sum, t) => sum + (t.amount || 0), 0);

    const totalExpenses = periodTransactions
      .filter(t => t.type === 'expense' && !t.isSettlement)
      .reduce((sum, t) => sum + (t.amount || 0), 0);

    const creditUsed = periodTransactions
      .filter(t => t.paymentMethod?.toLowerCase() === 'credit')
      .reduce((sum, t) => sum + (t.amount || 0), 0);

    const disposableIncome = totalIncome - totalExpenses;
    const savingsRate = totalIncome > 0 ? ((disposableIncome / totalIncome) * 100).toFixed(1) : 0;

    const expensesByCategory = {};
    periodTransactions
      .filter(t => t.type === 'expense' && !t.isSettlement)
      .forEach(expense => {
        const category = expense.category || 'other';
        expensesByCategory[category] = (expensesByCategory[category] || 0) + (expense.amount || 0);
      });

    const sortedCategories = Object.entries(expensesByCategory).sort((a, b) => b[1] - a[1]);
    const sortedTransactions = [...periodTransactions].sort((a, b) => new Date(b.date) - new Date(a.date));

    return {
      totalIncome,
      totalExpenses,
      creditUsed,
      disposableIncome,
      savingsRate: parseFloat(savingsRate),
      expensesByCategory: Object.fromEntries(sortedCategories),
      transactionCount: periodTransactions.length,
      topExpenseCategory: sortedCategories.length > 0
        ? { name: sortedCategories[0][0], amount: sortedCategories[0][1] }
        : { name: 'None', amount: 0 },
      transactions: sortedTransactions,
    };
  }, [normalizedTransactions, selectedDate, viewPeriod]);

  const explanations = {
    income: { term: "💰 Shared Income", simple: "Total shared income recorded in this room." },
    expenses: { term: "📉 Shared Expenses", simple: "Every dirham spent from the shared pool." },
    disposableIncome: { term: "💵 Money Left", simple: "Income minus Expenses = What's left in the room." },
    savingsRate: { term: "📈 Savings Rate", simple: "Percentage of income not spent." },
    creditUsed: { term: "💳 Credit Used", simple: "Money spent using credit cards." }
  };

  // Generate PDF (customized for shared room)
  const generatePDFBlob = () => {
    return new Promise((resolve, reject) => {
      try {
        const doc = new jsPDF();
        const roomName = roomData?.roomName || 'Shared Room';

        // Cover Page
        doc.setFillColor(102, 126, 234);
        doc.rect(0, 0, 210, 50, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(24);
        doc.text(`${roomName} - Shared Ledger`, 20, 30);
        doc.setFontSize(12);
        const dateRange = viewPeriod === 'weekly'
          ? `Week of ${format(getWeekRange(selectedDate).start, 'MMM d, yyyy')}`
          : viewPeriod === 'monthly'
          ? format(selectedDate, 'MMMM yyyy')
          : format(selectedDate, 'yyyy');
        doc.text(`Report for: ${dateRange} (${viewPeriod} view)`, 20, 45);
        doc.setTextColor(0, 0, 0);

        // SECTION 1: Financial Summary
        doc.setFontSize(18);
        doc.text('1. Financial Summary', 20, 70);
        autoTable(doc, {
          startY: 80,
          head: [['Metric', 'Amount', 'What This Means']],
          body: [
            ['Total Income', formatCurrency(ledger.totalIncome), explanations.income.simple],
            ['Total Expenses', formatCurrency(ledger.totalExpenses), explanations.expenses.simple],
            ['Money Left', formatCurrency(ledger.disposableIncome), explanations.disposableIncome.simple],
            ['Savings Rate', `${ledger.savingsRate}%`, explanations.savingsRate.simple],
            ['Credit Card Usage', formatCurrency(ledger.creditUsed), explanations.creditUsed.simple]
          ],
          theme: 'striped',
          headStyles: { fillColor: [102, 126, 234], textColor: [255, 255, 255] }
        });

        // SECTION 2: Expense Breakdown
        let currentY = doc.lastAutoTable.finalY + 15;
        doc.setFontSize(18);
        doc.text('2. Spending by Category', 20, currentY);
        const expenseRows = Object.entries(ledger.expensesByCategory).map(([cat, amt]) => [
          cat,
          formatCurrency(amt),
          `${((amt / ledger.totalExpenses) * 100).toFixed(1)}%`
        ]);
        if (expenseRows.length === 0) expenseRows.push(['No expenses', formatCurrency(0), '0%']);
        autoTable(doc, {
          startY: currentY + 10,
          head: [['Category', 'Amount', 'Percentage']],
          body: expenseRows,
          theme: 'striped',
          headStyles: { fillColor: [102, 126, 234] }
        });

        // SECTION 3: Transaction History
        currentY = doc.lastAutoTable.finalY + 15;
        if (currentY > 250) { doc.addPage(); currentY = 20; }
        doc.setFontSize(18);
        doc.text('3. Transaction History', 20, currentY);
        if (ledger.transactions.length === 0) {
          doc.setFontSize(12);
          doc.text('No transactions recorded during this period.', 20, currentY + 15);
        } else {
          const transactionRows = ledger.transactions.map(t => {
            const paidById = t.paidBy?._id || t.paidBy;
const payer = roomData?.members?.find(m => String(m.userId) === String(paidById))?.name || 'Unknown';
            return [
              format(new Date(t.date), 'dd/MM/yyyy'),
              t.isSettlement ? '💱 Settlement' : (t.type === 'income' ? '💰 Income' : '💸 Expense'),
              t.description || t.category || '-',
              t.category || '-',
              t.paymentMethod || 'Cash',
              t.type === 'income' ? `+ ${formatCurrency(t.amount)}` : `- ${formatCurrency(t.amount)}`,
              `Paid by: ${payer}`
            ];
          });
          autoTable(doc, {
            startY: currentY + 10,
            head: [['Date', 'Type', 'Description', 'Category', 'Payment', 'Amount', 'Paid By']],
            body: transactionRows,
            theme: 'striped',
            headStyles: { fillColor: [102, 126, 234] },
            columnStyles: {
              0: { cellWidth: 25 },
              1: { cellWidth: 25 },
              2: { cellWidth: 35 },
              3: { cellWidth: 25 },
              4: { cellWidth: 25 },
              5: { cellWidth: 30, halign: 'right' },
              6: { cellWidth: 35 }
            }
          });
        }

        const pdfBlob = doc.output('blob');
        resolve(pdfBlob);
      } catch (error) {
        reject(error);
      }
    });
  };

  const handleDirectDownload = async () => {
    setIsExporting(true);
    setExportError(null);
    try {
      const pdfBlob = await generatePDFBlob();
      const url = URL.createObjectURL(pdfBlob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `SharedLedger_${roomData?.roomName || 'room'}_${format(selectedDate, 'yyyy_MM')}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      toast('PDF downloaded', 'success');
    } catch (error) {
      console.error('PDF Export failed:', error);
      setExportError('Failed to generate PDF.');
      toast('PDF generation failed', 'error');
    } finally {
      setIsExporting(false);
    }
  };

  const handlePreview = async () => {
    setIsExporting(true);
    setExportError(null);
    try {
      const pdfBlob = await generatePDFBlob();
      const url = URL.createObjectURL(pdfBlob);
      setPdfBlobUrl(url);
      setShowPdfPreview(true);
    } catch (error) {
      console.error('PDF Preview failed:', error);
      setExportError('Failed to generate preview.');
    } finally {
      setIsExporting(false);
    }
  };

  const confirmDownload = () => {
    if (pdfBlobUrl) {
      const link = document.createElement('a');
      link.href = pdfBlobUrl;
      link.download = `SharedLedger_${roomData?.roomName || 'room'}_${format(selectedDate, 'yyyy_MM')}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setShowPdfPreview(false);
      URL.revokeObjectURL(pdfBlobUrl);
      setPdfBlobUrl(null);
    }
  };

  const closePreview = () => {
    if (pdfBlobUrl) {
      URL.revokeObjectURL(pdfBlobUrl);
      setPdfBlobUrl(null);
    }
    setShowPdfPreview(false);
  };

  const getDateRangeText = () => {
    if (viewPeriod === 'weekly') {
      const { start, end } = getWeekRange(selectedDate);
      return `${format(start, 'MMM d')} - ${format(end, 'MMM d, yyyy')}`;
    }
    if (viewPeriod === 'monthly') return format(selectedDate, 'MMMM yyyy');
    return format(selectedDate, 'yyyy');
  };

  const getCategoryAdvice = (category, amount, totalIncome) => {
    if (totalIncome === 0) return "Add income to see advice";
    const percentage = (amount / totalIncome) * 100;
    const cat = category.toLowerCase();
    if (cat.includes('rent')) return percentage > 40 ? "⚠️ Above 40% - consider cheaper housing" : "✅ Good";
    if (cat.includes('food') || cat.includes('grocery')) return percentage > 20 ? "🍽️ High food spending" : "👍 Reasonable";
    if (cat.includes('entertain')) return percentage > 15 ? "🎬 High entertainment" : "🎯 Under control";
    if (cat.includes('transport')) return percentage > 15 ? "🚗 High transport costs" : "🚌 Reasonable";
    return `${percentage.toFixed(0)}% of income`;
  };

  if (!roomData) {
    return <div className="loading">Loading room data...</div>;
  }

  return (
    <div className="budget-ledger">
      <div className="ledger-header">
        <h1>📒 Shared Financial Ledger</h1>
        <p className="ledger-subtitle">{roomData.roomName} · {roomData.members?.length || 0} members</p>
        <div className="ledger-controls">
          <div className="period-selector">
            <button className={viewPeriod === 'weekly' ? 'active' : ''} onClick={() => setViewPeriod('weekly')}>Weekly</button>
            <button className={viewPeriod === 'monthly' ? 'active' : ''} onClick={() => setViewPeriod('monthly')}>Monthly</button>
            <button className={viewPeriod === 'yearly' ? 'active' : ''} onClick={() => setViewPeriod('yearly')}>Yearly</button>
          </div>

          {viewPeriod === 'yearly' ? (
            <input
              type="number"
              value={format(selectedDate, 'yyyy')}
              onChange={(e) => setSelectedDate(new Date(e.target.value, 0, 1))}
              className="date-picker"
              min="2020"
              max="2030"
            />
          ) : (
            <input
              type="month"
              value={format(selectedDate, 'yyyy-MM')}
              onChange={(e) => setSelectedDate(new Date(e.target.value))}
              className="date-picker"
            />
          )}

          <div className="export-buttons">
            <button onClick={handleDirectDownload} className="export-pdf-btn" disabled={isExporting}>
              {isExporting ? '⏳ Generating...' : '📄 Download PDF'}
            </button>
            <button onClick={handlePreview} className="preview-btn" disabled={isExporting}>
              👁️ Preview
            </button>
          </div>

          <button onClick={() => setShowExplanations(!showExplanations)} className="help-toggle">
            {showExplanations ? '🔍 Hide Help' : '❓ Show Help'}
          </button>
        </div>
        {exportError && <div className="export-error">{exportError}</div>}
      </div>

      <div className="date-range-badge">📅 {getDateRangeText()}</div>

      {/* Stats Cards */}
      <div className="stats-grid">
        <div className="stat-card income">
          <h3>{explanations.income.term}</h3>
          <div className="stat-value">{formatCurrency(ledger.totalIncome)}</div>
          {showExplanations && <p className="explanation">{explanations.income.simple}</p>}
        </div>
        <div className="stat-card expenses">
          <h3>{explanations.expenses.term}</h3>
          <div className="stat-value">{formatCurrency(ledger.totalExpenses)}</div>
          {showExplanations && <p className="explanation">{explanations.expenses.simple}</p>}
        </div>
        <div className={`stat-card disposable ${ledger.disposableIncome >= 0 ? 'positive' : 'negative'}`}>
          <h3>{explanations.disposableIncome.term}</h3>
          <div className="stat-value">{formatCurrency(ledger.disposableIncome)}</div>
          {showExplanations && <p className="explanation">{explanations.disposableIncome.simple}</p>}
        </div>
        <div className="stat-card savings-rate">
          <h3>{explanations.savingsRate.term}</h3>
          <div className="stat-value">{ledger.savingsRate}%</div>
          <div className="progress-bar"><div className="progress-fill" style={{ width: `${Math.min(ledger.savingsRate, 100)}%` }} /></div>
        </div>
        <div className="stat-card credit">
          <h3>{explanations.creditUsed.term}</h3>
          <div className="stat-value">{formatCurrency(ledger.creditUsed)}</div>
        </div>
        <div className="stat-card top-expense">
          <h3>🎯 Biggest Spending</h3>
          <div className="stat-value">{ledger.topExpenseCategory.name}</div>
          <div className="stat-sub">{formatCurrency(ledger.topExpenseCategory.amount)}</div>
        </div>
      </div>

      {/* Expense Breakdown Table */}
      <div className="expense-breakdown">
        <h2>📊 Expense Breakdown by Category</h2>
        {Object.keys(ledger.expensesByCategory).length === 0 ? (
          <div className="empty-state"><p>No expenses recorded yet.</p></div>
        ) : (
          <table className="breakdown-table">
            <thead><tr><th>Category</th><th>Amount</th><th>% of Total</th><th>Insight</th></tr></thead>
            <tbody>
              {Object.entries(ledger.expensesByCategory).map(([cat, amt]) => (
                <tr key={cat}>
                  <td>{cat}</td>
                  <td className="amount">{formatCurrency(amt)}</td>
                  <td>{((amt / ledger.totalExpenses) * 100).toFixed(1)}%</td>
                  <td className="advice-cell">{getCategoryAdvice(cat, amt, ledger.totalIncome)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Transaction History Table */}
      <div className="transaction-history">
        <h2>📜 Transaction History</h2>
        {ledger.transactions.length === 0 ? (
          <div className="empty-state"><p>No transactions in this period.</p></div>
        ) : (
          <div className="transaction-table-wrapper">
            <table className="transaction-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Type</th>
                  <th>Description</th>
                  <th>Category</th>
                  <th>Paid By</th>
                  <th>Amount</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {ledger.transactions.map(t => {
                  const paidById = t.paidBy?._id || t.paidBy;   // 👈 Handle both populated object and raw ID
const payer = roomData.members?.find(m => String(m.userId) === String(paidById))?.name || 'Unknown';
                  const canEdit = isAdmin || t.paidBy === user?.id;
                  return (
                    <tr key={t.id} className={t.type === 'income' ? 'income-row' : 'expense-row'}>
                      <td>{format(new Date(t.date), 'dd/MM/yyyy')}</td>
                      <td>{t.isSettlement ? '💱 Settlement' : (t.type === 'income' ? '💰 Income' : '💸 Expense')}</td>
                      <td>{t.description || t.category || '-'}</td>
                      <td>{t.category || '-'}</td>
                      <td>{payer}</td>
                      <td className={t.type === 'income' ? 'income-amount' : 'expense-amount'}>
                        {t.type === 'income' ? '+' : '-'} {formatCurrency(t.amount)}
                      </td>
                      <td className="transaction-actions">
                        {canEdit && (
                          <>
                            <button className="edit-btn" onClick={() => handleEditClick(t)}>✏️</button>
                            <button className="delete-btn" onClick={() => handleDeleteClick(t.id)}>🗑️</button>
                          </>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* PDF Preview Modal */}
      {showPdfPreview && pdfBlobUrl && (
        <div className="pdf-preview-modal" onClick={closePreview}>
          <div className="pdf-preview-content" onClick={(e) => e.stopPropagation()}>
            <div className="pdf-preview-header">
              <h3>📄 PDF Preview</h3>
              <button className="close-modal" onClick={closePreview}>✕</button>
            </div>
            <div className="pdf-preview-body">
              <iframe src={pdfBlobUrl} title="PDF Preview" className="pdf-iframe" />
            </div>
            <div className="pdf-preview-footer">
              <button className="cancel-btn" onClick={closePreview}>Cancel</button>
              <button className="download-btn" onClick={confirmDownload}>📥 Download PDF</button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {editingTransaction && (
        <div className="modal-overlay" onClick={() => setEditingTransaction(null)}>
          <div className="edit-modal" onClick={(e) => e.stopPropagation()}>
            <div className="edit-modal-header">
              <h3>✏️ Edit Transaction</h3>
              <button className="close-modal-btn" onClick={() => setEditingTransaction(null)}>✕</button>
            </div>
            <div className="edit-form">
              <div className="form-group">
                <label>Description:</label>
                <input type="text" value={editDescription} onChange={(e) => setEditDescription(e.target.value)} />
              </div>
              <div className="form-group">
                <label>Amount ({roomData.currency}):</label>
                <input
                  type="number"
                  value={editAmount}
                  onChange={(e) => setEditAmount(e.target.value)}
                  step="0.01"
                  min="0"
                />
              </div>
              <div className="edit-actions">
                <button className="save-edit-btn" onClick={handleSaveEdit}>💾 Save</button>
                <button className="cancel-edit-btn" onClick={() => setEditingTransaction(null)}>❌ Cancel</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SharedBudgetLedger;