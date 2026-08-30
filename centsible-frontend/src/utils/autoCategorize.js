// src/utils/autoCategorize.js

/**
 * Automatically categorizes an expense based on description and amount
 * @param {string} description - Transaction description
 * @param {number} amount - Transaction amount
 * @param {Array} previousTransactions - User's previous transactions for learning
 * @returns {string} - Suggested category
 */
export const autoCategorizeExpense = (description, amount, previousTransactions = []) => {
  if (!description || typeof description !== 'string') {
    return 'other';
  }

  const desc = description.toLowerCase().trim();
  
  // Enhanced keyword-to-category mapping for UAE context
  const categoryKeywords = {
    'groceries': [
      'grocery', 'food', 'eat', 'restaurant', 'cafe', 'coffee', 'lunch', 
      'dinner', 'breakfast', 'meal', 'supermarket', 'market', 'lulu', 'carrefour',
      'spinneys', 'choithram', 'union coop', 'bakery', 'butcher', 'vegetable', 
      'fruit', 'snack', 'drink', 'water', 'juice', 'tea', 'chocolate', 'sweet',
      'ice cream', 'burger', 'pizza', 'sandwich', 'shawarma', 'mandi', 'kebab',
      'starbucks', 'costa', 'tim hortons', 'food court'
    ],
    'rent': [
      'rent', 'house', 'apartment', 'villa', 'flat', 'landlord', 'lease',
      'accommodation', 'residence', 'property', 'housing', 'mortgage', 'room',
      'ejari', 'real estate', 'dubai properties', 'abu dhabi rent'
    ],
    'transportation': [
      'fuel', 'gas', 'petrol', 'diesel', 'transport', 'bus', 'taxi',
      'uber', 'careem', 'metro', 'train', 'flight', 'airport', 'parking',
      'car', 'vehicle', 'maintenance', 'repair', 'oil change', 'tire',
      'insurance', 'registration', 'license', 'salik', 'rta', 'nol card',
      'etihad rail', 'emirates', 'flydubai'
    ],
    'utilities': [
      'electric', 'water', 'internet', 'wifi', 'mobile', 'phone', 'bill',
      'dewa', 'etisalat', 'du', 'utility', 'gas bill', 'electricity',
      'subscription', 'netflix', 'spotify', 'starzplay', 'osn', 'cable',
      'chiller', 'housing fee', 'municipality'
    ],
    'entertainment': [
      'movie', 'cinema', 'vox', 'reel', 'theater', 'concert', 'show', 'game',
      'gaming', 'playstation', 'xbox', 'hobby', 'fun', 'party', 'event',
      'ticket', 'amusement', 'park', 'ferrari world', 'yas waterworld',
      'dubai parks', 'img worlds', 'museum', 'activity', 'bowling', 'escape room'
    ],
    'shopping': [
      'clothes', 'shoes', 'bag', 'accessory', 'watch', 'jewelry', 'diamond',
      'gold', 'electronics', 'phone', 'iphone', 'samsung', 'laptop', 'tablet',
      'camera', 'gadget', 'appliance', 'furniture', 'home', 'decor', 'gift',
      'present', 'mall', 'dubai mall', 'mall of emirates', 'store', 'shop',
      'purchase', 'buy', 'sale', 'discount', 'brand', 'fashion', 'perfume'
    ],
    'health': [
      'doctor', 'hospital', 'clinic', 'medical', 'medicine', 'pharmacy',
      'drug', 'pill', 'vitamin', 'supplement', 'dental', 'dentist',
      'optic', 'glasses', 'lens', 'checkup', 'test', 'lab', 'xray',
      'therapy', 'massage', 'spa', 'gym', 'fitness', 'yoga', 'exercise',
      'insurance', 'healthcare', 'surgery', 'operation'
    ],
    'education': [
      'book', 'course', 'tuition', 'school', 'university', 'college',
      'training', 'workshop', 'seminar', 'certificate', 'degree',
      'stationery', 'pen', 'paper', 'notebook', 'library', 'research',
      'tuition fee', 'school fee', 'university fee'
    ],
    'debt': [
      'loan', 'debt', 'credit', 'card payment', 'emi', 'installment',
      'borrow', 'lend', 'mortgage payment', 'car loan', 'personal loan',
      'bank loan', 'finance', 'repayment'
    ],
    'investment': [
      'invest', 'stock', 'share', 'etf', 'mutual fund', 'gold investment',
      'property investment', 'crypto', 'bitcoin', 'ethereum', 'savings',
      'fixed deposit', 'bonds', 'dividend', 'trading'
    ]
  };

  // Priority-based checking
  const checks = [
    // 1. Exact keyword matches
    () => {
      for (const [category, keywords] of Object.entries(categoryKeywords)) {
        if (keywords.some(keyword => {
          // Check for exact word boundaries
          const regex = new RegExp(`\\b${keyword}\\b`, 'i');
          return regex.test(desc);
        })) {
          return category;
        }
      }
      return null;
    },

    // 2. Amount-based heuristics
    () => {
      if (amount <= 50 && (desc.includes('coffee') || desc.includes('tea') || desc.includes('drink'))) {
        return 'groceries';
      }
      if (amount >= 1000 && (desc.includes('monthly') || desc.includes('payment'))) {
        return 'rent';
      }
      if (amount >= 200 && amount <= 500 && desc.includes('fuel')) {
        return 'transportation';
      }
      return null;
    },

    // 3. Previous transaction patterns (machine learning light)
    () => {
      if (previousTransactions.length > 0) {
        // Find transactions with similar descriptions
        const words = desc.split(' ').filter(word => word.length > 3);
        const similarTransactions = previousTransactions.filter(t => {
          const tDesc = t.description.toLowerCase();
          return words.some(word => tDesc.includes(word)) || 
                 Math.abs(t.amount - amount) < (amount * 0.3); // Within 30% amount difference
        });

        if (similarTransactions.length > 0) {
          // Find most common category
          const categoryCounts = {};
          similarTransactions.forEach(t => {
            if (t.category) {
              categoryCounts[t.category] = (categoryCounts[t.category] || 0) + 1;
            }
          });

          if (Object.keys(categoryCounts).length > 0) {
            return Object.keys(categoryCounts).reduce((a, b) => 
              categoryCounts[a] > categoryCounts[b] ? a : b
            );
          }
        }
      }
      return null;
    },

    // 4. Location/merchant detection
    () => {
      // UAE-specific merchants
      const merchants = {
        'lulu': 'groceries',
        'carrefour': 'groceries',
        'spinneys': 'groceries',
        'choithram': 'groceries',
        'union coop': 'groceries',
        'emirates nbd': 'bank',
        'adcb': 'bank',
        'enbd': 'bank',
        'dubai mall': 'shopping',
        'mall of emirates': 'shopping',
        'dewa': 'utilities',
        'etisalat': 'utilities',
        'du': 'utilities',
        'careem': 'transportation',
        'uber': 'transportation',
        'taxi': 'transportation'
      };

      for (const [merchant, category] of Object.entries(merchants)) {
        if (desc.includes(merchant.toLowerCase())) {
          return category;
        }
      }
      return null;
    }
  ];

  // Run through all checks
  for (const check of checks) {
    const result = check();
    if (result) {
      return result;
    }
  }

  // Default fallback
  return 'other';
};

