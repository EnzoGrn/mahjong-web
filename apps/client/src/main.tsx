import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.tsx';
import { connect } from './lib/store.ts';
import './styles.css';

connect();
createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
