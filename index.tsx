
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

// Load JSZip from CDN dynamically if needed, or assume it's bundled.
// For simplicity in this environment, we add it to index.html or rely on a global.
// Here we'll manually append the script to ensure jszip is available.
const script = document.createElement('script');
script.src = "https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js";
document.head.appendChild(script);

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
