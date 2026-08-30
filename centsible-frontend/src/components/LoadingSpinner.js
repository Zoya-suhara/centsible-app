// centsible-frontend/src/components/LoadingSpinner.js
import React from 'react';
import './LoadingSpinner.css';

const LoadingSpinner = ({ 
  size = 'medium', 
  message = null, 
  fullScreen = false,
  overlay = false 
}) => {
  const spinner = (
    <div className={`spinner-container spinner-${size}`}>
      <div className="spinner">
        <div className="spinner-circle"></div>
        <div className="spinner-circle-delayed"></div>
      </div>
      {message && <p className="spinner-message">{message}</p>}
    </div>
  );

  if (fullScreen) {
    return (
      <div className="spinner-fullscreen">
        {spinner}
      </div>
    );
  }

  if (overlay) {
    return (
      <div className="spinner-overlay">
        {spinner}
      </div>
    );
  }

  return spinner;
};

// Size variants: small, medium, large
// Usage examples:
// <LoadingSpinner />
// <LoadingSpinner size="large" message="Loading transactions..." />
// <LoadingSpinner fullScreen message="Please wait..." />
// <LoadingSpinner overlay size="small" />

export default LoadingSpinner;