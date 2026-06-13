import express from 'express';
import path from 'path';

const app = express();
const PORT = 3000;

app.use(express.json());

let activeHost: string | null = null;
let mockMode: boolean = false;

// API Routes
app.post('/api/connect', async (req, res) => {
  const { host, mock } = req.body;
  if (!host && !mock) {
    return res.status(400).json({ error: 'Host or mock mode required' });
  }

  mockMode = !!mock;
  activeHost = mock ? null : host;

  if (!mockMode && activeHost) {
    try {
      const response = await fetch(`${activeHost}/read`);
      if (!response.ok) {
        throw new Error(`Host responded with non-ok status: ${response.status}`);
      }
      res.json({ success: true, message: `Connected to ${activeHost}` });
    } catch (error: any) {
      activeHost = null;
      res.status(500).json({ error: `Connection failed: ${error.message}` });
    }
  } else {
    res.json({ success: true, message: 'Connected in mock mode' });
  }
});

app.post('/api/disconnect', (req, res) => {
  activeHost = null;
  mockMode = false;
  res.json({ success: true });
});

app.post('/api/read', async (req, res) => {
  if (mockMode) {
    // Return random motor positions
    const mockData = {
      "30": Math.floor((Math.random() * 180 - 90) * 100) / 100,
      "31": Math.floor((Math.random() * 180 - 90) * 100) / 100,
      "32": Math.floor((Math.random() * 180 - 90) * 100) / 100,
      "33": Math.floor((Math.random() * 180 - 90) * 100) / 100,
    };
    return res.json(mockData);
  }

  if (!activeHost) {
    return res.status(400).json({ error: 'Not connected' });
  }

  try {
    const response = await fetch(`${activeHost}/read`);
    const data = await response.json();
    res.json(data);
  } catch (error: any) {
    res.status(500).json({ error: `Read failed: ${error.message}` });
  }
});

app.post('/api/play', async (req, res) => {
  const { keyframes, globalSound } = req.body;
  
  if (mockMode) {
    console.log('Mock play with keyframes:', keyframes.length, 'Sound:', globalSound);
    return res.json({ success: true, message: 'Mock Play complete' });
  }

  if (!activeHost) {
    return res.status(400).json({ error: 'Not connected' });
  }

  try {
    const response = await fetch(`${activeHost}/play`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ keyframes, globalSound })
    });
    
    if (!response.ok) {
        throw new Error(`Host responded with ${response.status}`);
    }
    const data = await response.json();
    res.json(data);
  } catch (error: any) {
    res.status(500).json({ error: `Play failed: ${error.message}` });
  }
});

app.post('/api/stop', async (req, res) => {
  if (mockMode) {
    return res.json({ success: true, message: 'Mock stop' });
  }
  if (!activeHost) {
    return res.status(400).json({ error: 'Not connected' });
  }

  try {
    const response = await fetch(`${activeHost}/stop`, { method: 'POST' });
    const data = await response.json();
    res.json(data);
  } catch (error: any) {
    res.status(500).json({ error: `Stop failed: ${error.message}` });
  }
});

app.post('/api/reset', async (req, res) => {
  if (mockMode) {
    return res.json({ success: true, message: 'Mock reset' });
  }
  if (!activeHost) {
    return res.status(400).json({ error: 'Not connected' });
  }

  try {
    const response = await fetch(`${activeHost}/reset`, { method: 'POST' });
    const data = await response.json();
    res.json(data);
  } catch (error: any) {
    res.status(500).json({ error: `Reset failed: ${error.message}` });
  }
});

// Vite Setup
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
