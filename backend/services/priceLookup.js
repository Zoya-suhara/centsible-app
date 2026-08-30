// backend/services/priceLookup.js
const NodeCache = require('node-cache');
const cache = new NodeCache({ stdTTL: 86400 }); // 24 hours

// UAE-specific real estate and cost of living data (adapted from frontend priceDatabase)
const UAE_RENT_PRICES = {
  'dubai marina': { studio: 55000, '1-bedroom': 85000, '2-bedroom': 130000 },
  'downtown dubai': { studio: 60000, '1-bedroom': 95000, '2-bedroom': 140000 },
  'jumeirah': { villa: 250000, apartment: 110000 },
  'business bay': { studio: 50000, '1-bedroom': 80000, '2-bedroom': 120000 },
  'jlt': { studio: 45000, '1-bedroom': 70000, '2-bedroom': 100000 },
  'dubai hills': { studio: 50000, '1-bedroom': 75000, '2-bedroom': 110000 },
  'palm jumeirah': { apartment: 150000, villa: 400000 },
  'abu dhabi': { studio: 45000, '1-bedroom': 70000, '2-bedroom': 110000 },
  'corniche': { '1-bedroom': 80000, '2-bedroom': 120000 },
  'sharjah': { studio: 20000, '1-bedroom': 35000, '2-bedroom': 50000 },
  'ajman': { studio: 18000, '1-bedroom': 30000, '2-bedroom': 45000 },
};

const UAE_LIVING_COSTS = {
  groceries: { single: 400, couple: 800, family: 1500 },
  utilities: { electricity: 500, water: 200, internet: 350, mobile: 100 },
  transportation: { petrol: 800, salik: 300, metro: 350, taxi: 50 },
};

const STATIC_PRICES = {
  // Electronics
  'iphone': 3500, 'iphone 15': 3800, 'iphone 14': 2800, 'iphone 13': 2200,
  'macbook': 5500, 'macbook pro': 6500, 'macbook air': 4500,
  'ipad': 2000, 'apple watch': 1500, 'airpods': 800,
  'samsung': 2500, 'samsung galaxy': 3000, 'galaxy s24': 3500,
  'laptop': 3000, 'gaming laptop': 5000, 'chromebook': 1200,
  'tablet': 1000, 'smartwatch': 800, 'headphones': 400, 'earbuds': 300,
  'camera': 2500, 'dslr': 3500, 'drone': 2000,
  'playstation': 2000, 'ps5': 2200, 'xbox': 2000, 'nintendo switch': 1200,
  'tv': 2500, 'smart tv': 3000, 'monitor': 800,

  // Fashion
  'shoes': 400, 'nike': 450, 'adidas': 400, 'sneakers': 500,
  'bag': 600, 'handbag': 800, 'backpack': 300, 'wallet': 200,
  'watch': 1000, 'rolex': 50000, 'casio': 300, 'fossil': 600,
  'dress': 350, 'shirt': 150, 'jeans': 250, 'jacket': 500, 'coat': 600,
  'jewelry': 500, 'necklace': 400, 'bracelet': 300, 'earrings': 200,
  'perfume': 300, 'cologne': 350,

  // Precious Metals
  'gold': 290, 'gold necklace': 1500, 'gold ring': 1200, 'gold bracelet': 2000,
  'gold chain': 1800, 'gold earrings': 800, 'gold coin': 1200,
  'silver': 3.5, 'silver necklace': 200, 'silver ring': 150, 'silver bracelet': 250,

  // Home
  'furniture': 2000, 'sofa': 2500, 'bed': 1500, 'mattress': 1200,
  'table': 800, 'chair': 400, 'desk': 600, 'bookshelf': 500,
  'wardrobe': 1500, 'dining table': 1800, 'coffee table': 500,
  'appliance': 1000, 'refrigerator': 2500, 'fridge': 2500,
  'washing machine': 1800, 'dryer': 1500, 'dishwasher': 2000,
  'microwave': 400, 'oven': 1500, 'air conditioner': 1500, 'ac': 1500,
  'vacuum': 800, 'robot vacuum': 1500,

  // Vehicle
  'car': 80000, 'used car': 40000, 'new car': 100000,
  'suv': 120000, 'sedan': 70000, 'hatchback': 50000,
  'motorcycle': 25000, 'bike': 2000, 'bicycle': 1000,
  'car insurance': 2500, 'car maintenance': 800,

  // Property / Real Estate
  'apartment': 1200000, 'studio apartment': 500000, '1 bedroom apartment': 800000,
  '2 bedroom apartment': 1200000, '3 bedroom apartment': 1800000,
  'villa': 3500000, 'townhouse': 2000000, 'house': 2500000,
  'land': 2000000, 'plot': 1500000, 'commercial property': 3000000,
  'office space': 1500000, 'warehouse': 2000000,
  'rent': 60000, 'monthly rent': 5000, 'yearly rent': 60000,

  // Travel
  'vacation': 8000, 'trip': 5000, 'holiday': 6000,
  'flight': 2000, 'international flight': 3500, 'domestic flight': 800,
  'hotel': 500, 'resort': 1500, 'airbnb': 400,
  'europe trip': 15000, 'maldives trip': 12000, 'dubai staycation': 2000,
  'umrah': 5000, 'hajj': 15000,

  // Education
  'course': 2000, 'online course': 500, 'university': 50000,
  'tuition': 40000, 'books': 500, 'laptop for studies': 3000,
  'certification': 1500, 'bootcamp': 8000,

  // Other
  'gym membership': 2500, 'fitness': 2000, 'yoga': 1500,
  'subscription': 500, 'netflix': 500, 'spotify': 200,
  'gift': 300, 'charity': 500, 'donation': 500,
  'wedding': 100000, 'engagement ring': 15000,
  'pet': 2000, 'dog': 3000, 'cat': 1500,
};

