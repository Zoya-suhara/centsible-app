// centsible-frontend/src/pages/Reports.js (FIXED – all features preserved)
import React, { useState, useEffect, useMemo } from 'react';
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  AreaChart, Area
} from 'recharts';
import LoadingSpinner from '../components/LoadingSpinner';
import './Reports.css';

const Reports = ({ transactions = [], userData = {} }) => {
  const [timeRange, setTimeRange] = useState('month'); // week, month, year
  const [chartType, setChartType] = useState('trend'); // trend, category, comparison
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState('all'); // preserved (unused but kept)

 // Colors for charts – now using the new brand palette
const COLORS = {
  income: '#E9C46A',      // Gold (--accent)
  expense: '#E76F51',     // Burnt orange (--danger)
  savings: '#2A9D8F',     // Teal (--success)
  rent: '#F4A261',        // Coral (--primary)
  groceries: '#4ECDC4',   // Light teal (--primary-light)
  transportation: '#D68C45', // Dark coral (--primary-dark)
  utilities: '#E9C46A',   // Gold
  entertainment: '#F7C59F', // Light coral
  shopping: '#F4A261',    // Coral
  healthcare: '#2A9D8F',  // Teal
  education: '#4ECDC4',   // Light teal
  other: '#A0AEC0'        // Soft gray (neutral)
};

const PIE_COLORS = [
  '#F4A261', // Coral
  '#E9C46A', // Gold
  '#2A9D8F', // Teal
  '#E76F51', // Burnt orange
  '#4ECDC4', // Light teal
  '#D68C45', // Dark coral
  '#F7C59F', // Light coral
  '#A0AEC0', // Gray
  '#2B5B6B', // Mid gradient
  '#3E8E7E'  // Mint
];

  // Process transactions based on time range – NOW USES useEffect TO AVOID INFINITE LOADING
  const [processedData, setProcessedData] = useState(null);

  useEffect(() => {
    setLoading(true);
    
    if (!transactions.length) {
      setProcessedData(null);
      setLoading(false);
      return;
    }

    const now = new Date();
    let startDate = new Date();

    switch(timeRange) {
      case 'week':
        startDate.setDate(now.getDate() - 7);
        break;
      case 'month':
        startDate.setMonth(now.getMonth() - 1);
        break;
      case 'year':
        startDate.setFullYear(now.getFullYear() - 1);
        break;
      default:
        startDate.setMonth(now.getMonth() - 1);
    }

    const filtered = transactions.filter(t => new Date(t.date) >= startDate);
    
    // Calculate totals
    const income = filtered.filter(t => t.type === 'income').reduce((sum, t) => sum + t.amount, 0);
    const expenses = filtered.filter(t => t.type === 'expense').reduce((sum, t) => sum + t.amount, 0);
    const savings = income - expenses;
    const savingsRate = income > 0 ? (savings / income) * 100 : 0;

    // Category breakdown
    const categoryData = {};
    filtered.filter(t => t.type === 'expense').forEach(t => {
      const cat = t.category || 'other';
      categoryData[cat] = (categoryData[cat] || 0) + t.amount;
    });

    // Time series data
    const timeSeries = {};
    filtered.forEach(t => {
      const date = new Date(t.date).toLocaleDateString();
      if (!timeSeries[date]) {
        timeSeries[date] = { date, income: 0, expense: 0, savings: 0 };
      }
      if (t.type === 'income') {
        timeSeries[date].income += t.amount;
      } else {
        timeSeries[date].expense += t.amount;
      }
      timeSeries[date].savings = timeSeries[date].income - timeSeries[date].expense;
    });

    // Monthly aggregates for year view
    const monthlyData = {};
    if (timeRange === 'year') {
      filtered.forEach(t => {
        const month = new Date(t.date).toLocaleString('default', { month: 'short' });
        if (!monthlyData[month]) {
          monthlyData[month] = { month, income: 0, expense: 0 };
        }
        if (t.type === 'income') {
          monthlyData[month].income += t.amount;
        } else {
          monthlyData[month].expense += t.amount;
        }
      });
    }

    setProcessedData({
      filtered,
      income,
      expenses,
      savings,
      savingsRate,
      categoryData,
      timeSeriesData: Object.values(timeSeries).sort((a,b) => new Date(a.date) - new Date(b.date)),
      monthlyData: timeRange === 'year' ? Object.values(monthlyData) : [],
      totalTransactions: filtered.length
    });
    setLoading(false);
  }, [transactions, timeRange]);

  // Get financial advice based on data
  const getFinancialAdvice = () => {
    if (!processedData) return [];
    const advice = [];
    
    if (processedData.savingsRate < 20) {
      advice.push({
        type: 'warning',
        message: 'Your savings rate is below 20%. Consider reducing non-essential expenses.',
        action: 'Review your spending habits'
      });
    } else if (processedData.savingsRate > 30) {
      advice.push({
        type: 'success',
        message: 'Excellent savings rate! You\'re on track for financial freedom.',
        action: 'Consider investing your surplus'
      });
    }

    const topCategory = Object.entries(processedData.categoryData)
      .sort((a,b) => b[1] - a[1])[0];
    
    if (topCategory && topCategory[1] > processedData.expenses * 0.4) {
      advice.push({
        type: 'info',
        message: `${topCategory[0]} makes up over 40% of your expenses. Can you optimize this?`,
        action: `Review your ${topCategory[0]} spending`
      });
    }

    return advice;
  };

  // Helper function to convert data to CSV (preserved from original)
  const convertToCSV = (data) => {
    if (!data.length) return '';
    const headers = Object.keys(data[0]);
    const csvRows = [headers.join(',')];
    
    for (const row of data) {
      const values = headers.map(header => {
        const val = row[header];
        return `"${val}"`;
      });
      csvRows.push(values.join(','));
    }
    
    return csvRows.join('\n');
  };

  if (loading) {
    return <LoadingSpinner fullScreen message="Generating your financial report..." />;
  }

  if (!processedData || processedData.totalTransactions === 0) {
    return (
      <div className="reports-empty">
        <div className="empty-icon">📊</div>
        <h2>No Data Available</h2>
        <p>Add some transactions to see your financial reports</p>
        <button className="btn-primary" onClick={() => window.location.href = '/dashboard'}>
          Go to Dashboard
        </button>
      </div>
    );
  }

  return (
    <div className="reports-container">
      {/* Header */}
      <div className="reports-header">
        <h1>Financial Reports</h1>
        <div className="report-controls">
          <div className="time-range-selector">
            <button 
              className={timeRange === 'week' ? 'active' : ''}
              onClick={() => setTimeRange('week')}
            >
              Week
            </button>
            <button 
              className={timeRange === 'month' ? 'active' : ''}
              onClick={() => setTimeRange('month')}
            >
              Month
            </button>
            <button 
              className={timeRange === 'year' ? 'active' : ''}
              onClick={() => setTimeRange('year')}
            >
              Year
            </button>
          </div>
          <div className="chart-type-selector">
            <button 
              className={chartType === 'trend' ? 'active' : ''}
              onClick={() => setChartType('trend')}
            >
              📈 Trend
            </button>
            <button 
              className={chartType === 'category' ? 'active' : ''}
              onClick={() => setChartType('category')}
            >
              🥧 Categories
            </button>
            <button 
              className={chartType === 'comparison' ? 'active' : ''}
              onClick={() => setChartType('comparison')}
            >
              📊 Comparison
            </button>
          </div>
        </div>
      </div>

      {/* Key Metrics Cards */}
      <div className="metrics-grid">
        <div className="metric-card income">
          <div className="metric-icon">💰</div>
          <div className="metric-info">
            <span className="metric-label">Total Income</span>
            <span className="metric-value">{userData.currency || 'AED'} {processedData.income.toLocaleString()}</span>
          </div>
        </div>
        <div className="metric-card expense">
          <div className="metric-icon">💸</div>
          <div className="metric-info">
            <span className="metric-label">Total Expenses</span>
            <span className="metric-value">{userData.currency || 'AED'} {processedData.expenses.toLocaleString()}</span>
          </div>
        </div>
        <div className="metric-card savings">
          <div className="metric-icon">🏦</div>
          <div className="metric-info">
            <span className="metric-label">Net Savings</span>
            <span className="metric-value">{userData.currency || 'AED'} {processedData.savings.toLocaleString()}</span>
          </div>
        </div>
        <div className="metric-card rate">
          <div className="metric-icon">📈</div>
          <div className="metric-info">
            <span className="metric-label">Savings Rate</span>
            <span className="metric-value">{processedData.savingsRate.toFixed(1)}%</span>
          </div>
        </div>
      </div>

      {/* Main Chart Area */}
      <div className="chart-container">
        {chartType === 'trend' && (
          <>
            <h3>Income vs Expenses Trend</h3>
            <ResponsiveContainer width="100%" height={400}>
              <AreaChart data={processedData.timeSeriesData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis />
                <Tooltip formatter={(value) => `${userData.currency || 'AED'} ${value.toLocaleString()}`} />
                <Legend />
                <Area type="monotone" dataKey="income" stroke={COLORS.income} fill={COLORS.income} fillOpacity={0.3} />
                <Area type="monotone" dataKey="expense" stroke={COLORS.expense} fill={COLORS.expense} fillOpacity={0.3} />
              </AreaChart>
            </ResponsiveContainer>
          </>
        )}

        {chartType === 'category' && (
          <>
            <h3>Expense Breakdown by Category</h3>
            <ResponsiveContainer width="100%" height={400}>
              <PieChart>
                <Pie
                  data={Object.entries(processedData.categoryData).map(([name, value]) => ({ name, value }))}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                  outerRadius={150}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {Object.entries(processedData.categoryData).map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(value) => `${userData.currency || 'AED'} ${value.toLocaleString()}`} />
              </PieChart>
            </ResponsiveContainer>
          </>
        )}

        {chartType === 'comparison' && (
          <>
            <h3>Income vs Expense Comparison</h3>
            <ResponsiveContainer width="100%" height={400}>
              <BarChart data={timeRange === 'year' ? processedData.monthlyData : processedData.timeSeriesData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey={timeRange === 'year' ? 'month' : 'date'} />
                <YAxis />
                <Tooltip formatter={(value) => `${userData.currency || 'AED'} ${value.toLocaleString()}`} />
                <Legend />
                <Bar dataKey="income" fill={COLORS.income} />
                <Bar dataKey="expense" fill={COLORS.expense} />
              </BarChart>
            </ResponsiveContainer>
          </>
        )}
      </div>

      {/* Category Breakdown Table */}
      <div className="category-breakdown">
        <h3>Detailed Category Breakdown</h3>
        <div className="category-table">
          <div className="category-header">
            <span>Category</span>
            <span>Amount</span>
            <span>Percentage</span>
          </div>
          {Object.entries(processedData.categoryData)
            .sort((a,b) => b[1] - a[1])
            .map(([category, amount]) => (
              <div key={category} className="category-row">
                <span className="category-name">
                  <span className="category-dot" style={{ backgroundColor: COLORS[category] || COLORS.other }}></span>
                  {category.charAt(0).toUpperCase() + category.slice(1)}
                </span>
                <span className="category-amount">{userData.currency || 'AED'} {amount.toLocaleString()}</span>
                <span className="category-percentage">
                  {((amount / processedData.expenses) * 100).toFixed(1)}%
                </span>
              </div>
            ))}
        </div>
      </div>

      {/* Financial Advice Section */}
      <div className="advice-section">
        <h3>💡 Personalized Financial Insights</h3>
        <div className="advice-cards">
          {getFinancialAdvice().map((advice, index) => (
            <div key={index} className={`advice-card ${advice.type}`}>
              <div className="advice-icon">
                {advice.type === 'success' && '🎉'}
                {advice.type === 'warning' && '⚠️'}
                {advice.type === 'info' && '💡'}
              </div>
              <div className="advice-content">
                <p>{advice.message}</p>
                <button className="advice-action">{advice.action}</button>
              </div>
            </div>
          ))}
          {getFinancialAdvice().length === 0 && (
            <div className="advice-card info">
              <div className="advice-icon">👍</div>
              <div className="advice-content">
                <p>You're doing great! Keep tracking your expenses to maintain financial health.</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Export Options */}
      <div className="export-section">
        <button className="btn-secondary" onClick={() => window.print()}>
          🖨️ Print Report
        </button>
        <button className="btn-primary" onClick={() => {
          // CSV export functionality
          const csv = convertToCSV(processedData.timeSeriesData);
          const blob = new Blob([csv], { type: 'text/csv' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `financial-report-${new Date().toISOString()}.csv`;
          a.click();
          URL.revokeObjectURL(url);
        }}>
          📥 Export CSV
        </button>
      </div>
    </div>
  );
};

export default Reports;