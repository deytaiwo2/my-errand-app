import React from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter as Router } from 'react-router-dom'
import App from './App'
import './index.css'
import './i18n' // Initialize i18n

console.log('🚀 main.jsx is loading...')

// Wait for DOM to be ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeApp)
} else {
  initializeApp()
}

function initializeApp() {
  console.log('📦 DOM is ready, initializing app...')
  
  const rootElement = document.getElementById('root')
  console.log('🔍 Root element:', rootElement)
  
  if (rootElement) {
    console.log('✅ Creating React root...')
    const root = createRoot(rootElement)
    
    root.render(
      <React.StrictMode>
        <Router>
          <App />
        </Router>
      </React.StrictMode>
    )
    
    console.log('🎉 React app rendered successfully!')
  } else {
    console.error('❌ Root element not found!')
    document.body.innerHTML = '<h1 style="color: red; text-align: center; margin-top: 50px;">Error: Root element not found!</h1>'
  }
}
