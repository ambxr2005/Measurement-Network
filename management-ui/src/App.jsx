import React, { useState, useEffect } from 'react'
import axios from 'axios'
import './App.css'

// Production URLs use karo
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'https://management-api.up.railway.app';
const WS_URL = import.meta.env.VITE_WS_URL || 'wss://management-api.up.railway.app';

function App() {
  const [jobs, setJobs] = useState([])
  const [modules, setModules] = useState([])
  const [newJob, setNewJob] = useState({ type: 'ping', target: '' })
  const [darkMode, setDarkMode] = useState(true)
  const [isLoading, setIsLoading] = useState(true)
  const [storageStats, setStorageStats] = useState(null)
  const [activeTab, setActiveTab] = useState('live')

  useEffect(() => {
    // Load theme from localStorage
    const savedTheme = localStorage.getItem('theme')
    if (savedTheme) {
      setDarkMode(savedTheme === 'dark')
    }
    
    loadStorageStats()
    
    if (activeTab === 'history') {
      loadHistoricalData()
    } else {
      loadInitialData()
      setupWebSocket()
    }
  }, [activeTab])

  // Update theme in localStorage and apply to body
  useEffect(() => {
    localStorage.setItem('theme', darkMode ? 'dark' : 'light')
    document.body.setAttribute('data-theme', darkMode ? 'dark' : 'light')
  }, [darkMode])

  const toggleTheme = () => {
    setDarkMode(!darkMode)
  }

  const loadInitialData = async () => {
    try {
      const [jobsRes, modulesRes] = await Promise.all([
        axios.get(`${API_BASE_URL}/api/jobs`),
        axios.get(`${API_BASE_URL}/api/modules`)
      ])
      setJobs(jobsRes.data)
      setModules(modulesRes.data)
    } catch (error) {
      console.error('Failed to load data:', error)
      // Fallback data for demo
      setModules([
        { name: 'ping-module', healthy: true, type: 'ping' },
        { name: 'dns-module', healthy: true, type: 'dns' },
        { name: 'http-module', healthy: false, type: 'http' }
      ])
    } finally {
      setIsLoading(false)
    }
  }

  const loadHistoricalData = async () => {
    try {
      setIsLoading(true)
      const response = await axios.get('http://localhost:3001/api/measurements?limit=100')
      setJobs(response.data)
    } catch (error) {
      console.error('Failed to load historical data:', error)
      alert('Failed to load historical data')
    } finally {
      setIsLoading(false)
    }
  }

  const loadStorageStats = async () => {
    try {
      const response = await axios.get('http://localhost:3001/api/storage/stats')
      setStorageStats(response.data)
    } catch (error) {
      console.error('Failed to load storage stats:', error)
    }
  }

  const exportMeasurements = async () => {
    try {
      const response = await axios.post('http://localhost:3001/api/storage/export')
      if (response.data.success) {
        alert(`Export created: ${response.data.filename}`)
        // Auto-download the file
        window.open(`http://localhost:3001/api/storage/download/${response.data.filename}`, '_blank')
      }
    } catch (error) {
      console.error('Export failed:', error)
      alert('Export failed: ' + error.message)
    }
  }

  const setupWebSocket = () => {
    const ws = new WebSocket('ws://localhost:8081')
    
    ws.onmessage = (event) => {
      const data = JSON.parse(event.data)
      
      if (data.type === 'job_result') {
        setJobs(prev => {
          const updated = prev.map(job => 
            job.id === data.data.jobId ? { ...job, ...data.data } : job
          )
          return updated
        })
      }
      
      if (data.type === 'initial_results') {
        setJobs(prev => [...data.data, ...prev])
      }
    }

    ws.onopen = () => {
      console.log('✅ WebSocket connected')
    }

    ws.onclose = () => {
      console.log('🔌 WebSocket disconnected - reconnecting...')
      setTimeout(setupWebSocket, 3000)
    }
    
    ws.onerror = (error) => {
      console.error('❌ WebSocket error:', error)
    }
  }

  const submitJob = async (e) => {
    e.preventDefault()
    if (!newJob.target) {
      alert('Please enter a target')
      return
    }

    try {
      const response = await axios.post('http://localhost:3001/api/jobs', newJob)
      setNewJob({ type: 'ping', target: '' })
      
      // Add to local state immediately
      const job = {
        id: response.data.jobId,
        ...newJob,
        timestamp: Date.now(),
        status: 'submitted'
      }
      setJobs(prev => [job, ...prev])
    } catch (error) {
      console.error('Job submission failed:', error)
      alert('Failed to submit job - check if Management API is running')
    }
  }

  const getStatusColor = (status) => {
    switch (status) {
      case 'completed': return 'var(--success-color)'
      case 'failed': return 'var(--error-color)'
      case 'running': return 'var(--warning-color)'
      default: return 'var(--text-muted)'
    }
  }

  const getStatusIcon = (status) => {
    switch (status) {
      case 'completed': return '✅'
      case 'failed': return '❌'
      case 'running': return '⏳'
      default: return '📝'
    }
  }

  const refreshData = () => {
    if (activeTab === 'history') {
      loadHistoricalData()
    } else {
      loadInitialData()
    }
    loadStorageStats()
  }

  return (
    <div className={`app ${darkMode ? 'dark-theme' : 'light-theme'}`}>
      <header className="header">
        <div className="header-content">
          <div className="header-left">
            <h1>🌐 Measurement Network</h1>
            <p>Modular Internet Measurement Dashboard</p>
          </div>
          
          <div className="header-right">
            {/* Theme Toggle Switch */}
            <div className="theme-toggle">
              <span className="theme-icon">🌙</span>
              <label className="toggle-switch">
                <input 
                  type="checkbox" 
                  checked={!darkMode}
                  onChange={toggleTheme}
                />
                <span className="toggle-slider"></span>
              </label>
              <span className="theme-icon">☀️</span>
            </div>
            
            <div className="theme-indicator">
              {darkMode ? 'Dark Mode' : 'Light Mode'}
            </div>
          </div>
        </div>
      </header>

      <div className="container">
        {/* Sidebar */}
        <div className="sidebar">
          <div className="module-list">
            <h3>🛠️ Active Modules</h3>
            {isLoading ? (
              <div className="loading">Loading modules...</div>
            ) : (
              modules.map(module => (
                <div key={module.name} className="module-item">
                  <div className={`status-indicator ${module.healthy ? 'healthy' : 'unhealthy'}`} />
                  <span className="module-name">{module.name}</span>
                  <span className="module-type">{module.type}</span>
                </div>
              ))
            )}
          </div>

          <div className="stats">
            <h3>📊 Statistics</h3>
            <div className="stat-item">
              <span>Total Jobs:</span>
              <span className="stat-value">{jobs.length}</span>
            </div>
            <div className="stat-item">
              <span>Active Modules:</span>
              <span className="stat-value">
                {modules.filter(m => m.healthy).length}/{modules.length}
              </span>
            </div>
            {storageStats && (
              <>
                <div className="stat-item">
                  <span>Stored Records:</span>
                  <span className="stat-value">{storageStats.total}</span>
                </div>
                <div className="stat-item">
                  <span>Success Rate:</span>
                  <span className="stat-value">{storageStats.successRate}%</span>
                </div>
              </>
            )}
          </div>
          
          <div className="demo-tips">
            <h3>💡 Demo Tips</h3>
            <div className="tip-item">
              <strong>Hot Plug:</strong> Restart any module
            </div>
            <div className="tip-item">
              <strong>Fault Isolation:</strong> Stop DNS module
            </div>
            <div className="tip-item">
              <strong>Data Export:</strong> Download JSON data
            </div>
          </div>

          {/* ✅ NEW: Storage Controls */}
          <div className="storage-controls">
            <h3>💾 Storage</h3>
            <button 
              onClick={exportMeasurements}
              className="storage-btn export-btn"
            >
              📥 Export JSON
            </button>
            <button 
              onClick={refreshData}
              className="storage-btn refresh-btn"
            >
              🔄 Refresh All
            </button>
          </div>
        </div>

        {/* Main Content */}
        <div className="main-content">
          {/* Tab Navigation */}
          <div className="tab-navigation">
            <button 
              className={`tab-btn ${activeTab === 'live' ? 'active' : ''}`}
              onClick={() => setActiveTab('live')}
            >
              🔴 Live Results
            </button>
            <button 
              className={`tab-btn ${activeTab === 'history' ? 'active' : ''}`}
              onClick={() => setActiveTab('history')}
            >
              📚 History ({storageStats ? storageStats.total : '0'})
            </button>
          </div>

          {/* Job Form - Only show in Live tab */}
          {activeTab === 'live' && (
            <div className="job-form-container">
              <h2>🎯 Submit Measurement Job</h2>
              <form onSubmit={submitJob} className="job-form">
                <select 
                  value={newJob.type} 
                  onChange={(e) => setNewJob({...newJob, type: e.target.value})}
                  className="job-select"
                >
                  <option value="ping">🏓 Ping Test</option>
                  <option value="dns">🔍 DNS Lookup</option>
                  <option value="http">🌐 HTTP Probe</option>
                </select>
                
                <input
                  type="text"
                  placeholder="Enter target (e.g., 8.8.8.8, google.com, https://example.com)"
                  value={newJob.target}
                  onChange={(e) => setNewJob({...newJob, target: e.target.value})}
                  className="job-input"
                />
                
                <button type="submit" className="submit-btn">
                  🚀 Run Measurement
                </button>
              </form>
              
              <div className="form-examples">
                <p><strong>Examples:</strong></p>
                <div className="example-buttons">
                  <button 
                    onClick={() => setNewJob({type: 'ping', target: '8.8.8.8'})}
                    className="example-btn"
                  >
                    Ping Google DNS
                  </button>
                  <button 
                    onClick={() => setNewJob({type: 'dns', target: 'google.com'})}
                    className="example-btn"
                  >
                    DNS Lookup Google
                  </button>
                  <button 
                    onClick={() => setNewJob({type: 'http', target: 'https://httpbin.org/json'})}
                    className="example-btn"
                  >
                    HTTP Test
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Results */}
          <div className="results-container">
            <div className="results-header">
              <h2>
                {activeTab === 'live' ? '📋 Live Results' : '📚 Historical Data'}
                {storageStats && activeTab === 'history' && (
                  <span className="record-count"> ({storageStats.total} records)</span>
                )}
              </h2>
              
              <div className="results-actions">
                <button 
                  onClick={refreshData} 
                  className="refresh-btn"
                  disabled={isLoading}
                >
                  {isLoading ? '🔄 Loading...' : 'Show Result'}
                </button>
              </div>
            </div>
            
            {jobs.length === 0 ? (
              <div className="empty-state">
                <div className="empty-icon">
                  {activeTab === 'live' ? '📊' : '📁'}
                </div>
                <h3>
                  {activeTab === 'live' ? 'No results yet' : 'No historical data'}
                </h3>
                <p>
                  {activeTab === 'live' 
                    ? 'Submit a measurement job to see results here!' 
                    : 'Run some measurements to build up historical data!'}
                </p>
              </div>
            ) : (
              <div className="results-list">
                {jobs.slice(0, 25).map(job => (
                  <div key={job.id} className="result-item">
                    <div className="result-header">
                      <span className="job-type-badge job-type">{job.type}</span>
                      <span className="job-target">{job.target}</span>
                      <span 
                        className="job-status"
                        style={{ color: getStatusColor(job.status) }}
                      >
                        {getStatusIcon(job.status)} {job.status}
                      </span>
                    </div>
                    
                    {job.result && (
                      <div className="result-details">
                        <div className="result-summary">
                          {job.result.message || 'Measurement completed'}
                          {job._persisted && (
                            <span className="persisted-badge"> 💾 SAVED</span>
                          )}
                        </div>
                        <pre className="result-json">
                          {JSON.stringify(job.result, null, 2)}
                        </pre>
                      </div>
                    )}
                    
                    <div className="job-meta">
                      <span className="job-id">ID: {job.id?.slice(0, 8)}...</span>
                      <span className="job-time">
                        {new Date(job.timestamp).toLocaleString()}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default App