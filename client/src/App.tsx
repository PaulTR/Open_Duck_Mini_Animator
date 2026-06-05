import React, { useState, useEffect } from 'react';
import { 
  Play, Copy, Trash, Plus, Link, Unlink, Sun, Video, 
  Activity, Settings, PlaySquare, Code, Terminal
} from 'lucide-react';
import { Keyframe, InterpolationType, AntennaPosition } from './types';
import { generateApiServerCode, generatePythonCode } from './generators';

export default function App() {
  const [host, setHost] = useState('http://192.168.1.241:5000');
  const [mockMode, setMockMode] = useState(true);
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [activeFrameId, setActiveFrameId] = useState<string | null>(null);
  
  const [keyframes, setKeyframes] = useState<Keyframe[]>([]);
  
  // Default config state
  const [defDuration, setDefDuration] = useState(300);
  const [defPause, setDefPause] = useState(200);
  const [defLights, setDefLights] = useState(false);
  const [defProjector, setDefProjector] = useState(false);
  const [defInterpolation, setDefInterpolation] = useState<InterpolationType>('bezier');
  const [defAntennaLeft, setDefAntennaLeft] = useState<AntennaPosition>('center');
  const [defAntennaRight, setDefAntennaRight] = useState<AntennaPosition>('center');
  const [globalSound, setGlobalSound] = useState('');

  const [codeTab, setCodeTab] = useState<'script' | 'api'>('script');
  const [copied, setCopied] = useState(false);

  const handleConnect = async () => {
    if (connected) {
      await fetch('/api/disconnect', { method: 'POST' });
      setConnected(false);
      return;
    }
    
    setConnecting(true);
    try {
      const res = await fetch('/api/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ host, mock: mockMode })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setConnected(true);
      } else {
        alert(data.error || 'Connection failed');
      }
    } catch (e: any) {
      alert('Error: ' + e.message);
    } finally {
      setConnecting(false);
    }
  };

  const handleReadAndAdd = async () => {
    try {
      const res = await fetch('/api/read', { method: 'POST' });
      if (!res.ok) throw new Error('Failed to read');
      const motors = await res.json();
      
      const newFrame: Keyframe = {
        id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).substring(2),
        durationMs: defDuration,
        pauseMs: defPause,
        motors,
        lightsOn: defLights,
        projectorOn: defProjector,
        interpolation: defInterpolation,
        antennas: { left: defAntennaLeft, right: defAntennaRight }
      };
      
      setKeyframes([...keyframes, newFrame]);
    } catch (e: any) {
      alert('Read Error: ' + e.message);
    }
  };

  const handlePlay = async () => {
    if (!keyframes.length) return;
    setPlaying(true);
    try {
      // If we are in mock mode, provide visual playback simulating the durations.
      if (mockMode) {
        for (const kf of keyframes) {
          setActiveFrameId(kf.id);
          await new Promise(r => setTimeout(r, kf.durationMs));
          if (kf.pauseMs > 0) {
            await new Promise(r => setTimeout(r, kf.pauseMs));
          }
        }
        setActiveFrameId(null);
      }

      await fetch('/api/play', { 
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keyframes, globalSound })
      });
    } catch (e: any) {
      alert('Playback error: ' + e.message);
    } finally {
      setPlaying(false);
      setActiveFrameId(null);
    }
  };

  const updateKeyframe = (id: string, updates: Partial<Keyframe>) => {
    setKeyframes(kfs => kfs.map(kf => kf.id === id ? { ...kf, ...updates } : kf));
  };
  
  const updateAntenna = (id: string, side: 'left'|'right', val: AntennaPosition) => {
    setKeyframes(kfs => kfs.map(kf => kf.id === id ? { ...kf, antennas: { ...kf.antennas, [side]: val } } : kf));
  };

  const removeKeyframe = (id: string) => {
    setKeyframes(kfs => kfs.filter(kf => kf.id !== id));
  };

  const codeString = codeTab === 'script' ? generatePythonCode() : generateApiServerCode();

  const handleCopyCode = () => {
    navigator.clipboard.writeText(codeString);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-200 font-sans flex flex-col selection:bg-teal-500/30">
      {/* Header */}
      <header className="bg-neutral-900 border-b border-neutral-800 p-4 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <Activity className="text-teal-500 w-6 h-6" />
          <h1 className="text-xl font-medium tracking-tight text-white">Duck Editor</h1>
        </div>
        
        <div className="flex items-center gap-4 bg-neutral-950 p-1.5 rounded-lg border border-neutral-800">
          <input 
            type="text" 
            value={host}
            onChange={e => setHost(e.target.value)}
            disabled={connected}
            className="bg-transparent border-none text-sm text-neutral-300 px-3 py-1.5 w-64 focus:outline-none focus:ring-1 focus:ring-teal-500 rounded disabled:opacity-50 font-mono"
            placeholder="http://192.168.1.100:5000"
          />
          <label className="flex items-center gap-2 text-sm text-neutral-400 border-l border-neutral-800 pl-4">
            <input 
              type="checkbox" 
              checked={mockMode}
              onChange={e => setMockMode(e.target.checked)}
              disabled={connected}
              className="rounded border-neutral-700 text-teal-500 focus:ring-teal-500 bg-neutral-900" 
            />
            Mock API
          </label>
          <button 
            onClick={handleConnect}
            disabled={connecting}
            className={`flex items-center gap-2 px-4 py-1.5 rounded-md text-sm font-medium transition-colors ml-2 ${
              connected 
                ? 'bg-amber-500/10 text-amber-500 hover:bg-amber-500/20' 
                : 'bg-teal-500 text-neutral-950 hover:bg-teal-400'
            }`}
          >
            {connected ? <Unlink className="w-4 h-4" /> : <Link className="w-4 h-4" />}
            {connecting ? 'Connecting...' : connected ? 'Disconnect' : 'Connect'}
          </button>
        </div>
      </header>

      {/* Main Content: 3 Columns */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-6 p-6 overflow-hidden">
        
        {/* Left Column: Timeline */}
        <div className="lg:col-span-4 flex flex-col gap-4 overflow-y-auto pr-2 pb-20 custom-scrollbar">
          <div className="flex items-center justify-between sticky top-0 bg-neutral-950 pb-2 z-10 pt-2">
            <h2 className="text-lg font-medium text-white flex items-center gap-2">
              <PlaySquare className="w-5 h-5 text-neutral-500" /> Keyframes
            </h2>
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono text-neutral-500 px-2 py-1 bg-neutral-900 rounded-md">
                {keyframes.length} Frames
              </span>
              <button
                 onClick={() => {
                   const input = document.createElement('input');
                   input.type = 'file';
                   input.accept = 'application/json, .json';
                   input.onchange = (e: any) => {
                     const file = e.target.files?.[0];
                     if (!file) return;
                     const reader = new FileReader();
                     reader.onload = (re) => {
                       try {
                         const data = JSON.parse(re.target?.result as string);
                         if (data.keyframes && Array.isArray(data.keyframes)) {
                           setKeyframes(data.keyframes);
                         }
                         if (data.globalSound !== undefined) {
                           setGlobalSound(data.globalSound);
                         }
                       } catch (err) {
                         alert('Invalid JSON file');
                       }
                     };
                     reader.readAsText(file);
                   };
                   input.click();
                 }}
                 title="Import JSON"
                 className="bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-xs font-medium py-1.5 px-3 rounded-md transition-colors"
               >
                 Import JSON
               </button>
               <button
                 onClick={() => {
                   const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify({ keyframes, globalSound }, null, 2));
                   const dlAnchorElem = document.createElement('a');
                   dlAnchorElem.setAttribute("href",     dataStr     );
                   dlAnchorElem.setAttribute("download", "action.json");
                   dlAnchorElem.click();
                 }}
                 disabled={keyframes.length === 0}
                 title="Export JSON"
                 className="bg-neutral-800 hover:bg-neutral-700 text-neutral-200 disabled:opacity-50 text-xs font-medium py-1.5 px-3 rounded-md transition-colors"
               >
                 Export JSON
               </button>
               <button
                 onClick={() => {
                   if (window.confirm('Are you sure you want to clear all keyframes?')) {
                     setKeyframes([]);
                   }
                 }}
                 disabled={keyframes.length === 0}
                 title="Clear All Keyframes"
                 className="bg-red-900/50 hover:bg-red-800/50 text-red-200 disabled:opacity-50 text-xs font-medium py-1.5 px-3 rounded-md transition-colors"
               >
                 Clear All
               </button>
               <button
                 onClick={handlePlay}
                 disabled={!connected || playing || keyframes.length === 0}
                 className="bg-emerald-500 hover:bg-emerald-400 text-neutral-950 disabled:opacity-50 text-xs font-medium py-1.5 px-3 rounded-md flex items-center gap-1.5 transition-colors"
               >
                 <Play className="w-3 h-3" fill="currentColor" /> {playing ? 'Playing...' : 'Play'}
               </button>
            </div>
          </div>

          <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4 flex justify-between items-center mb-2">
            <span className="text-sm font-medium text-neutral-300">Global Audio (.wav)</span>
            <input 
              type="text" 
              value={globalSound}
              onChange={e => setGlobalSound(e.target.value)}
              placeholder="e.g. hello.wav"
              className="bg-neutral-950 border border-neutral-700 w-48 rounded px-3 py-1.5 text-sm focus:outline-none focus:border-teal-500 font-mono text-white"
            />
          </div>

          {keyframes.length === 0 ? (
            <div className="border border-dashed border-neutral-800 rounded-xl p-8 text-center text-neutral-500 text-sm">
              No keyframes recorded yet.
            </div>
          ) : null}

          {keyframes.map((kf, i) => (
            <div key={kf.id} className={`group flex flex-col rounded-xl border p-4 transition-all relative ${
              activeFrameId === kf.id 
                ? 'bg-neutral-800 border-teal-500/50 shadow-[0_0_20px_rgba(20,184,166,0.15)]' 
                : 'bg-neutral-900 border-neutral-800 hover:border-neutral-700'
            }`}>
              <div className={`absolute top-0 left-0 bottom-0 w-1 rounded-l-xl transition-colors ${
                activeFrameId === kf.id ? 'bg-teal-500' : 'bg-neutral-800 group-hover:bg-teal-500/50'
              }`}></div>
              
              <div className="flex items-center justify-between mb-4">
                <span className={`text-xs font-mono font-bold ${activeFrameId === kf.id ? 'text-teal-400' : 'text-neutral-400'}`}>
                  FRAME_{String(i).padStart(2, '0')} {activeFrameId === kf.id && ' (PLAYING)'}
                </span>
                <button 
                  onClick={() => removeKeyframe(kf.id)}
                  className="text-neutral-600 hover:text-red-400 p-1 rounded hover:bg-red-400/10 transition-colors"
                >
                  <Trash className="w-4 h-4" />
                </button>
              </div>

              <div className="grid grid-cols-2 gap-4">
                {/* Duration */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs text-neutral-500 uppercase tracking-wider font-semibold">Duration (ms)</label>
                  <input 
                    type="number" 
                    value={kf.durationMs}
                    onChange={e => updateKeyframe(kf.id, { durationMs: parseInt(e.target.value) || 0 })}
                    className="bg-neutral-950 border border-neutral-800 rounded px-3 py-1.5 text-sm text-white focus:outline-none focus:border-teal-500 font-mono"
                  />
                </div>
                
                {/* Pause */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs text-neutral-500 uppercase tracking-wider font-semibold">Pause (ms)</label>
                  <input 
                    type="number" 
                    value={kf.pauseMs}
                    onChange={e => updateKeyframe(kf.id, { pauseMs: parseInt(e.target.value) || 0 })}
                    className="bg-neutral-950 border border-neutral-800 rounded px-3 py-1.5 text-sm text-white focus:outline-none focus:border-teal-500 font-mono"
                  />
                </div>
                
                {/* Interpolation */}
                <div className="flex flex-col gap-1.5 col-span-2">
                  <label className="text-xs text-neutral-500 uppercase tracking-wider font-semibold">Easing</label>
                  <select 
                    value={kf.interpolation}
                    onChange={e => updateKeyframe(kf.id, { interpolation: e.target.value as InterpolationType })}
                    className="bg-neutral-950 border border-neutral-800 rounded px-3 py-1.5 text-sm text-white focus:outline-none focus:border-teal-500 appearance-none"
                  >
                    <option value="linear">Linear</option>
                    <option value="bezier">Bezier</option>
                    <option value="bezier_viscous">Viscous</option>
                    <option value="bezier_clamped">Clamped</option>
                  </select>
                </div>

                {/* Toggles */}
                <div className="flex flex-col gap-2 col-span-2 mt-1">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[10px] text-neutral-500 uppercase tracking-wider flex items-center gap-1.5"><Sun className="w-3 h-3"/> Lights</label>
                      <div className="flex bg-neutral-950 rounded border border-neutral-800 p-0.5">
                        <button 
                          onClick={() => updateKeyframe(kf.id, { lightsOn: true })}
                          className={`flex-1 text-xs py-1.5 rounded-sm transition-colors ${kf.lightsOn ? 'bg-amber-500/20 text-amber-500 font-medium' : 'text-neutral-500 hover:text-neutral-300'}`}
                        >ON</button>
                        <button 
                          onClick={() => updateKeyframe(kf.id, { lightsOn: false })}
                          className={`flex-1 text-xs py-1.5 rounded-sm transition-colors ${!kf.lightsOn ? 'bg-neutral-800 text-neutral-300 font-medium' : 'text-neutral-500 hover:text-neutral-300'}`}
                        >OFF</button>
                      </div>
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[10px] text-neutral-500 uppercase tracking-wider flex items-center gap-1.5"><Video className="w-3 h-3"/> Projector</label>
                      <div className="flex bg-neutral-950 rounded border border-neutral-800 p-0.5">
                        <button 
                          onClick={() => updateKeyframe(kf.id, { projectorOn: true })}
                          className={`flex-1 text-xs py-1.5 rounded-sm transition-colors ${kf.projectorOn ? 'bg-teal-500/20 text-teal-400 font-medium' : 'text-neutral-500 hover:text-neutral-300'}`}
                        >ON</button>
                        <button 
                          onClick={() => updateKeyframe(kf.id, { projectorOn: false })}
                          className={`flex-1 text-xs py-1.5 rounded-sm transition-colors ${!kf.projectorOn ? 'bg-neutral-800 text-neutral-300 font-medium' : 'text-neutral-500 hover:text-neutral-300'}`}
                        >OFF</button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Antennas */}
                <div className="col-span-2 grid grid-cols-2 gap-3 mt-1 pt-4 border-t border-neutral-800/50">
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] text-neutral-500 uppercase tracking-wider">Antenna L</label>
                    <select 
                      value={kf.antennas.left}
                      onChange={e => updateAntenna(kf.id, 'left', e.target.value as AntennaPosition)}
                      className="bg-neutral-950 border border-neutral-800 rounded px-2 py-1 text-xs text-neutral-300 focus:outline-none focus:border-teal-500"
                    >
                      <option value="back">Back</option>
                      <option value="center">Center</option>
                      <option value="forward">Forward</option>
                    </select>
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] text-neutral-500 uppercase tracking-wider">Antenna R</label>
                    <select 
                      value={kf.antennas.right}
                      onChange={e => updateAntenna(kf.id, 'right', e.target.value as AntennaPosition)}
                      className="bg-neutral-950 border border-neutral-800 rounded px-2 py-1 text-xs text-neutral-300 focus:outline-none focus:border-teal-500"
                    >
                      <option value="back">Back</option>
                      <option value="center">Center</option>
                      <option value="forward">Forward</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Middle Column: Config & Capture */}
        <div className="lg:col-span-3 flex flex-col gap-6">
          <div className="bg-neutral-900 rounded-xl border border-neutral-800 overflow-hidden">
            <div className="bg-neutral-800/30 p-4 border-b border-neutral-800">
              <h2 className="text-sm font-medium text-white flex items-center gap-2">
                <Settings className="w-4 h-4 text-neutral-400" /> Global Defaults
              </h2>
            </div>
            <div className="p-5 flex flex-col gap-5">
              <div className="flex justify-between items-center">
                <span className="text-sm text-neutral-400">Duration (ms)</span>
                <input 
                  type="number" 
                  value={defDuration}
                  onChange={e => setDefDuration(parseInt(e.target.value) || 0)}
                  className="bg-neutral-950 border border-neutral-700 w-24 text-right rounded px-2 py-1 text-sm focus:outline-none focus:border-teal-500 font-mono"
                />
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-neutral-400">Pause (ms)</span>
                <input 
                  type="number" 
                  value={defPause}
                  onChange={e => setDefPause(parseInt(e.target.value) || 0)}
                  className="bg-neutral-950 border border-neutral-700 w-24 text-right rounded px-2 py-1 text-sm focus:outline-none focus:border-teal-500 font-mono"
                />
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-neutral-400">Interpolation</span>
                <select 
                  value={defInterpolation}
                  onChange={e => setDefInterpolation(e.target.value as InterpolationType)}
                  className="bg-neutral-950 border border-neutral-700 w-32 rounded px-2 py-1 text-sm focus:outline-none focus:border-teal-500"
                >
                  <option value="linear">Linear</option>
                  <option value="bezier">Bezier</option>
                  <option value="bezier_viscous">Viscous</option>
                  <option value="bezier_clamped">Clamped</option>
                </select>
              </div>

              <div className="h-px bg-neutral-800 w-full" />

              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs text-neutral-400 flex items-center gap-2"><Sun className="w-4 h-4"/> Lights Default</label>
                  <div className="flex bg-neutral-950 rounded border border-neutral-800 p-0.5 mt-1">
                    <button 
                      onClick={() => setDefLights(true)}
                      className={`flex-1 text-xs py-2 rounded-sm transition-colors ${defLights ? 'bg-amber-500/20 text-amber-500 font-medium' : 'text-neutral-500 hover:text-neutral-300'}`}
                    >ON</button>
                    <button 
                      onClick={() => setDefLights(false)}
                      className={`flex-1 text-xs py-2 rounded-sm transition-colors ${!defLights ? 'bg-neutral-800 text-neutral-300 font-medium' : 'text-neutral-500 hover:text-neutral-300'}`}
                    >OFF</button>
                  </div>
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs text-neutral-400 flex items-center gap-2"><Video className="w-4 h-4"/> Proj. Default</label>
                  <div className="flex bg-neutral-950 rounded border border-neutral-800 p-0.5 mt-1">
                    <button 
                      onClick={() => setDefProjector(true)}
                      className={`flex-1 text-xs py-2 rounded-sm transition-colors ${defProjector ? 'bg-teal-500/20 text-teal-400 font-medium' : 'text-neutral-500 hover:text-neutral-300'}`}
                    >ON</button>
                    <button 
                      onClick={() => setDefProjector(false)}
                      className={`flex-1 text-xs py-2 rounded-sm transition-colors ${!defProjector ? 'bg-neutral-800 text-neutral-300 font-medium' : 'text-neutral-500 hover:text-neutral-300'}`}
                    >OFF</button>
                  </div>
                </div>
              </div>

              <div className="h-px bg-neutral-800 w-full" />

              <div className="flex justify-between items-center">
                <span className="text-sm text-neutral-400">Antenna L</span>
                <select 
                  value={defAntennaLeft}
                  onChange={e => setDefAntennaLeft(e.target.value as AntennaPosition)}
                  className="bg-neutral-950 border border-neutral-700 w-28 rounded px-2 py-1 text-sm focus:outline-none focus:border-teal-500"
                >
                  <option value="back">Back</option>
                  <option value="center">Center</option>
                  <option value="forward">Forward</option>
                </select>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-neutral-400">Antenna R</span>
                <select 
                  value={defAntennaRight}
                  onChange={e => setDefAntennaRight(e.target.value as AntennaPosition)}
                  className="bg-neutral-950 border border-neutral-700 w-28 rounded px-2 py-1 text-sm focus:outline-none focus:border-teal-500"
                >
                  <option value="back">Back</option>
                  <option value="center">Center</option>
                  <option value="forward">Forward</option>
                </select>
              </div>
            </div>
          </div>

          <div className="bg-teal-900/20 border border-teal-900/50 rounded-xl p-5">
            <h3 className="text-teal-400 text-sm font-medium mb-2 flex items-center gap-2">
              <Activity className="w-4 h-4" /> Capture State
            </h3>
            <p className="text-sm text-neutral-400 leading-relaxed mb-6">
              Manually pose the robot on your desk. Click "Record Keyframe" to fetch live motor angles and save them as a keyframe utilizing your global defaults.
            </p>
            <button
              onClick={handleReadAndAdd}
              disabled={!connected}
              className="w-full bg-teal-500 hover:bg-teal-400 text-neutral-950 font-medium py-3 px-4 rounded-lg flex items-center justify-center gap-2 transition-colors disabled:opacity-50 disabled:hover:bg-teal-500"
            >
              <Plus className="w-5 h-5" /> Read Position & Add Keyframe
            </button>
          </div>
        </div>

        {/* Right Column: Generative Area */}
        <div className="lg:col-span-5 flex flex-col bg-neutral-900 rounded-xl border border-neutral-800 overflow-hidden h-full">
          <div className="flex items-center justify-between bg-neutral-950 border-b border-neutral-800 p-2">
            <div className="flex items-center gap-2">
              <button 
                onClick={() => setCodeTab('script')}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors flex items-center gap-2 ${codeTab === 'script' ? 'bg-neutral-800 text-white' : 'text-neutral-500 hover:text-neutral-300'}`}
              >
                <Terminal className="w-4 h-4" /> Playback Script
              </button>
              <button 
                onClick={() => setCodeTab('api')}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors flex items-center gap-2 ${codeTab === 'api' ? 'bg-neutral-800 text-white' : 'text-neutral-500 hover:text-neutral-300'}`}
              >
                <Code className="w-4 h-4" /> Flask API Server
              </button>
            </div>
            
            <div className="flex items-center gap-2 pr-2">
              <button 
                onClick={handleCopyCode}
                className="text-neutral-400 hover:text-white transition-colors p-1.5 rounded hover:bg-neutral-800 flex flex-row items-center gap-1 text-xs"
              >
                <Copy className="w-4 h-4" /> {copied ? 'Copied!' : 'Copy Python'}
              </button>
            </div>
          </div>
          
          <div className="flex-1 overflow-auto relative bg-[#0d0d0d] p-4 text-sm font-mono text-neutral-300 selection:bg-teal-500/30">
             <pre className="whitespace-pre-wrap">{codeString}</pre>
          </div>

        </div>

      </div>
    </div>
  );
}

