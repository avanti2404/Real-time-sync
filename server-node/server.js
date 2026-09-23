import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const httpServer = createServer(app);

const PORT = process.env.PORT || 5000;
const PYTHON_SERVICE_URL = process.env.PYTHON_SERVICE_URL || 'http://127.0.0.1:8000';

app.use(cors());
app.use(express.json());

// Initialize Socket.io with permissive CORS for development & deployment
const io = new Server(httpServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE']
  }
});

// Cache in memory for instant delivery to newly connected clients
let latestSheetData = [
  { id: 1, columnA: 'Avanti', columnB: '23', columnC: 'Mumbai' },
  { id: 2, columnA: 'Tanvii', columnB: '21', columnC: 'Pune' },
  { id: 3, columnA: 'Nishta', columnB: '10', columnC: 'Nashik' }
];

let lastUpdatedByOrigin = null; // Track source to prevent infinite echo loops
let lastUpdatedTimestamp = Date.now();

// Socket.io Connection Handler
io.on('connection', (socket) => {
  console.log(`[Socket.io] Client connected: ${socket.id}`);
  
  // Send current cached data immediately upon connection
  socket.emit('initial_data', {
    rows: latestSheetData,
    timestamp: lastUpdatedTimestamp
  });

  socket.on('disconnect', () => {
    console.log(`[Socket.io] Client disconnected: ${socket.id}`);
  });
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    message: '🚀 Node.js Socket.io Gateway Server is Running!',
    endpoints: {
      health: '/api/health',
      data: '/api/data',
      webhook: '/api/sheet-webhook'
    }
  });
});

// Health check endpoint (used by uptime pingers to prevent cold starts)
app.get('/api/health', (req, res) => {
  res.json({
    status: 'online',
    timestamp: new Date().toISOString(),
    clientsConnected: io.sockets.sockets.size
  });
});

// GET current sheet data
app.get('/api/data', async (req, res) => {
  try {
    // Attempt to fetch fresh data from Python Sheets service
    const response = await fetch(`${PYTHON_SERVICE_URL}/api/data`);
    if (response.ok) {
      const data = await response.json();
      if (Array.isArray(data.rows) && data.rows.length > 0) {
        latestSheetData = data.rows;
      }
    }
  } catch (error) {
    console.warn('[Server Node] Could not fetch from Python service, using cached state:', error.message);
  }
  res.json({ rows: latestSheetData, timestamp: lastUpdatedTimestamp });
});

// Webhook endpoint invoked by Google Apps Script on manual Sheet edit
app.post('/api/sheet-webhook', async (req, res) => {
  console.log('[Webhook] Received Google Apps Script notification:', req.body);
  
  try {
    let newRows = null;
    
    // If Apps Script sent row data directly in payload
    if (req.body && Array.isArray(req.body.rows) && req.body.rows.length > 0) {
      newRows = req.body.rows;
    } else {
      // Otherwise fetch latest data from Python service
      const pyRes = await fetch(`${PYTHON_SERVICE_URL}/api/data`);
      if (pyRes.ok) {
        const pyData = await pyRes.json();
        newRows = pyData.rows;
      }
    }

    if (newRows) {
      latestSheetData = newRows;
      lastUpdatedTimestamp = Date.now();
      lastUpdatedByOrigin = 'sheet_webhook';

      // Broadcast update to all connected React web clients
      io.emit('sheet_updated', {
        rows: latestSheetData,
        source: 'google_sheet',
        timestamp: lastUpdatedTimestamp
      });
      
      console.log('[Webhook] Broadcasted updated sheet data to all Socket.io clients');
    }

    res.json({ success: true, message: 'Webhook processed successfully' });
  } catch (err) {
    console.error('[Webhook] Error processing webhook:', err.message);
    res.status(500).json({ error: 'Failed to process webhook update' });
  }
});

// Endpoint invoked by Python Sync Service when Python background poller detects a change
app.post('/api/python-notify', (req, res) => {
  const { rows, source } = req.body;
  if (Array.isArray(rows)) {
    latestSheetData = rows;
    lastUpdatedTimestamp = Date.now();
    lastUpdatedByOrigin = source || 'python_poller';

    io.emit('sheet_updated', {
      rows: latestSheetData,
      source: lastUpdatedByOrigin,
      timestamp: lastUpdatedTimestamp
    });

    console.log(`[Python Notify] Broadcasted sheet update from ${lastUpdatedByOrigin}`);
  }
  res.json({ success: true });
});

// Web UI Edit Submit endpoint (React -> Node -> Python -> Google Sheet)
app.put('/api/rows/:rowIndex', async (req, res) => {
  const rowIndex = parseInt(req.params.rowIndex, 10);
  const updatedRow = req.body; // { columnA, columnB, columnC }

  console.log(`[Web Edit] User updating row ${rowIndex}:`, updatedRow);

  try {
    // 1. Forward write to Python Google Sheets Service
    const pyRes = await fetch(`${PYTHON_SERVICE_URL}/api/rows/${rowIndex}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updatedRow)
    });

    if (!pyRes.ok) {
      const errData = await pyRes.json();
      throw new Error(errData.detail || 'Python backend write failed');
    }

    const result = await pyRes.json();
    latestSheetData = result.rows;
    lastUpdatedTimestamp = Date.now();
    lastUpdatedByOrigin = 'web_client';

    // 2. Immediately broadcast update to all connected web clients via WebSockets
    io.emit('sheet_updated', {
      rows: latestSheetData,
      source: 'web_client',
      timestamp: lastUpdatedTimestamp
    });

    res.json({ success: true, rows: latestSheetData });
  } catch (error) {
    console.error('[Web Edit] Error updating row:', error.message);
    res.status(500).json({ error: error.message });
  }
});

httpServer.listen(PORT, () => {
  console.log(`====================================================`);
  console.log(`🚀 Node.js Socket.io Gateway running on port ${PORT}`);
  console.log(`📡 Webhook listener active at http://localhost:${PORT}/api/sheet-webhook`);
  console.log(`====================================================`);
});
