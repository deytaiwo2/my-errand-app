import { BrowserRouter } from 'react-router-dom';
import React, { useState, useEffect, Suspense } from 'react'
import { Routes, Route, Link, useLocation } from 'react-router-dom'
import axios from 'axios'
import ProtectedRoute from './components/ProtectedRoute'
import LanguageSwitcher from './components/LanguageSwitcher'
import { TranslationProvider } from './contexts/TranslationContext'
import './App.css'

// Lazy load components
const Home = React.lazy(() => import('./pages/Home'))
const PayNow = React.lazy(() => import('./pages/PayNow'))
const ErrandList = React.lazy(() => import('./pages/ErrandList'))
const Profile = React.lazy(() => import('./pages/Profile'))
const Login = React.lazy(() => import('./pages/Login'))
const Register = React.lazy(() => import('./pages/Register'))
const RegisterClient = React.lazy(() => import('./pages/RegisterClient'))
const RegisterRunner = React.lazy(() => import('./pages/RegisterRunner'))
const UserTypeSelection = React.lazy(() => import('./pages/UserTypeSelection'))
const ClientDashboard = React.lazy(() => import('./pages/ClientDashboard'))
const RunnerDashboard = React.lazy(() => import('./pages/RunnerDashboard'))

function App() {
  const [user, setUser] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [userBalances, setUserBalances] = useState({ spendable: 0, withdrawable: 0, escrow: 0, total: 0 })   ///find ou how to get the information from the backend instead.
  const [errands, setErrands] = useState([
    { id: 1, title: 'Grocery Shopping', description: 'Buy weekly groceries', status: 'pending', amount: 25.00 },
    { id: 2, title: 'Package Delivery', description: 'Deliver package to downtown', status: 'in-progress', amount: 15.00 },
    { id: 3, title: 'Pet Walking', description: 'Walk neighbor\'s dog', status: 'completed', amount: 20.00 }   //find out why this explicit commmand is not changing since it is using useState, how can you get the information for the "title", "description", "amount" to be picked up feom the users information at backend.
  ])
  const location = useLocation()
  const isAuthenticated = !!user

  // Fetch user balance
  const fetchUserBalance = async () => {
    if (!user) return
    try {
      const token = localStorage.getItem('token')
      const response = await axios.get('/api/wallet/balance-summary', {
        headers: { Authorization: `Bearer ${token}` }
      })
      if (response.data.success) {
        setUserBalances(response.data.balances)
      }
    } catch (error) {
      console.error('Error fetching user balance:', error)
    }
  }

  // Check for existing authentication on app load
  useEffect(() => {
    const token = localStorage.getItem('token')
    const savedUser = localStorage.getItem('user')

    if (token) {
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`
    }

    if (token && savedUser) {
      try {
        const userData = JSON.parse(savedUser)
        setUser(userData)
      } catch (error) {
        console.error('Error parsing saved user data:', error)
        localStorage.removeItem('token')
        localStorage.removeItem('user')
        delete axios.defaults.headers.common['Authorization']
      }
    }
    setIsLoading(false)
  }, [])

  // Fetch balance when user is set
  useEffect(() => {
    if (user) {
      fetchUserBalance()
      // Set up periodic balance refresh
      const interval = setInterval(fetchUserBalance, 10000) // Refresh every 10 seconds
      return () => clearInterval(interval)
    }
  }, [user])

  const addErrand = (newErrand) => {
    const errand = {
      id: Date.now(),
      ...newErrand,
      status: 'pending'
    }
    setErrands(prev => [...prev, errand])
  }

  const updateErrandStatus = (id, status) => {
    setErrands(prev => prev.map(errand =>
      errand.id === id ? { ...errand, status } : errand
    ))
  }

  const handleLogout = () => {
    localStorage.removeItem('token')
    localStorage.removeItem('user')
    delete axios.defaults.headers.common['Authorization']
    setUser(null)
  }

  const getPageTitle = () => {
    switch (location.pathname) {
      case '/': return 'Dashboard'
      case '/errands': return 'My Errands'
      case '/pay': return 'Payment'
      case '/profile': return 'Profile'
      case '/login': return 'Sign In'
      case '/register': return 'Sign Up'
      default: return 'My Errand App'
    }
  }

  if (isLoading) {
    return (
      <div className="app loading">
        <div className="loading-container">
          <h2>🏃‍♂️ My Errand App</h2>
          <p>Loading...</p>
        </div>
      </div>
    )
  }

  return (
    <TranslationProvider>
      <div className="app">
        {/* Only show header and footer for authenticated users */}
        {isAuthenticated && (
          <header className="app-header">
            <div className="header-content">
              <div className="logo">
                <h1>🏃‍♂️ My Errand App</h1>
              </div>
              <nav className="main-nav">
                <ul>
                  <li><Link to="/" className={location.pathname === '/' ? 'active' : ''}>Home</Link></li>
                  <li><Link to="/errands" className={location.pathname === '/errands' ? 'active' : ''}>Errands</Link></li>
                  <li><Link to="/pay" className={location.pathname === '/pay' ? 'active' : ''}>Pay Now</Link></li>
                  <li><Link to="/profile" className={location.pathname === '/profile' ? 'active' : ''}>Profile</Link></li>
                </ul>
              </nav>
              <div className="user-info">
                <div className="balance-info">
                  <span className="balance-item">💰 Spendable: ${userBalances.spendable.toFixed(2)}</span>
                  <span className="balance-item">💳 Withdrawable: ${userBalances.withdrawable.toFixed(2)}</span>
                  <span className="balance-item">🔒 Escrow: ${userBalances.escrow?.toFixed(2) || '0.00'}</span>
                </div>
                <span className="username">👤 {user?.name || 'User'}</span>
                <button onClick={handleLogout} className="logout-btn">🚪 Logout</button>
                <LanguageSwitcher />
              </div>
            </div>
          </header>
        )}

        <main className="main-content">
          {isAuthenticated && (
            <div className="page-header">
              <h2>{getPageTitle()}</h2>
            </div>
          )}

          <div className={isAuthenticated ? "container" : ""}>
            <Suspense fallback={
              <div className="loading-container">
                <h2>🏃‍♂️ Loading...</h2>
                <p>Please wait while we load the page</p>
              </div>
            }>
              <Routes>
                {/* Public routes */}
                <Route path="/login" element={<Login onLogin={setUser} />} />
                <Route path="/register" element={<UserTypeSelection />} />
                <Route path="/register/client" element={<RegisterClient />} />
                <Route path="/register/runner" element={<RegisterRunner />} />

                {/* Protected routes */}
                <Route path="/" element={
                  <ProtectedRoute isAuthenticated={isAuthenticated}>
                    {user?.userType === 'client' ? (
                      <ClientDashboard
                        errands={errands}
                        user={user}
                        balances={userBalances}
                        onAddErrand={addErrand}
                        onUpdateStatus={updateErrandStatus}
                      />
                    ) : user?.userType === 'runner' ? (
                      <RunnerDashboard
                        errands={errands}
                        user={user}
                        onAddErrand={addErrand}
                        onUpdateStatus={updateErrandStatus}
                      />
                    ) : (
                      <Home
                        errands={errands}
                        user={user}
                        onAddErrand={addErrand}
                        onUpdateStatus={updateErrandStatus}
                      />
                    )}
                  </ProtectedRoute>
                } />
                <Route path="/errands" element={
                  <ProtectedRoute isAuthenticated={isAuthenticated}>
                    <ErrandList
                      errands={errands}
                      onAddErrand={addErrand}
                      onUpdateStatus={updateErrandStatus}
                    />
                  </ProtectedRoute>
                } />
                <Route path="/pay" element={
                  <ProtectedRoute isAuthenticated={isAuthenticated}>
                    <PayNow user={user} setUser={setUser} />
                  </ProtectedRoute>
                } />
                <Route path="/profile" element={
                  <ProtectedRoute isAuthenticated={isAuthenticated}>
                    <Profile user={user} setUser={setUser} />
                  </ProtectedRoute>
                } />
              </Routes>
            </Suspense>
          </div>
        </main>

        {isAuthenticated && (
          <footer className="app-footer">
            <p>&copy; 2025 My Errand App. All rights reserved. | Built with React & Node.js</p>
          </footer>
        )}
      </div>
    </TranslationProvider>
  )
}

export default App