// Category fallbacks
const CATEGORY_FALLBACKS = {
  electronics: 1500, fashion: 400, home: 800, vehicle: 80000,
  property: 1500000, travel: 5000, education: 3000, jewelry: 1000,
  other: 1000
};

/**
 * Main price lookup function - uses static database and UAE-specific data
 */
async function lookupPrice(query, category = 'other') {
  const cacheKey = `price_${query.toLowerCase().trim()}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  const lowerQuery = query.toLowerCase();
  let price = null;
  let source = 'static_db';

  // --- 1. UAE REAL ESTATE / RENT SPECIAL HANDLING ---
  if (category === 'property' || lowerQuery.includes('rent') || lowerQuery.includes('apartment') || lowerQuery.includes('villa') || lowerQuery.includes('studio')) {
    let location = null;
    for (const loc of Object.keys(UAE_RENT_PRICES)) {
      if (lowerQuery.includes(loc)) {
        location = loc;
        break;
      }
    }
    
    if (location) {
      const rentData = UAE_RENT_PRICES[location];
      if (lowerQuery.includes('studio')) price = rentData.studio;
      else if (lowerQuery.includes('1 bed') || lowerQuery.includes('1bed')) price = rentData['1-bedroom'];
      else if (lowerQuery.includes('2 bed') || lowerQuery.includes('2bed')) price = rentData['2-bedroom'];
      else if (lowerQuery.includes('villa')) price = rentData.villa;
      else price = rentData.apartment || rentData['1-bedroom'] || Object.values(rentData)[0];
      
      if (price) {
        source = 'uae_rent_db';
        const result = { price, currency: 'AED', source };
        cache.set(cacheKey, result);
        return result;
      }
    }
    
    // Fallback: average Dubai 1-bedroom yearly rent
    price = 85000;
    source = 'uae_rent_avg';
    const result = { price, currency: 'AED', source };
    cache.set(cacheKey, result);
    return result;
  }

  // --- 2. UAE LIVING COSTS (groceries, utilities, transport) ---
  if (lowerQuery.includes('groceries') || lowerQuery.includes('food')) {
    if (lowerQuery.includes('family')) price = UAE_LIVING_COSTS.groceries.family;
    else if (lowerQuery.includes('couple')) price = UAE_LIVING_COSTS.groceries.couple;
    else price = UAE_LIVING_COSTS.groceries.single;
    source = 'uae_groceries';
    const result = { price, currency: 'AED', source };
    cache.set(cacheKey, result);
    return result;
  }
  
  if (lowerQuery.includes('utilities') || lowerQuery.includes('bills')) {
    // Sum of average utilities
    price = Object.values(UAE_LIVING_COSTS.utilities).reduce((a, b) => a + b, 0);
    source = 'uae_utilities';
    const result = { price, currency: 'AED', source };
    cache.set(cacheKey, result);
    return result;
  }
  
  if (lowerQuery.includes('transport') || lowerQuery.includes('petrol') || lowerQuery.includes('fuel')) {
    price = UAE_LIVING_COSTS.transportation.petrol;
    source = 'uae_transport';
    const result = { price, currency: 'AED', source };
    cache.set(cacheKey, result);
    return result;
  }

  // --- 3. STATIC PRICE DATABASE ---
  for (const [keyword, keywordPrice] of Object.entries(STATIC_PRICES)) {
    if (lowerQuery.includes(keyword)) {
      price = keywordPrice;
      break;
    }
  }

  // --- 4. CATEGORY FALLBACK ---
  if (!price) {
    price = CATEGORY_FALLBACKS[category] || CATEGORY_FALLBACKS.other;
    source = 'category_fallback';
  }

  // Special handling for gold/silver per gram approximation
  if (lowerQuery.includes('gold') && !price) {
    price = 290; // Approx AED per gram
    source = 'gold_estimate';
  }
  if (lowerQuery.includes('silver') && !price) {
    price = 3.5; // Approx AED per gram
    source = 'silver_estimate';
  }

  const result = { price, currency: 'AED', source };
  cache.set(cacheKey, result);
  return result;
}

module.exports = { lookupPrice };