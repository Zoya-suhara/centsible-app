// centsible-frontend/src/components/ToastNotifications.js
import React, { useState, useEffect, useCallback } from 'react';
import './ToastNotifications.css';

// Toast types
export const TOAST_TYPES = {
  SUCCESS: 'success',
  ERROR: 'error',
  INFO: 'info',
  WARNING: 'warning'
};

// Toast container component
export const ToastContainer = ({ position = 'top-right' }) => {
  const [toasts, setToasts] = useState([]);

  // Add toast function
  const addToast = useCallback((message, type = TOAST_TYPES.INFO, duration = 3000) => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, message, type, duration }]);
    
    // Auto remove after duration
    setTimeout(() => {
      setToasts(prev => prev.filter(toast => toast.id !== id));
    }, duration);
    
    return id;
  }, []);

  // Remove toast manually
  const removeToast = useCallback((id) => {
    setToasts(prev => prev.filter(toast => toast.id !== id));
  }, []);

  // Make addToast available globally
  useEffect(() => {
    window.toast = { 
      success: (msg, duration) => addToast(msg, TOAST_TYPES.SUCCESS, duration),
      error: (msg, duration) => addToast(msg, TOAST_TYPES.ERROR, duration),
      info: (msg, duration) => addToast(msg, TOAST_TYPES.INFO, duration),
      warning: (msg, duration) => addToast(msg, TOAST_TYPES.WARNING, duration)
    };
    
    return () => {
      delete window.toast;
    };
  }, [addToast]);

  return (
    <div className={`toast-container toast-container-${position}`}>
      {toasts.map(toast => (
        <ToastMessage
          key={toast.id}
          message={toast.message}
          type={toast.type}
          onClose={() => removeToast(toast.id)}
        />
      ))}
    </div>
  );
};

// Individual toast message component
const ToastMessage = ({ message, type, onClose }) => {
  const [isExiting, setIsExiting] = useState(false);

  const handleClose = () => {
    setIsExiting(true);
    setTimeout(onClose, 300);
  };

  // Icons for different toast types
  const getIcon = () => {
    switch (type) {
      case TOAST_TYPES.SUCCESS:
        return (
          <svg className="toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        );
      case TOAST_TYPES.ERROR:
        return (
          <svg className="toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        );
      case TOAST_TYPES.WARNING:
        return (
          <svg className="toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        );
      default:
        return (
          <svg className="toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        );
    }
  };

  return (
    <div className={`toast-message toast-${type} ${isExiting ? 'toast-exit' : 'toast-enter'}`}>
      <div className="toast-content">
        <div className="toast-icon-wrapper">
          {getIcon()}
        </div>
        <div className="toast-text">
          <p>{message}</p>
        </div>
        <button className="toast-close" onClick={handleClose} aria-label="Close notification">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
      <div className="toast-progress-bar">
        <div className="toast-progress-fill" style={{ animationDuration: '3000ms' }} />
      </div>
    </div>
  );
};

// Hook for using toasts in components
export const useToast = () => {
  const addToast = (message, type = TOAST_TYPES.INFO, duration = 3000) => {
    if (window.toast) {
      switch (type) {
        case TOAST_TYPES.SUCCESS:
          window.toast.success(message, duration);
          break;
        case TOAST_TYPES.ERROR:
          window.toast.error(message, duration);
          break;
        case TOAST_TYPES.WARNING:
          window.toast.warning(message, duration);
          break;
        default:
          window.toast.info(message, duration);
      }
    } else {
      console.warn('ToastContainer not mounted yet');
    }
  };

  return { addToast };
};

export default ToastContainer;