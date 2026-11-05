import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'
import { captureInviteFromUrl } from './lib/invite.js'

// Remember a freelancer invite (?pay=G...) before any sign-in redirect drops the query string.
captureInviteFromUrl()

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
