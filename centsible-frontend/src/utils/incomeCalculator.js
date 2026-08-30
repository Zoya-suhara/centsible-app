// incomeCalculator.js
export const calculateMonthlyEquivalent = (amount, frequency) => {
  switch (frequency) {
    case 'weekly':
      return amount * 4.33; // Average weeks in a month
    case 'bi_weekly':
      return amount * 2.167;
    case 'daily':
      return amount * 30;
    case 'yearly':
      return amount / 12;
    case 'project_based':
      return amount; // Assume one project per month
    default:
      return amount;
  }
};

export const calculateDisposableIncome = (incomeSources, expenses, savingsGoal) => {
  const totalMonthlyIncome = incomeSources.reduce((total, source) => {
    return total + calculateMonthlyEquivalent(source.amount, source.frequency);
  }, 0);
  
  const totalMonthlyExpenses = expenses.reduce((total, expense) => {
    return total + expense.amount;
  }, 0);
  
  return Math.max(0, totalMonthlyIncome - totalMonthlyExpenses - savingsGoal);
};