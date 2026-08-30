// nlpParser.js
import * as chrono from 'chrono-node';
import { format, addDays, addWeeks, addMonths, nextDay } from 'date-fns';
import { autoCategorizeExpense } from './autoCategorize';

export const parseDate = (text) => {
  try {
    const results = chrono.parse(text, new Date());
    if (results && results.length > 0) {
      return {
        date: results[0].start.date(),
        text: results[0].text,
        certainty: 'high'
      };
    }
    
    // Fallback patterns
    const patterns = [
      // Today/tomorrow
      { regex: /today|now/i, offset: 0 },
      { regex: /tomorrow/i, offset: 1 },
      { regex: /next week/i, offset: 7 },
      { regex: /next month/i, offset: 30 },
      
      // Days of week
      { regex: /monday|mon/i, day: 1 },
      { regex: /tuesday|tue/i, day: 2 },
      { regex: /wednesday|wed/i, day: 3 },
      { regex: /thursday|thu/i, day: 4 },
      { regex: /friday|fri/i, day: 5 },
      { regex: /saturday|sat/i, day: 6 },
      { regex: /sunday|sun/i, day: 0 },
      
      // Month dates
      { regex: /(\d+)(?:st|nd|rd|th)?(?:\s+of)?(?:\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*)?/i, group: 1 }
    ];
    
    for (const pattern of patterns) {
      const match = text.match(pattern.regex);
      if (match) {
        const now = new Date();
        if (pattern.offset !== undefined) {
          return {
            date: addDays(now, pattern.offset),
            text: match[0],
            certainty: 'medium'
          };
        } else if (pattern.day !== undefined) {
          return {
            date: nextDay(now, pattern.day),
            text: match[0],
            certainty: 'medium'
          };
        } else if (pattern.group) {
          const day = parseInt(match[pattern.group]);
          if (day >= 1 && day <= 31) {
            const date = new Date(now.getFullYear(), now.getMonth(), day);
            if (date < now) date.setMonth(date.getMonth() + 1);
            return {
              date,
              text: match[0],
              certainty: 'medium'
            };
          }
        }
      }
    }
    
    return null;
  } catch (error) {
    console.error('Date parsing error:', error);
    return null;
  }
};

export const parseFrequency = (text) => {
  const lowerText = text.toLowerCase();
  
  const frequencyMap = {
    // Regular frequencies
    'monthly': { type: 'monthly', days: 30, certainty: 'high' },
    'weekly': { type: 'weekly', days: 7, certainty: 'high' },
    'bi-weekly': { type: 'bi_weekly', days: 14, certainty: 'high' },
    'fortnightly': { type: 'fortnightly', days: 14, certainty: 'high' },
    'daily': { type: 'daily', days: 1, certainty: 'high' },
    'yearly': { type: 'yearly', days: 365, certainty: 'high' },
    'annually': { type: 'yearly', days: 365, certainty: 'high' },
    
    // Irregular/commission based
    'commission': { type: 'commission', days: null, certainty: 'medium' },
    'irregular': { type: 'irregular', days: null, certainty: 'medium' },
    'variable': { type: 'irregular', days: null, certainty: 'medium' },
    'project': { type: 'project_based', days: null, certainty: 'medium' },
    'allowance': { type: 'allowance', days: null, certainty: 'medium' },
    
    // Number based
    'every month': { type: 'monthly', days: 30, certainty: 'high' },
    'every week': { type: 'weekly', days: 7, certainty: 'high' },
    'every day': { type: 'daily', days: 1, certainty: 'high' },
    'twice a month': { type: 'semi_monthly', days: 15, certainty: 'medium' }
  };
  
  for (const [key, value] of Object.entries(frequencyMap)) {
    if (lowerText.includes(key)) {
      return value;
    }
  }
  
  // Check for patterns like "every 2 weeks"
  const patternMatch = lowerText.match(/every\s+(\d+)\s+(day|week|month|year)/i);
  if (patternMatch) {
    const number = parseInt(patternMatch[1]);
    const unit = patternMatch[2].toLowerCase();
    
    const unitDays = {
      'day': 1,
      'week': 7,
      'month': 30,
      'year': 365
    };
    
    if (unitDays[unit]) {
      return {
        type: 'custom',
        days: number * unitDays[unit],
        certainty: 'medium'
      };
    }
  }
  
  return { type: 'unknown', days: null, certainty: 'low' };
};
export const parseFinancialAmount = (text) => {
  const patterns = [
    // Currency first: "AED 500", "dirham 500", etc.
    /(aed|usd|eur|gbp|dirham|dhs|₹|\$|€|£)\s*([\d,]+(?:\.\d{2})?)/i,
    // Amount first: "500 AED", "500 dirham", etc.
    /([\d,]+(?:\.\d{2})?)\s*(aed|usd|eur|gbp|dirham|dhs)/i,
    // Just numbers
    /([\d,]+(?:\.\d{2})?)/,
    // Written numbers: "five hundred"
    /(?:about|around|approximately)?\s*(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|million)\s*(?:and)?\s*(?:aed|usd|eur|gbp)?/gi
  ];
  
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      let amount = 0;
      let currency = null;
      
      // Check if the pattern captured a currency symbol/code
      if (pattern.source.includes('(aed|usd|eur|gbp|dirham|dhs|₹|\\$|€|£)')) {
        currency = match[1].toUpperCase();
        amount = parseFloat(match[2].replace(/,/g, ''));
      } else if (pattern.source.includes('([\\d,]+')) {
        amount = parseFloat(match[1].replace(/,/g, ''));
        if (match[2]) currency = match[2].toUpperCase();
      }
      
      // ✅ Normalize currency synonyms to standard codes
      if (currency === 'DIRHAM' || currency === 'DHS') {
        currency = 'AED';
      }
      if (currency === '$') currency = 'USD';
      if (currency === '€') currency = 'EUR';
      if (currency === '£') currency = 'GBP';
      if (currency === '₹') currency = 'INR';
      
      if (amount > 0) {
        return {
          amount,
          currency: currency || 'AED',
          certainty: 'high'
        };
      }
    }
  }
  return null;
};
/**
 * Simple category inference based on keywords.
 * Replace this with autoCategorizeExpense if available.
 */
