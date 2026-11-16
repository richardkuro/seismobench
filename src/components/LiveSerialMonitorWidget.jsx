import React, { useState, useRef, useEffect } from 'react';
import { 
  Terminal, 
  Send, 
  Trash2, 
  Download, 
  Usb, 
  Cpu, 
  Unlink, 
  RotateCcw, 
  Square, 
  Play, 
  Home, 
  ChevronDown, 
  ChevronUp, 
  Radio,
  CheckCircle,
  AlertTriangle
} from 'lucide-react';

export function LiveSerialMonitorWidget({
  packetLog = [],
  onClearLog,
  onSendCommand,
  connectionState,
  isSimulated,
  sensorMode = 'with_adxl',
  onToggleSensorMode,
  onConnectPhysical,
  onStartSimulation,
  onDisconnect,
  onResetEstop,
  onEmergencyStop,
  onHomeTable,
  baudRate = 921600
}) {
  const [commandInput, setCommandInput] = useState('');
  const [autoscroll, setAutoscroll] = useState(true);
  const [isExpanded, setIsExpanded] = useState(true);
  const [isMaximized, setIsMaximized] = useState(false);
  const logEndRef = useRef(null);

  const isConnected = connectionState !== 'DISCONNECTED';
  const isEstop = connectionState === 'ESTOP';
  const isRunning = connectionState === 'RUNNING';

  useEffect(() => {
    if (autoscroll && logEndRef.current && isExpanded) {
      logEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [packetLog, autoscroll, isExpanded]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!commandInput.trim()) return;
    onSendCommand(commandInput.trim());
    setCommandInput('');
  };

  const handleExportLog = () => {
    const text = packetLog.map(p => `[${p.time}] [${p.type}] ${p.raw}`).join('\n');
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `seismobench_serial_${Date.now()}.log`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="nothing-card flex flex-col font-space overflow-hidden border border-neutral-200 dark:border-neutral-800 transition-all">
      
      {/* Widget Header */}
      <div className="px-4 py-3 bg-neutral-100/70 dark:bg-[#101012] border-b border-neutral-200 dark:border-neutral-800/80 flex flex-wrap items-center justify-between gap-3 text-xs">
        
        {/* Left: Title & Status */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${
              !isConnected ? 'bg-neutral-400' :
              isEstop ? 'bg-amber-500 animate-pulse' :
              isSimulated ? 'bg-purple-400' : 'bg-[#D71921] animate-pulse'
            }`} />
            <h3 className="font-ndot font-bold tracking-wider text-neutral-900 dark:text-neutral-100 uppercase">
              LIVE SERIAL MONITOR
            </h3>
          </div>

          <span className={`text-[10px] px-2 py-0.5 rounded-full font-mono border ${
            !isConnected ? 'border-neutral-300 dark:border-neutral-700 text-neutral-400 bg-neutral-200/50 dark:bg-neutral-900' :
            isEstop ? 'border-amber-500/50 bg-amber-500/10 text-amber-500 font-bold' :
            isSimulated ? 'border-purple-500/40 bg-purple-500/10 text-purple-400' :
            'border-[#D71921]/40 bg-[#D71921]/10 text-[#D71921] font-bold'
          }`}>
            {!isConnected ? 'OFFLINE' : isEstop ? 'E-STOP HALT' : isSimulated ? 'SIMULATOR @ 921.6K' : `USB-C LIVE @ ${baudRate}`}
          </span>

          {/* Sensor Mode Pill */}
          <button
            onClick={onToggleSensorMode}
            className={`hidden sm:flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-space border transition-all cursor-pointer ${
              sensorMode === 'with_adxl'
                ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                : 'border-neutral-300 dark:border-neutral-700 bg-neutral-100 dark:bg-[#141416] text-neutral-500 dark:text-neutral-400'
            }`}
            title="Click to toggle sensor mode: ADXL355 20-bit SPI vs Open-Loop Kinematics"
          >
            <Radio className={`w-2.5 h-2.5 ${sensorMode === 'with_adxl' ? 'text-emerald-500' : 'text-neutral-400'}`} />
            <span>{sensorMode === 'with_adxl' ? 'ADXL355 20-BIT SPI' : 'OPEN-LOOP STEPPER'}</span>
          </button>
        </div>

        {/* Right: Connect / Disconnect / Actions */}
        <div className="flex items-center gap-2">
          {!isConnected ? (
            <>
              <button
                onClick={onStartSimulation}
                className="px-2.5 py-1 rounded-full border border-neutral-300 dark:border-neutral-700 bg-neutral-200 dark:bg-[#18181b] hover:border-neutral-400 text-[11px] font-space font-medium text-neutral-700 dark:text-neutral-300 transition-all cursor-pointer"
                title="Launch virtual hardware loopback"
              >
                SIMULATE
              </button>
              <button
                onClick={onConnectPhysical}
                className="px-3 py-1 rounded-full bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 text-[11px] font-space font-bold hover:brightness-110 transition-all cursor-pointer flex items-center gap-1.5"
                title="Connect physical ESP32 via Web Serial API"
              >
                <Usb className="w-3 h-3" />
                <span>CONNECT USB</span>
              </button>
            </>
          ) : (
            <>
              {isEstop ? (
                <button
                  onClick={onResetEstop}
                  className="px-3 py-1 rounded-full bg-amber-500 text-neutral-950 text-[11px] font-space font-bold hover:brightness-110 transition-all cursor-pointer flex items-center gap-1.5 animate-pulse"
                  title="Clear E-Stop and re-enable motor power"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>RESET E-STOP</span>
                </button>
              ) : (
                <button
                  onClick={onEmergencyStop}
                  className="px-2.5 py-1 rounded-full border border-rose-500/50 bg-rose-500/10 text-rose-500 hover:bg-rose-500 hover:text-white text-[11px] font-space font-bold transition-all cursor-pointer flex items-center gap-1"
                  title="Cut motor power immediately"
                >
                  <Square className="w-2.5 h-2.5 fill-current" />
                  <span>E-STOP</span>
                </button>
              )}

              <button
                onClick={onDisconnect}
                className="px-2.5 py-1 rounded-full border border-neutral-300 dark:border-neutral-700 bg-neutral-100 dark:bg-[#18181b] hover:bg-rose-500/15 hover:border-rose-500/50 hover:text-rose-500 text-[11px] font-space font-medium text-neutral-700 dark:text-neutral-300 transition-all cursor-pointer flex items-center gap-1"
                title="Close serial port or terminate simulation"
              >
                <Unlink className="w-3 h-3" />
                <span>DISCONNECT</span>
              </button>
            </>
          )}

          {/* Quick Logs Utility Buttons */}
          <button
            onClick={onClearLog}
            className="p-1.5 rounded-full hover:bg-neutral-200 dark:hover:bg-neutral-800 text-neutral-400 hover:text-neutral-800 dark:hover:text-neutral-200 transition-colors cursor-pointer"
            title="Clear packet buffer"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>

          <button
            onClick={handleExportLog}
            className="p-1.5 rounded-full hover:bg-neutral-200 dark:hover:bg-neutral-800 text-neutral-400 hover:text-neutral-800 dark:hover:text-neutral-200 transition-colors cursor-pointer"
            title="Download serial log"
          >
            <Download className="w-3.5 h-3.5" />
          </button>

          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="p-1.5 rounded-full hover:bg-neutral-200 dark:hover:bg-neutral-800 text-neutral-400 hover:text-neutral-800 dark:hover:text-neutral-200 transition-colors cursor-pointer"
            title={isExpanded ? 'Collapse monitor' : 'Expand monitor'}
          >
            {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
        </div>

      </div>

      {/* Expandable Monitor Body */}
      {isExpanded && (
        <div className="flex flex-col">
          
          {/* Quick Command Toolbar */}
          <div className="px-4 py-2 bg-neutral-50 dark:bg-[#0c0c0e] border-b border-neutral-200 dark:border-neutral-800/60 flex flex-wrap items-center justify-between gap-2 text-[11px]">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[10px] text-neutral-400 uppercase tracking-widest mr-1">MACROS:</span>
              <button
                onClick={() => onSendCommand('PING:SEISMOBENCH_V1')}
                disabled={!isConnected}
                className="px-2 py-0.5 rounded border border-neutral-300 dark:border-neutral-700 hover:border-neutral-400 text-neutral-600 dark:text-neutral-300 disabled:opacity-40 cursor-pointer"
              >
                PING
              </button>
              <button
                onClick={onHomeTable}
                disabled={!isConnected || isRunning}
                className="px-2 py-0.5 rounded border border-neutral-300 dark:border-neutral-700 hover:border-neutral-400 text-neutral-600 dark:text-neutral-300 disabled:opacity-40 cursor-pointer flex items-center gap-1"
              >
                <Home className="w-2.5 h-2.5" />
                <span>HOME (0.00mm)</span>
              </button>
              <button
                onClick={() => onSendCommand('STATUS:QUERY')}
                disabled={!isConnected}
                className="px-2 py-0.5 rounded border border-neutral-300 dark:border-neutral-700 hover:border-neutral-400 text-neutral-600 dark:text-neutral-300 disabled:opacity-40 cursor-pointer"
              >
                STATUS
              </button>
              {isEstop ? (
                <button
                  onClick={onResetEstop}
                  className="px-2.5 py-0.5 rounded bg-amber-500 text-neutral-950 font-bold hover:brightness-110 cursor-pointer flex items-center gap-1"
                >
                  <RotateCcw className="w-2.5 h-2.5" />
                  <span>RESET E-STOP</span>
                </button>
              ) : (
                <button
                  onClick={onEmergencyStop}
                  disabled={!isConnected}
                  className="px-2 py-0.5 rounded border border-rose-500/40 text-rose-500 hover:bg-rose-500 hover:text-white disabled:opacity-40 cursor-pointer"
                >
                  HALT
                </button>
              )}
            </div>

            <div className="flex items-center gap-3 text-[10px] text-neutral-400">
              <label className="flex items-center gap-1 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={autoscroll}
                  onChange={(e) => setAutoscroll(e.target.checked)}
                  className="accent-[#D71921] rounded"
                />
                <span>AUTOSCROLL</span>
              </label>
              <span>{packetLog.length} PACKETS</span>
            </div>
          </div>

          {/* Terminal Console View */}
          <div 
            className={`w-full overflow-y-auto p-3.5 font-mono text-[11px] leading-relaxed select-text transition-all ${
              isMaximized ? 'h-[400px]' : 'h-[180px]'
            } bg-white dark:bg-[#08080a]`}
          >
            {packetLog.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-neutral-400 dark:text-neutral-600">
                <Terminal className="w-6 h-6 mb-2 opacity-50" />
                <p>No serial packets received yet.</p>
                <p className="text-[10px] mt-1 text-neutral-400">
                  Connect physical ESP32 or click <b>SIMULATE</b> to inspect live hardware stream.
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-1">
                {packetLog.map((pkt, idx) => {
                  const isTx = pkt.type === 'TX';
                  const raw = pkt.raw || '';
                  const isTlm = raw.startsWith('TLM:');
                  const isWarn = raw.includes('WARN:') || raw.includes('ESTOP');
                  const isOk = raw.includes('OK:') || raw.includes('STATUS:READY') || raw.includes('PONG:');

                  return (
                    <div 
                      key={idx} 
                      className={`flex items-start gap-2.5 py-0.5 px-1.5 rounded transition-colors ${
                        isWarn ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400' :
                        isTlm ? 'text-neutral-600 dark:text-neutral-400 font-light' :
                        isTx ? 'text-sky-600 dark:text-sky-400 bg-sky-500/5' :
                        isOk ? 'text-emerald-600 dark:text-emerald-400' :
                        'text-neutral-800 dark:text-neutral-200'
                      }`}
                    >
                      <span className="text-[10px] text-neutral-400 dark:text-neutral-600 shrink-0 font-sans">
                        {pkt.time}
                      </span>
                      <span className={`text-[10px] font-bold px-1 rounded shrink-0 ${
                        isTx ? 'bg-sky-500/20 text-sky-600 dark:text-sky-400' : 'bg-neutral-200 dark:bg-neutral-800 text-neutral-500 dark:text-neutral-400'
                      }`}>
                        {pkt.type}
                      </span>
                      <span className="break-all font-mono">
                        {pkt.raw}
                      </span>
                    </div>
                  );
                })}
                <div ref={logEndRef} />
              </div>
            )}
          </div>

          {/* Interactive Input Bar */}
          <form 
            onSubmit={handleSubmit}
            className="p-2.5 bg-neutral-100/90 dark:bg-[#101012] border-t border-neutral-200 dark:border-neutral-800 flex items-center gap-2"
          >
            <div className="relative flex-1">
              <input
                type="text"
                value={commandInput}
                onChange={(e) => setCommandInput(e.target.value)}
                placeholder={isConnected ? "Send raw G-code/ASCII packet (e.g. PING, HOME, CFG:SENSOR=1, ESTOP)..." : "Connect hardware or simulator to send commands"}
                disabled={!isConnected}
                className="w-full bg-white dark:bg-[#18181c] border border-neutral-300 dark:border-neutral-700/80 rounded-lg px-3 py-1.5 text-xs font-mono placeholder:text-neutral-400 text-neutral-900 dark:text-neutral-100 focus:outline-none focus:border-[#D71921] transition-colors disabled:opacity-50"
              />
            </div>
            
            <button
              type="submit"
              disabled={!isConnected || !commandInput.trim()}
              className="px-3.5 py-1.5 rounded-lg bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 font-bold hover:brightness-110 disabled:opacity-40 transition-all cursor-pointer flex items-center gap-1.5"
            >
              <Send className="w-3 h-3" />
              <span>SEND</span>
            </button>

            <button
              type="button"
              onClick={() => setIsMaximized(!isMaximized)}
              className="px-2.5 py-1.5 rounded-lg border border-neutral-300 dark:border-neutral-700 text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100 text-[10px] transition-colors cursor-pointer"
            >
              {isMaximized ? 'NORMAL' : 'EXPAND'}
            </button>
          </form>

        </div>
      )}

    </div>
  );
}

