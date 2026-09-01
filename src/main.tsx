import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import { GoogleOAuthProvider } from '@react-oauth/google';
import App from './App.tsx';
import './index.css';
import firebaseConfig from '../firebase-applet-config.json';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <GoogleOAuthProvider clientId={firebaseConfig.oAuthClientId}>
      <App />
    </GoogleOAuthProvider>
  </StrictMode>,
);