const inferCategory = (description) => {
  const lower = description.toLowerCase();
  
  if (/coffee|lunch|dinner|breakfast|food|icecream|meal|snack|restaurant|takeaway|groceries/.test(lower)) return 'food';
  if (/uber|taxi|fuel|petrol|metro|bus|transport|parking/.test(lower)) return 'transportation';
  if (/rent|mortgage|housing/.test(lower)) return 'rent';
  if (/electricity|water|internet|phone|bill|utility/.test(lower)) return 'bills';
  if (/shopping|clothes|shoes|bag|gadget|amazon/.test(lower)) return 'shopping';
  if (/movie|netflix|spotify|game|entertainment/.test(lower)) return 'entertainment';
  if (/doctor|medicine|pharmacy|health/.test(lower)) return 'health';
  
  return 'other';
};

/**
 * Parses a natural language expense message.
 * Example: "bought an icecream for 5 dirhams"
 * Returns: { description, amount, currency, category, rawText }
 */
export const parseExpense = (text, recentTransactions = []) => {
  const amountInfo = parseFinancialAmount(text);
  if (!amountInfo) return null;

    // Extract description by removing filler words, currencies, and numbers
  let description = text
    // Remove numbers (including decimals)
    .replace(/\d+(\.\d+)?/g, '')
    // Remove currency words and symbols (with optional 's' for plurals)
    .replace(/\b(aed|usd|eur|gbp|inr|dirham|dollar|dhs|rupees|₹|\$|€|£)s?\b/gi, '')
    // Remove common action words and fillers
    .replace(/\b(i|we|my|our|the|a|an|some|just|got|purchased|spent|paid|bought|for|on|at|in|with|using|cash|card|cost|purchase)s?\b/gi, '')
    // Remove punctuation (keep letters and spaces only)
    .replace(/[^\w\s]/g, '')
    // Collapse multiple spaces
    .replace(/\s+/g, ' ')
    .trim();

  // If we still have a messy string, try to extract the most likely noun phrase
  if (!description || description.length < 2) {
    description = 'Miscellaneous expense';
  } else {
    // Capitalize first letter of each word for readability
    description = description
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
  }

    // Use autoCategorizeExpense if available, otherwise use inferCategory
  let category;
  if (typeof autoCategorizeExpense === 'function') {
    try {
      category = autoCategorizeExpense(description, amountInfo.amount, recentTransactions);
    } catch (e) {
      console.warn('autoCategorizeExpense failed, using fallback', e);
      category = inferCategory(description);
    }
  } else {
    category = inferCategory(description);
  }

  // ✅ NORMALIZE CATEGORY TO BACKEND ENUM VALUES
  const categoryMap = {
    'food': 'dining',
    'bills': 'utilities',
    'transport': 'transportation',
    'health': 'healthcare',
    'education': 'education',
    'entertainment': 'entertainment',
    'shopping': 'shopping',
    'other': 'other'
  };
  category = categoryMap[category] || category;

  // ========== QUANTITY DETECTION ==========
  // Check for "X items at Y each" or "Y each" patterns
  let finalAmount = amountInfo.amount;

  // Pattern 1: "X items at Y each"
  const quantityMatch = text.match(/(\d+)\s*(?:items?|pieces?|units?|jewelrys?|of)?\s*(?:at|for|@)\s*(\d+(?:\.\d+)?)/i);
  if (quantityMatch) {
    const qty = parseInt(quantityMatch[1]);
    const unitPrice = parseFloat(quantityMatch[2]);
    if (qty > 0 && unitPrice > 0) {
      finalAmount = qty * unitPrice;
      description = `${qty} ${description}`;
    }
  } else {
    // Pattern 2: "... Y each" with quantity mentioned elsewhere
    const eachMatch = text.match(/(\d+(?:\.\d+)?)\s*(?:each|per\s*(?:item|piece|one))/i);
    if (eachMatch) {
      const unitPrice = parseFloat(eachMatch[1]);
      const qtyMatch = text.match(/(\d+)\s*(?:items?|pieces?|jewelrys?)/i);
      if (qtyMatch) {
        const qty = parseInt(qtyMatch[1]);
        finalAmount = qty * unitPrice;
        description = `${qty} ${description}`;
      }
    }
  }

  return {
    description,
    amount: finalAmount,
    currency: amountInfo.currency || 'AED',
    category,
    rawText: text
  };
};