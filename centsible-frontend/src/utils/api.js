// centsible-frontend/src/utils/api.js
import axios from 'axios';

// Get API URL from environment or use default
const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';

// Create axios instance with default config
const api = axios.create({
  baseURL: API_URL,
  timeout: 30000, // 30 seconds timeout
  headers: {
    'Content-Type': 'application/json',
  },
});

// Flag to prevent multiple token refresh requests
let isRefreshing = false;
let failedQueue = [];

// Process queue of failed requests
const processQueue = (error, token = null) => {
  failedQueue.forEach(prom => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token);
    }
  });
  failedQueue = [];
};

// Request interceptor - Add auth token to every request
api.interceptors.request.use(
  (config) => {
    // Get token from localStorage
    const token = localStorage.getItem('token');
    
    // If token exists, add to headers
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    
    // For FormData, remove Content-Type to let browser set it with boundary
    if (config.data instanceof FormData) {
      delete config.headers['Content-Type'];
    }
    
    // Optional: Add request tracking for debugging
    if (process.env.NODE_ENV === 'development') {
      console.log(`🚀 API Request: ${config.method?.toUpperCase()} ${config.url}`, config.data);
    }
    
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor - Handle errors globally
api.interceptors.response.use(
  (response) => {
    // Optional: Log successful responses in development
    if (process.env.NODE_ENV === 'development') {
      console.log(`✅ API Success: ${response.config.url}`, response.data);
    }
    return response;
  },
  async (error) => {
    const originalRequest = error.config;
    
    // Handle 401 Unauthorized errors (token expired)
    if (error.response?.status === 401 && !originalRequest._retry) {
      // Don't retry login/register endpoints
      if (originalRequest.url?.includes('/auth/login') || 
          originalRequest.url?.includes('/auth/register')) {
        // Just reject login/register failures
        return Promise.reject(error);
      }
      
      // If already refreshing, queue this request
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        })
          .then(token => {
            originalRequest.headers.Authorization = `Bearer ${token}`;
            return api(originalRequest);
          })
          .catch(err => Promise.reject(err));
      }
      
      originalRequest._retry = true;
      isRefreshing = true;
      
      try {
        // Try to refresh token
        const refreshToken = localStorage.getItem('refreshToken');
        if (!refreshToken) {
          throw new Error('No refresh token available');
        }
        
        const response = await axios.post(`${API_URL}/auth/refresh-token`, {
          refreshToken,
        });
        
        const { token: newToken, refreshToken: newRefreshToken } = response.data;
        
        // Store new tokens
        localStorage.setItem('token', newToken);
        localStorage.setItem('refreshToken', newRefreshToken);
        
        // Update authorization header
        originalRequest.headers.Authorization = `Bearer ${newToken}`;
        
        // Process queued requests
        processQueue(null, newToken);
        
        return api(originalRequest);
      } catch (refreshError) {
        // Refresh failed - clear tokens and redirect to login
        processQueue(refreshError, null);
        
        // Clear all auth data
        localStorage.removeItem('token');
        localStorage.removeItem('refreshToken');
        localStorage.removeItem('user');
        
        // Redirect to login page
        if (typeof window !== 'undefined') {
          //window.location.href = '/login';
        }
        
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }
    
    // Handle 403 Forbidden
    if (error.response?.status === 403) {
      console.error('Access forbidden:', error.response.data);
      // Optional: Show notification to user
      if (typeof window !== 'undefined') {
        // You can dispatch a custom event for toast notification
        window.dispatchEvent(new CustomEvent('showToast', {
          detail: { message: 'You don\'t have permission to do this', type: 'error' }
        }));
      }
    }
    
    // Handle 404 Not Found
    if (error.response?.status === 404) {
      console.error('Resource not found:', error.config.url);
    }
    
    // Handle 500 Server Error
    if (error.response?.status >= 500) {
      console.error('Server error:', error.response.data);
      // Optional: Show user-friendly message
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('showToast', {
          detail: { message: 'Server error. Please try again later.', type: 'error' }
        }));
      }
    }
    
    // Handle network errors
    if (error.code === 'ECONNABORTED') {
      console.error('Request timeout:', error.config.url);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('showToast', {
          detail: { message: 'Request timeout. Please check your connection.', type: 'error' }
        }));
      }
    }
    
    if (error.message === 'Network Error') {
      console.error('Network error - check if backend is running');
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('showToast', {
          detail: { message: 'Cannot connect to server. Please check your internet connection.', type: 'error' }
        }));
      }
    }
    
    // Reject with the error
    return Promise.reject(error);
  }
);

