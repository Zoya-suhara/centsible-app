import React, { useState, useMemo } from 'react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format } from 'date-fns';
import './BudgetLedger.css';

const BudgetLedger = ({ 
  transactions = [], 
  userData = {}, 
  onEditTransaction, 
  onDeleteTransaction,
  onClearAllTransactions  
}) => {
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
  const [isClearing, setIsClearing] = useState(false);
  
  // Get week range (Monday to Sunday for UAE)
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
  const filterTransactionsByPeriod = (transactions, date, period) => {
    if (!transactions || !Array.isArray(transactions)) return [];
    if (!date || isNaN(new Date(date))) return [];
    
    const currentDate = new Date(date);
    
    if (period === 'monthly') {
      return transactions.filter(t => {
        const tDate = new Date(t.date);
        return tDate.getMonth() === currentDate.getMonth() &&
               tDate.getFullYear() === currentDate.getFullYear();
      });
    } else if (period === 'yearly') {
      return transactions.filter(t => {
        const tDate = new Date(t.date);
        return tDate.getFullYear() === currentDate.getFullYear();
      });
    } else {
      const { start: weekStart, end: weekEnd } = getWeekRange(currentDate);
      return transactions.filter(t => {
        const tDate = new Date(t.date);
        return tDate >= weekStart && tDate <= weekEnd;
      });
    }
  };

  // Edit/Delete handlers
const handleEditClick = (tx) => {
  setEditingTransaction(tx);
  setEditAmount(tx.amount);
  setEditDescription(tx.description || tx.category || '');
};

const handleSaveEdit = () => {
  if (onEditTransaction && editingTransaction) {
    onEditTransaction(editingTransaction.id, {
      amount: parseFloat(editAmount),
      description: editDescription
    });
  }
  setEditingTransaction(null);
};

const handleDeleteClick = (id) => {
  if (window.confirm('Delete this transaction?')) {
    onDeleteTransaction && onDeleteTransaction(id);
  }
};

const handleClearAll = async () => {
  if (!window.confirm('⚠️ Delete ALL transactions? This cannot be undone!')) return;
  setIsClearing(true);
  try {
    const result = await onClearAllTransactions();
    if (result.success) {
      alert('All transactions deleted.');
    } else {
      alert(`Failed: ${result.error}`);
    }
  } catch (error) {
    alert('Failed to delete transactions.');
  } finally {
    setIsClearing(false);
  }
};

  // Calculate all financial metrics
  const ledger = useMemo(() => {
    const txns = Array.isArray(transactions) ? transactions : [];
    const periodTransactions = filterTransactionsByPeriod(txns, selectedDate, viewPeriod);
    
    const totalIncome = periodTransactions
      .filter(t => t.type === 'income')
      .reduce((sum, t) => sum + (t.amount || 0), 0);
    
    const totalExpenses = periodTransactions
      .filter(t => t.type === 'expense')
      .reduce((sum, t) => sum + (t.amount || 0), 0);
    
    const creditUsed = periodTransactions
      .filter(t => t.paymentMethod?.toLowerCase() === 'credit')
      .reduce((sum, t) => sum + (t.amount || 0), 0);
    
    const disposableIncome = totalIncome - totalExpenses;
    const savingsRate = totalIncome > 0 ? ((disposableIncome / totalIncome) * 100).toFixed(1) : 0;
    
    const expensesByCategory = {};
    periodTransactions
      .filter(t => t.type === 'expense')
      .forEach(expense => {
        const category = expense.category || expense.description || 'Other';
        expensesByCategory[category] = (expensesByCategory[category] || 0) + (expense.amount || 0);
      });
    
    const sortedCategories = Object.entries(expensesByCategory)
      .sort((a, b) => b[1] - a[1]);
    
    // Sort transactions by date (newest first)
    const sortedTransactions = [...periodTransactions].sort((a, b) => 
      new Date(b.date) - new Date(a.date)
    );
    
    return {
      totalIncome,
      totalExpenses,
      creditUsed,
      disposableIncome,
      savingsRate: parseFloat(savingsRate),
      expensesByCategory: Object.fromEntries(sortedCategories),
      transactionCount: periodTransactions.length,
      netCashFlow: disposableIncome,
      topExpenseCategory: sortedCategories.length > 0 ? { 
        name: sortedCategories[0][0], 
        amount: sortedCategories[0][1] 
      } : { name: 'None', amount: 0 },
      transactions: sortedTransactions
    };
  }, [transactions, selectedDate, viewPeriod]);

  const explanations = {
    income: { term: "💰 What you earned", simple: "This is ALL the money that came in during this period." },
    expenses: { term: "📉 What you spent", simple: "Every dirham that went OUT of your pocket." },
    disposableIncome: { term: "💵 Money left over", simple: "Income minus Expenses = What you have LEFT to save or invest" },
    savingsRate: { term: "📈 Savings Rate", simple: "What percentage of your income you're KEEPING. 20% is excellent!" },
    creditUsed: { term: "💳 Credit Card Usage", simple: "Money you spent using credit cards (borrowed money)" }
  };

  // Generate PDF Blob - NOW WITH FULL TRANSACTION HISTORY
  const generatePDFBlob = () => {
    return new Promise((resolve, reject) => {
      try {
        const doc = new jsPDF();
        
        // Cover Page
        doc.setFillColor(102, 126, 234);
        doc.rect(0, 0, 210, 50, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(28);
        doc.text('Centsible Financial Ledger', 20, 30);
        doc.setFontSize(12);
        const dateRange = viewPeriod === 'weekly' ? `Week of ${format(getWeekRange(selectedDate).start, 'MMM d, yyyy')}` :
                          viewPeriod === 'monthly' ? format(selectedDate, 'MMMM yyyy') :
                          format(selectedDate, 'yyyy');
        doc.text(`Report for: ${dateRange} (${viewPeriod} view)`, 20, 45);
        doc.setTextColor(0, 0, 0);
        
        // SECTION 1: Financial Summary
        doc.setFontSize(18);
        doc.text('1. Financial Summary', 20, 70);
        
        autoTable(doc, {
          startY: 80,
          head: [['Metric', 'Amount', 'What This Means']],
          body: [
            ['Total Income', `AED ${ledger.totalIncome.toFixed(2)}`, explanations.income.simple],
            ['Total Expenses', `AED ${ledger.totalExpenses.toFixed(2)}`, explanations.expenses.simple],
            ['Money Left (Disposable)', `AED ${ledger.disposableIncome.toFixed(2)}`, explanations.disposableIncome.simple],
            ['Savings Rate', `${ledger.savingsRate}%`, explanations.savingsRate.simple],
            ['Credit Card Usage', `AED ${ledger.creditUsed.toFixed(2)}`, explanations.creditUsed.simple]
          ],
          theme: 'striped',
          headStyles: { fillColor: [102, 126, 234], textColor: [255, 255, 255] }
        });
        
        // SECTION 2: Expense Breakdown by Category
        let currentY = doc.lastAutoTable.finalY + 15;
        doc.setFontSize(18);
        doc.text('2. Spending by Category', 20, currentY);
        
        const expenseRows = Object.entries(ledger.expensesByCategory).map(([category, amount]) => [
          category,
          `AED ${amount.toFixed(2)}`,
          `${((amount / ledger.totalExpenses) * 100).toFixed(1)}%`
        ]);
        
        if (expenseRows.length === 0) {
          expenseRows.push(['No expenses recorded', 'AED 0', '0%']);
        }
        
        autoTable(doc, {
          startY: currentY + 10,
          head: [['Category', 'Amount', 'Percentage of Total']],
          body: expenseRows,
          theme: 'striped',
          headStyles: { fillColor: [102, 126, 234] }
        });
        
        // SECTION 3: TRANSACTION HISTORY (NEW!)
        currentY = doc.lastAutoTable.finalY + 15;
        
        // Check if we need a new page
        if (currentY > 250) {
          doc.addPage();
          currentY = 20;
        }
        
        doc.setFontSize(18);
        doc.text('3. Transaction History', 20, currentY);
        
        if (ledger.transactions.length === 0) {
          doc.setFontSize(12);
          doc.text('No transactions recorded during this period.', 20, currentY + 15);
        } else {
          // Create transaction rows for PDF
          const transactionRows = ledger.transactions.map(t => [
            format(new Date(t.date), 'dd/MM/yyyy'),
            t.type === 'income' ? '💰 Income' : '💸 Expense',
            t.description || t.category || '-',
            t.category || '-',
            t.paymentMethod || 'Cash',
            t.type === 'income' ? `+ AED ${t.amount.toFixed(2)}` : `- AED ${t.amount.toFixed(2)}`
          ]);
          
          autoTable(doc, {
            startY: currentY + 10,
            head: [['Date', 'Type', 'Description', 'Category', 'Payment', 'Amount']],
            body: transactionRows,
            theme: 'striped',
            headStyles: { fillColor: [102, 126, 234] },
            columnStyles: {
              0: { cellWidth: 30 },
              1: { cellWidth: 25 },
              2: { cellWidth: 40 },
              3: { cellWidth: 30 },
              4: { cellWidth: 25 },
              5: { cellWidth: 35, halign: 'right' }
            }
          });
        }
        
        // SECTION 4: Financial Advice
        currentY = doc.lastAutoTable.finalY + 15;
        
        if (currentY > 250) {
          doc.addPage();
          currentY = 20;
        }
        
        doc.setFontSize(18);
        doc.text('4. Personalized Financial Advice', 20, currentY);
        doc.setFontSize(11);
        
        const advice = generatePersonalizedAdvice();
        let adviceY = currentY + 15;
        advice.forEach(line => {
          const wrappedLines = doc.splitTextToSize(`• ${line}`, 170);
          doc.text(wrappedLines, 20, adviceY);
          adviceY += (wrappedLines.length * 6);
        });
        
        // Get PDF as Blob
        const pdfBlob = doc.output('blob');
        resolve(pdfBlob);
      } catch (error) {
        reject(error);
      }
    });
  };

  // Direct Download
  const handleDirectDownload = async () => {
    setIsExporting(true);
    setExportError(null);
    
    try {
      const pdfBlob = await generatePDFBlob();
      const url = URL.createObjectURL(pdfBlob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `Centsible_Ledger_${format(selectedDate, 'yyyy_MM')}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('PDF Export failed:', error);
      setExportError('Failed to generate PDF. Please try again.');
      setTimeout(() => setExportError(null), 3000);
    } finally {
      setIsExporting(false);
    }
  };

  // Preview
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
      setExportError('Failed to generate preview. Please try again.');
    } finally {
      setIsExporting(false);
    }
  };

  const confirmDownload = () => {
    if (pdfBlobUrl) {
      const link = document.createElement('a');
      link.href = pdfBlobUrl;
      link.download = `Centsible_Ledger_${format(selectedDate, 'yyyy_MM')}.pdf`;
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

  const generatePersonalizedAdvice = () => {
    const advice = [];
    if (ledger.disposableIncome < 0) {
      advice.push("CRITICAL: You're spending more than you earn! Look at your top expenses and find 3 things to cut immediately.");
    } else if (ledger.savingsRate < 10) {
      advice.push("Your savings rate is below 10%. Try the '24-hour rule' - wait a day before buying non-essentials.");
    } else if (ledger.savingsRate > 30) {
      advice.push("Excellent savings rate! Consider investing the extra in stocks or real estate for growth.");
    }
    
    if (ledger.transactions.length === 0) {
      advice.push("Start adding transactions to see detailed spending analysis and personalized advice.");
    } else {
      const topCategory = ledger.topExpenseCategory;
      if (topCategory.name !== 'None' && topCategory.amount > 0) {
        advice.push(`Your biggest expense is ${topCategory.name} (AED ${topCategory.amount.toFixed(2)}). Review if this aligns with your priorities.`);
      }
    }
    
    if (advice.length === 0) {
      advice.push("You're on the right track! Next goal: Increase savings rate by 5% this month.");
      advice.push("Consider automating your savings - transfer 20% to a separate account on payday.");
    }
    return advice;
  };

  const getCategoryAdvice = (category, amount, totalIncome) => {
    if (totalIncome === 0) return "Add income to see advice";
    const percentage = (amount / totalIncome) * 100;
    const normalizedCategory = category.toLowerCase();
    
    if (normalizedCategory.includes('rent')) {
      return percentage > 40 ? "⚠️ Above 40% - consider cheaper housing" : "✅ Good - under 40% of income";
    }
    if (normalizedCategory.includes('food') || normalizedCategory.includes('grocery')) {
      return percentage > 20 ? "🍽️ High food spending - try meal planning" : "👍 Reasonable food budget";
    }
    if (normalizedCategory.includes('entertain')) {
      return percentage > 15 ? "🎬 High entertainment - look for free activities" : "🎯 Entertainment under control";
    }
    if (normalizedCategory.includes('transport')) {
      return percentage > 15 ? "🚗 High transport costs - consider public transit" : "🚌 Transport costs reasonable";
    }
    return `${percentage.toFixed(0)}% of income - ${percentage > 20 ? 'consider reducing' : 'within range'}`;
  };

  const getDateRangeText = () => {
    if (viewPeriod === 'weekly') {
      const { start, end } = getWeekRange(selectedDate);
      return `${format(start, 'MMM d')} - ${format(end, 'MMM d, yyyy')}`;
    }
    if (viewPeriod === 'monthly') {
      return format(selectedDate, 'MMMM yyyy');
    }
    return format(selectedDate, 'yyyy');
  };

  return (
    <div className="budget-ledger">
      <div className="ledger-header">
        <h1>📒 Financial Ledger</h1>
        <p className="ledger-subtitle">Track your income, expenses, and savings all in one place</p>
        <div className="ledger-controls">
          <div className="period-selector">
            <button className={viewPeriod === 'weekly' ? 'active' : ''} onClick={() => setViewPeriod('weekly')}>
              Weekly
            </button>
            <button className={viewPeriod === 'monthly' ? 'active' : ''} onClick={() => setViewPeriod('monthly')}>
              Monthly
            </button>
            <button className={viewPeriod === 'yearly' ? 'active' : ''} onClick={() => setViewPeriod('yearly')}>
              Yearly
            </button>
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
          
          <button
            onClick={handleClearAll}
            className="clear-all-btn"
            disabled={isClearing || transactions.length === 0}
            title="Delete all transactions"
          >
            {isClearing ? '⏳ Clearing...' : '🗑️ Clear All'}
          </button>
          
          <button onClick={() => setShowExplanations(!showExplanations)} className="help-toggle">
            {showExplanations ? '🔍 Hide Help' : '❓ Show Help'}
          </button>
        </div>
        
        {exportError && <div className="export-error">{exportError}</div>}
      </div>
      
      <div className="date-range-badge">
        📅 {getDateRangeText()}
      </div>
      
      {/* Stats Cards */}
      <div className="stats-grid">
        <div className="stat-card income">
          <h3>{explanations.income.term}</h3>
          <div className="stat-value">AED {ledger.totalIncome.toFixed(2)}</div>
          {showExplanations && <p className="explanation">{explanations.income.simple}</p>}
        </div>
        
        <div className="stat-card expenses">
          <h3>{explanations.expenses.term}</h3>
          <div className="stat-value">AED {ledger.totalExpenses.toFixed(2)}</div>
          {showExplanations && <p className="explanation">{explanations.expenses.simple}</p>}
        </div>
        
        <div className={`stat-card disposable ${ledger.disposableIncome >= 0 ? 'positive' : 'negative'}`}>
          <h3>{explanations.disposableIncome.term}</h3>
          <div className="stat-value">AED {ledger.disposableIncome.toFixed(2)}</div>
          {showExplanations && <p className="explanation">{explanations.disposableIncome.simple}</p>}
          {ledger.disposableIncome < 0 && <div className="warning">⚠️ Spending more than you earn!</div>}
        </div>
        
        <div className="stat-card savings-rate">
          <h3>{explanations.savingsRate.term}</h3>
          <div className="stat-value">{ledger.savingsRate}%</div>
          {showExplanations && <p className="explanation">{explanations.savingsRate.simple}</p>}
          <div className="progress-bar">
            <div className="progress-fill" style={{ width: `${Math.min(ledger.savingsRate, 100)}%` }}></div>
          </div>
        </div>
        
        <div className="stat-card credit">
          <h3>{explanations.creditUsed.term}</h3>
          <div className="stat-value">AED {ledger.creditUsed.toFixed(2)}</div>
          {showExplanations && <p className="explanation">{explanations.creditUsed.simple}</p>}
        </div>
        
        <div className="stat-card top-expense">
          <h3>🎯 Your biggest spending</h3>
          <div className="stat-value">{ledger.topExpenseCategory.name}</div>
          <div className="stat-sub">AED {ledger.topExpenseCategory.amount.toFixed(2)}</div>
        </div>
      </div>
      
      {/* Expense Breakdown Table */}
      <div className="expense-breakdown">
        <h2>📊 Expense Breakdown by Category</h2>
        {Object.keys(ledger.expensesByCategory).length === 0 ? (
          <div className="empty-state">
            <p>No expenses recorded yet. Add some transactions to see your spending breakdown!</p>
          </div>
        ) : (
          <table className="breakdown-table">
            <thead>
              <tr><th>Category</th><th>Amount (AED)</th><th>% of Total</th><th>What This Means</th></tr>
            </thead>
            <tbody>
              {Object.entries(ledger.expensesByCategory).map(([category, amount]) => (
                <tr key={category}>
                  <td>{category}</td>
                  <td className="amount">{amount.toFixed(2)}</td>
                  <td>{((amount / ledger.totalExpenses) * 100).toFixed(1)}%</td>
                  <td className="advice-cell">{getCategoryAdvice(category, amount, ledger.totalIncome)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      
      {/* NEW: Transaction History Table */}
      <div className="transaction-history">
        <h2>📜 Transaction History</h2>
        {ledger.transactions.length === 0 ? (
          <div className="empty-state">
            <p>No transactions recorded during this period. Add transactions to see your history here!</p>
          </div>
        ) : (
          <div className="transaction-table-wrapper">
            <table className="transaction-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Type</th>
                  <th>Description</th>
                  <th>Category</th>
                  <th>Payment Method</th>
                  <th>Amount</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {ledger.transactions.map((t, index) => (
  <tr key={`${t.id}-${index}`} className={t.type === 'income' ? 'income-row' : 'expense-row'}>
                    <td>{format(new Date(t.date), 'dd/MM/yyyy')}</td>
                    <td>{t.type === 'income' ? '💰 Income' : '💸 Expense'}</td>
                    <td>{t.description || t.category || '-'}</td>
                    <td>{t.category || '-'}</td>
                    <td>{t.paymentMethod || 'Cash'}</td>
                    <td className={t.type === 'income' ? 'income-amount' : 'expense-amount'}>
                      {t.type === 'income' ? '+' : '-'} AED {t.amount.toFixed(2)}
                    </td>
                    <td className="transaction-actions">
                      <button className="edit-btn" onClick={() => handleEditClick(t)}>✏️</button>
                      <button className="delete-btn" onClick={() => handleDeleteClick(t.id)}>🗑️</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      
      {/* Advice Section */}
      <div className="advice-section">
        <h2>💡 Your Personalized Financial Advice</h2>
        <div className="advice-content">
          {generatePersonalizedAdvice().map((advice, i) => (
            <p key={i}>• {advice}</p>
          ))}
        </div>
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
      
      {/* Beginner's Guide */}
      {showExplanations && (
        <div className="beginners-guide">
          <h3>📖 Quick Financial Guide for Beginners</h3>
          <div className="guide-grid">
            <div className="guide-item">
              <strong>The 50/30/20 Rule</strong>
              <p>50% of income on NEEDS (rent, food), 30% on WANTS (shopping, dining), 20% on SAVINGS</p>
            </div>
            <div className="guide-item">
              <strong>Emergency Fund</strong>
              <p>Save 3-6 months of expenses for emergencies. Start with AED 5,000 goal.</p>
            </div>
            <div className="guide-item">
              <strong>Credit Cards</strong>
              <p>Always pay FULL balance. 24% interest means a AED 1000 purchase costs AED 1240 if unpaid!</p>
            </div>
            <div className="guide-item">
              <strong>Track Everything</strong>
              <p>Every transaction tells a story. Review your history weekly to spot spending patterns.</p>
            </div>
          </div>
        </div>
      )}
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
                <input
                  type="text"
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label>Amount (AED):</label>
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

export default BudgetLedger;