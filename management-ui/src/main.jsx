import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'

// Set initial theme before React loads to prevent flash
const savedTheme = localStorage.getItem('theme') || 'dark';
document.body.setAttribute('data-theme', savedTheme);

// Add loading class for initial render
document.body.classList.add('theme-loading');

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)

// Remove loading class after render
setTimeout(() => {
  document.body.classList.remove('theme-loading');
}, 100);