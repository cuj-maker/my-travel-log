import React from 'react';
import ReactDOM from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import App from './App';
import { seedSampleData } from './db/seed';
import './index.css';

// First launch only: load clearly-labelled DEMO trips so every screen can be shown.
seedSampleData();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </React.StrictMode>,
);