/**
 * Maps transaction category to wizard budget category
 * @param {string} transactionCategory - Category from auto-categorization
 * @returns {string} - Wizard budget category or null if not in budget
 */
export const mapToWizardCategory = (transactionCategory) => {
  const categoryMap = {
    'groceries': 'groceries',
    'rent': 'rent',
    'transportation': 'transportation',
    'utilities': 'utilities',
    'health': 'other',
    'education': 'other',
    'entertainment': 'other',
    'shopping': 'other',
    'debt': 'other',
    'investment': 'other',
    'other': 'other'
  };

  return categoryMap[transactionCategory] || 'other';
};

/**
 * Calculates confidence score for auto-categorization
 * @param {string} description - Transaction description
 * @param {string} suggestedCategory - The suggested category
 * @returns {number} - Confidence score from 0 to 1
 */
export const getCategorizationConfidence = (description, suggestedCategory) => {
  const desc = description.toLowerCase();
  
  // Strong indicators
  const strongIndicators = {
    'groceries': ['grocery', 'supermarket', 'restaurant', 'cafe'],
    'rent': ['rent', 'apartment', 'villa', 'landlord'],
    'transportation': ['fuel', 'uber', 'taxi', 'petrol'],
    'utilities': ['dewa', 'etisalat', 'du', 'bill']
  };

  const indicators = strongIndicators[suggestedCategory] || [];
  
  // Check for strong indicators
  for (const indicator of indicators) {
    if (desc.includes(indicator)) {
      return 0.95; // High confidence
    }
  }

  // Check word count and specificity
  const words = description.split(' ').filter(word => word.length > 3);
  if (words.length >= 2) {
    return 0.75; // Medium confidence
  }

  return 0.5; // Low confidence
};