import React, { useState, useEffect } from 'react';
import { socket } from './services/socket';
import { Edit2, RefreshCw, CheckCircle2, AlertCircle, X } from 'lucide-react';
import './App.css';

const API_BASE_URL = import.meta.env.VITE_SOCKET_URL || '';

export default function App() {
  const [rows, setRows] = useState([]);
  const [isConnected, setIsConnected] = useState(socket.connected);
  const [lastSyncTime, setLastSyncTime] = useState(null);
  const [syncSource, setSyncSource] = useState('Initialized');
  const [flashingRowId, setFlashingRowId] = useState(null);
  
  // Modal Edit State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingRow, setEditingRow] = useState(null);
  const [formValues, setFormValues] = useState({ columnA: '', columnB: '', columnC: '' });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    // Initial fetch fallback over HTTP
    fetch(`${API_BASE_URL}/api/data`)
      .then((res) => res.json())
      .then((data) => {
        if (data.rows) setRows(data.rows);
      })
      .catch((err) => console.log('HTTP fetch fallback:', err.message));

    // Socket.io event handlers
    function onConnect() {
      setIsConnected(true);
    }

    function onDisconnect() {
      setIsConnected(false);
    }

    function onInitialData(data) {
      if (data.rows) setRows(data.rows);
      setLastSyncTime(new Date().toLocaleTimeString());
      setSyncSource('Socket Connected');
    }

    function onSheetUpdated(data) {
      if (data.rows) {
        setRows(data.rows);
        setLastSyncTime(new Date().toLocaleTimeString());
        setSyncSource(data.source === 'google_sheet' ? 'Google Sheet Edit' : 'Web Edit');
        
        // Trigger temporary row flash animation
        setFlashingRowId('all');
        setTimeout(() => setFlashingRowId(null), 1500);
      }
    }

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('initial_data', onInitialData);
    socket.on('sheet_updated', onSheetUpdated);

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('initial_data', onInitialData);
      socket.off('sheet_updated', onSheetUpdated);
    };
  }, []);

  const handleEditClick = (row) => {
    setEditingRow(row);
    setFormValues({
      columnA: row.columnA || '',
      columnB: row.columnB || '',
      columnC: row.columnC || ''
    });
    setErrorMessage('');
    setIsModalOpen(true);
  };

  const handleFormSubmit = async (e) => {
    e.preventDefault();
    if (!editingRow) return;

    setIsSubmitting(true);
    setErrorMessage('');

    try {
      const response = await fetch(`${API_BASE_URL}/api/rows/${editingRow.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formValues)
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to submit changes');
      }

      const result = await response.json();
      if (result.rows) {
        setRows(result.rows);
      }

      setIsModalOpen(false);
    } catch (err) {
      console.error('Submit error:', err);
      setErrorMessage(err.message || 'Error saving changes to Google Sheet');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="app-container">
      {/* Header & Status Card */}
      <div className="header-card">
        <div className="header-top">
          <div className="brand-title">
            <div className="brand-icon">⚡</div>
            <div>
              <h1>Google Sheets Live Sync</h1>
              <p style={{ fontSize: '0.85rem', color: '#94a3b8' }}>Real-time 2-Way Synchronization</p>
            </div>
          </div>
          
          <div className={`status-badge ${isConnected ? 'connected' : 'disconnected'}`}>
            <span className="pulse-dot"></span>
            {isConnected ? 'Real-Time Sync Active' : 'Connecting to Gateway...'}
          </div>
        </div>

        <div className="header-meta">
          <div>
            <span>Last Sync: </span>
            <strong style={{ color: '#fff' }}>{lastSyncTime || 'Just now'}</strong>
          </div>
          <div>
            <span>Sync Engine: </span>
            <strong style={{ color: '#06b6d4' }}>{syncSource}</strong>
          </div>
        </div>
      </div>

      {/* Main Data Table */}
      <div className="table-card">
        <table className="data-table">
          <thead>
            <tr>
              <th style={{ width: '80px' }}>Row #</th>
              <th>Name (Col A)</th>
              <th>Age (Col B)</th>
              <th>City (Col C)</th>
              <th style={{ width: '120px', textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.length > 0 ? (
              rows.map((row) => (
                <tr
                  key={row.id}
                  className={flashingRowId ? 'row-flash' : ''}
                >
                  <td style={{ fontWeight: '600', color: '#64748b' }}>#{row.id}</td>
                  <td style={{ color: '#f8fafc', fontWeight: '500' }}>{row.columnA}</td>
                  <td>{row.columnB}</td>
                  <td>
                    <span style={{
                      display: 'inline-block',
                      padding: '0.25rem 0.6rem',
                      borderRadius: '6px',
                      fontSize: '0.8rem',
                      fontWeight: '500',
                      background: 'rgba(255,255,255,0.05)',
                      border: '1px solid rgba(255,255,255,0.1)'
                    }}>
                      {row.columnC}
                    </span>
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <button
                      className="edit-btn"
                      onClick={() => handleEditClick(row)}
                    >
                      <Edit2 size={14} /> Edit
                    </button>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan="5" style={{ textAlign: 'center', padding: '3rem', color: '#64748b' }}>
                  Loading table data...
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Edit Modal Dialog */}
      {isModalOpen && (
        <div className="modal-overlay">
          <div className="modal-card">
            <div className="modal-header">
              <h3>Edit Row #{editingRow?.id}</h3>
              <button className="close-btn" onClick={() => setIsModalOpen(false)}>
                <X size={18} />
              </button>
            </div>

            {errorMessage && (
              <div style={{
                background: 'rgba(239, 68, 68, 0.15)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                color: '#f87171',
                padding: '0.75rem',
                borderRadius: '8px',
                fontSize: '0.85rem',
                marginBottom: '1rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem'
              }}>
                <AlertCircle size={16} /> {errorMessage}
              </div>
            )}

            <form onSubmit={handleFormSubmit}>
              <div className="form-group">
                <label>Name (Column A)</label>
                <input
                  type="text"
                  className="form-input"
                  value={formValues.columnA}
                  onChange={(e) => setFormValues({ ...formValues, columnA: e.target.value })}
                  required
                />
              </div>

              <div className="form-group">
                <label>Age (Column B)</label>
                <input
                  type="text"
                  className="form-input"
                  value={formValues.columnB}
                  onChange={(e) => setFormValues({ ...formValues, columnB: e.target.value })}
                  required
                />
              </div>

              <div className="form-group">
                <label>City (Column C)</label>
                <input
                  type="text"
                  className="form-input"
                  value={formValues.columnC}
                  onChange={(e) => setFormValues({ ...formValues, columnC: e.target.value })}
                  required
                />
              </div>

              <div className="modal-actions">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setIsModalOpen(false)}
                  disabled={isSubmitting}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? (
                    <>
                      <RefreshCw size={16} className="spin" /> Syncing...
                    </>
                  ) : (
                    <>
                      <CheckCircle2 size={16} /> Save & Sync
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