// Helper function to set auth token (for login/register)
export const setAuthToken = (token) => {
  if (token) {
    localStorage.setItem('token', token);
    api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
  } else {
    localStorage.removeItem('token');
    delete api.defaults.headers.common['Authorization'];
  }
};

// Helper function to clear auth data
export const clearAuthData = () => {
  localStorage.removeItem('token');
  localStorage.removeItem('refreshToken');
  localStorage.removeItem('user');
  delete api.defaults.headers.common['Authorization'];
};

// Helper function to check if user is authenticated
export const isAuthenticated = () => {
  const token = localStorage.getItem('token');
  if (!token) return false;
  
  // Optional: Check if token is expired
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    const isExpired = payload.exp * 1000 < Date.now();
    if (isExpired) {
      clearAuthData();
      return false;
    }
    return true;
  } catch (e) {
    return false;
  }
};

// Helper function to get current user from token
export const getCurrentUser = () => {
  try {
    const userStr = localStorage.getItem('user');
    if (userStr) return JSON.parse(userStr);
    
    // Try to get from token
    const token = localStorage.getItem('token');
    if (token) {
      const payload = JSON.parse(atob(token.split('.')[1]));
      return {
        id: payload.id,
        email: payload.email,
        name: payload.name
      };
    }
  } catch (e) {
    console.error('Error parsing user data:', e);
  }
  return null;
};

// API endpoint groups (for easier imports)
export const authAPI = {
  login: (credentials) => api.post('/auth/login', credentials),
  register: (userData) => api.post('/auth/register', userData),
  logout: () => api.post('/auth/logout'),
  refreshToken: () => api.post('/auth/refresh-token'),
  forgotPassword: (email) => api.post('/auth/forgot-password', { email }),
  resetPassword: (token, password) => api.post('/auth/reset-password', { token, password }),
  changePassword: (oldPassword, newPassword) => api.post('/auth/change-password', { oldPassword, newPassword }),
};

export const transactionAPI = {
  getAll: (params) => api.get('/transactions', { params }),
  getById: (id) => api.get(`/transactions/${id}`),
  create: (data) => api.post('/transactions', data),
  update: (id, data) => api.put(`/transactions/${id}`, data),
  delete: (id) => api.delete(`/transactions/${id}`),
  getSummary: (params) => api.get('/transactions/summary', { params }),
  getByDateRange: (startDate, endDate) => api.get('/transactions/range', { params: { startDate, endDate } }),
};

export const roomAPI = {
  getAll: () => api.get('/rooms'),
  getById: (code) => api.get(`/rooms/${code}`),
  create: (data) => api.post('/rooms/create', data),
  join: (roomCode, userId) => api.post('/rooms/join', { roomCode, userId }),
  leave: (roomCode, userId) => api.post('/rooms/leave', { roomCode, userId }),
  addExpense: (roomCode, expense) => api.post(`/rooms/${roomCode}/expenses`, expense),
  deleteExpense: (roomCode, expenseId) => api.delete(`/rooms/${roomCode}/expenses/${expenseId}`),
  settleBalance: (roomCode, fromUserId, toUserId, amount) => 
    api.post(`/rooms/${roomCode}/settle`, { fromUserId, toUserId, amount }),
};

export const userAPI = {
  getProfile: () => api.get('/users/profile'),
  updateProfile: (data) => api.put('/users/profile', data),
  deleteAccount: () => api.delete('/users/profile'),
  getStats: () => api.get('/users/stats'),
};

export const wishlistAPI = {
  getAll: () => api.get('/wishlist'),
  create: (data) => api.post('/wishlist', data),
  update: (id, data) => api.put(`/wishlist/${id}`, data),
  delete: (id) => api.delete(`/wishlist/${id}`),
  addSavings: (id, amount) => api.post(`/wishlist/${id}/savings`, { amount }),
  lookupPrice: (query, category) => api.post('/wishlist/lookup-price', { query, category }),
};
export const reminderAPI = {
  getAll: () => api.get('/reminders'),
  create: (type, date) => api.post('/reminders', { type, date }),
  update: (id, data) => api.put(`/reminders/${id}`, data),
  delete: (type) => api.delete(`/reminders/${type}`), // delete by type (e.g., 'rent')
};
export default api;