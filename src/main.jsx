import React from 'react'
import ReactDOM from 'react-dom/client'
import App from '@/App.jsx'
import '@/index.css'
import { applyPreferences } from '@/lib/theme'

applyPreferences()

ReactDOM.createRoot(document.getElementById('root')).render(
  <App />
)