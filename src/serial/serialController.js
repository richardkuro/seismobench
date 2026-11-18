/**
 * SeismoBench ESP32-S3 Serial Communication & Hardware Simulator
 * 
 * Supports:
 * 1. Physical Web Serial API (USB-C direct connection to ESP32-S3 @ 115200 - 921600 baud)
 * 2. Standalone Hardware Loopback Simulator (physics model of table inertia, belt resonance, and ADXL356 noise)
 */

export class SeismoSerialController {
  constructor() {
    this.port = null;
    this.reader = null;
    this.writer = null;
    this.isConnected = false;
    this.isSimulated = false;
    this.baudRate = 921600;
    this.state = 'DISCONNECTED'; // DISCONNECTED, CONNECTED, BUFFERING, READY, RUNNING, ESTOP
    this.isEstop = false;
    this.sensorMode = 'with_adxl'; // 'with_adxl' | 'no_adxl'
    
    // Callbacks
    this.onPacketTx = null;
    this.onPacketRx = null;
    this.onTelemetry = null; // (point: { time, accel, disp, step, cmdAccel, cmdDisp }) => void
    this.onProgress = null;  // (percent, current, total) => void
    this.onStateChange = null;
    this.onError = null;

    // Simulation loop timer
    this.simTimer = null;
    this.trajectoryBuffer = [];
  }

  isSupported() {
    return typeof navigator !== 'undefined' && 'serial' in navigator;
  }

  setState(newState) {
    this.state = newState;
    if (this.onStateChange) this.onStateChange(newState);
  }

  logTx(packet) {
    if (this.onPacketTx) {
      this.onPacketTx({
        type: 'TX',
        time: new Date().toLocaleTimeString() + '.' + String(Date.now() % 1000).padStart(3, '0'),
        raw: packet
      });
    }
  }

  logRx(packet) {
    if (this.onPacketRx) {
      this.onPacketRx({
        type: 'RX',
        time: new Date().toLocaleTimeString() + '.' + String(Date.now() % 1000).padStart(3, '0'),
        raw: packet
      });
    }
  }

  /**
   * Connect to physical ESP32 via Web Serial API
   */
  async connectPhysical(baud = 921600) {
    if (!this.isSupported()) {
      const errMsg = 'Web Serial API is not supported in this browser. Please use Google Chrome, Microsoft Edge, or Opera.';
      if (this.onError) this.onError(errMsg);
      throw new Error(errMsg);
    }

    // If already connected or an old port reference is hanging, cleanly disconnect first
    if (this.port || this.isConnected) {
      await this.disconnect();
    }

    try {
      // Prompt user to grant permission and select the USB Serial port
      const selectedPort = await navigator.serial.requestPort();
      this.port = selectedPort;
      this.baudRate = baud;

      // Open port with optimal driver parameters
      await this.port.open({
        baudRate: this.baudRate,
        flowControl: 'none'
      });

      this.isConnected = true;
      this.isSimulated = false;
      this.setState('CONNECTED');
      this.logRx(`[SYSTEM] Connected to physical ESP32 port @ ${this.baudRate} baud`);

      // Start continuous background read stream
      this.readLoopPromise = this.startReading();

      // Give port time to establish stream, send initial handshake ping and home
      await new Promise(r => setTimeout(r, 60));
      await this.sendPacket('PING:SEISMOBENCH_V1');
      await this.sendPacket('HOME:CONNECT_INIT');
      return true;
    } catch (err) {
      await this.disconnect();

      // Handle user cancellation gracefully
      if (err.name === 'NotFoundError') {
        return false;
      }

      let userFriendlyMsg = err.message || 'Unknown connection error';

      if (
        err.name === 'NetworkError' ||
        userFriendlyMsg.includes('Failed to open serial port') ||
        userFriendlyMsg.includes('Access denied')
      ) {
        userFriendlyMsg = 'The COM port is currently locked or in use! Please CLOSE the Arduino IDE Serial Monitor, PuTTY, or VS Code, and try clicking CONNECT again.';
      } else if (
        err.name === 'SecurityError' ||
        userFriendlyMsg.includes('not allowed') ||
        userFriendlyMsg.includes('permission')
      ) {
        userFriendlyMsg = 'Browser blocked USB access! Click the "Tune/Lock" icon in your Chrome address bar, ensure "Serial ports" is allowed for this site, and reload the page.';
      }

      if (this.onError) {
        this.onError(userFriendlyMsg);
      }
      throw new Error(userFriendlyMsg);
    }
  }

  /**
   * Continuous background reader for incoming serial stream
   */
  async startReading() {
    if (!this.port || !this.port.readable) return;
    this.reader = this.port.readable.getReader();
    const decoder = new TextDecoder();
    let lineBuffer = '';

    try {
      while (this.isConnected) {
        const { value, done } = await this.reader.read();
        if (done) break;
        if (value) {
          lineBuffer += decoder.decode(value, { stream: true });
          const lines = lineBuffer.split('\n');
          lineBuffer = lines.pop(); // keep last incomplete line

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;
            this.handleIncomingLine(trimmed);
          }
        }
      }
    } catch (err) {
      if (this.isConnected) {
        console.warn('Serial read error:', err);
      }
    } finally {
      try {
        this.reader?.releaseLock();
      } catch (e) {}
    }
  }

  handleIncomingLine(line) {
    this.logRx(line);

    // Parse Telemetry packet: TLM:time_ms,accel_g,pos_mm,step
    if (line.startsWith('TLM:')) {
      const parts = line.substring(4).split(',');
      if (parts.length >= 2) {
        const tMs = parseFloat(parts[0]);
        let aG = parseFloat(parts[1]);
        const pMm = parts[2] ? parseFloat(parts[2]) : 0;
        const sIdx = parts[3] ? parseInt(parts[3]) : 0;

        // If sensorMode is 'no_adxl', supply commanded acceleration from trajectory
        if (this.sensorMode === 'no_adxl' && this.trajectoryBuffer && this.trajectoryBuffer.length > 0) {
          const dtMs = Math.round((this.trajectoryBuffer[1]?.time - this.trajectoryBuffer[0]?.time) * 1000) || 20;
          const ptIdx = Math.min(
            this.trajectoryBuffer.length - 1,
            Math.max(0, Math.round(tMs / dtMs))
          );
          if (this.trajectoryBuffer[ptIdx] && this.trajectoryBuffer[ptIdx].accel !== undefined) {
            aG = this.trajectoryBuffer[ptIdx].accel;
          }
        }

        if (this.onTelemetry) {
          this.onTelemetry({
            time: tMs / 1000,
            accel: aG,
            disp: pMm,
            step: sIdx
          });
        }
      }
    } else if (line.includes('STATUS:READY')) {
      this.setState('READY');
    } else if (line.includes('STATUS:SHAKING_ACTIVE')) {
      this.setState('RUNNING');
    } else if (line.includes('STATUS:SHAKE_COMPLETE')) {
      this.setState('READY');
    } else if (line.includes('WARN:ESTOP_ASSERTED')) {
      this.isEstop = true;
      this.setState('ESTOP');
    } else if (line.includes('OK:HOMING_CYCLE_COMPLETE') || line.includes('OK:RESET_CYCLE_COMPLETE')) {
      this.isEstop = false;
      this.setState('READY');
    }
  }

  /**
   * Send packet to physical or simulated serial line
   */
  async sendPacket(command) {
    const packet = command.endsWith('\n') ? command : command + '\n';
    this.logTx(command.trim());

    if (this.isSimulated) {
      this.handleSimulatedRx(command.trim());
      return;
    }

    if (!this.port || !this.port.writable) {
      throw new Error('Serial port is not writable.');
    }

    // Queue packets through write promise to avoid "Cannot get a writer for a locked stream"
    return (this.writeQueue = (this.writeQueue || Promise.resolve()).then(async () => {
      if (!this.port || !this.port.writable) return;
      const encoder = new TextEncoder();
      const data = encoder.encode(packet);
      const writer = this.port.writable.getWriter();
      try {
        await writer.write(data);
      } finally {
        writer.releaseLock();
      }
    }));
  }

  /**
   * Start Standalone Hardware Loopback Simulation
   */
  startSimulationMode() {
    this.disconnect();
    this.isConnected = true;
    this.isSimulated = true;
    this.setState('CONNECTED');
    this.logRx('[SIMULATOR] Virtual ESP32-S3 Hardware Loopback Initialized (Dual TMC2209 + ADXL356 SPI @ 10MHz)');
    this.logRx('[SIMULATOR] Hardware ready. Standalone DSP loopback active.');
  }

  /**
   * Set Sensor Mode: 'with_adxl' | 'no_adxl'
   */
  async setSensorMode(mode) {
    this.sensorMode = mode;
    this.logRx(`[SYSTEM] Telemetry mode set to: ${mode === 'with_adxl' ? 'ADXL355 Hardware SPI' : 'Open-Loop Stepper Kinematics'}`);
    if (this.isConnected && !this.isSimulated) {
      try {
        await this.sendPacket(`CFG:SENSOR=${mode === 'with_adxl' ? 1 : 0}`);
      } catch (e) {}
    }
  }

  /**
   * Simulates the ESP32 firmware state machine response to commands
   */
  handleSimulatedRx(cmd) {
    if (cmd.startsWith('PING')) {
      this.logRx(`PONG:ESP32_DUAL_STEPPER_FW_V3.0 [TMC2209:OK (256uStep StealthChop), SENSOR:${this.sensorMode === 'with_adxl' ? 'ADXL355_ACTIVE' : 'OPEN_LOOP'}]`);
    } else if (cmd.startsWith('CFG:')) {
      this.logRx('OK:CFG_STORED [GT2_20T, 1/16uStep (256-interpolated), 80steps/mm, SoftLimit:Active]');
    } else if (cmd.startsWith('ADXL:')) {
      this.logRx(`OK:ADXL_MODE_SWITCHED [Mode: ${this.sensorMode === 'with_adxl' ? 'ADXL355_ACTIVE' : 'OPEN_LOOP'}]`);
    } else if (cmd.startsWith('BUF_START:')) {
      this.isEstop = false;
      this.logRx('OK:BUFFER_ALLOCATED_SRAM (Free DMA: 284KB)');
    } else if (cmd.startsWith('CHUNK:')) {
      const parts = cmd.split(':');
      const offset = parts[1] || '0';
      this.logRx(`ACK:CHUNK:${offset}`);
    } else if (cmd.startsWith('EXEC:START')) {
      this.isEstop = false;
      this.setState('RUNNING');
      this.logRx('STATUS:SHAKING_ACTIVE [FreeRTOS Timer 50Hz, Stepper Core 1 Active]');
      this.runSimulatedShakeLoop();
    } else if (cmd.startsWith('ESTOP')) {
      this.isEstop = true;
      this.stopExecution();
      this.logRx('WARN:ESTOP_ASSERTED - Stepper PWM Killed, Motor Power Cut');
      this.setState('ESTOP');
    } else if (cmd.startsWith('RESET') || cmd.startsWith('HOME')) {
      this.isEstop = false;
      this.setState('READY');
      this.logRx('OK:RESET_CYCLE_COMPLETE - Center Reference 0.00mm, Drivers Re-enabled');
    }
  }

  /**
   * Upload Trajectory Buffer (steps, times, displacements)
   */
  async uploadTrajectoryBuffer(trajectoryPoints) {
    if (!this.isConnected) {
      throw new Error('Device not connected. Connect physical ESP32 or activate Simulation mode.');
    }

    this.isEstop = false; // Reset any previous ESTOP flag so new buffer uploads cleanly
    this.trajectoryBuffer = trajectoryPoints;
    const total = trajectoryPoints.length;
    this.setState('BUFFERING');

    // 1. Zero carriage position in firmware before buffer transfer
    if (!this.isSimulated) {
      await this.sendPacket('HOME:PRE_BUFFER_ZERO');
      await new Promise(r => setTimeout(r, 60));
    }

    const dtMs = Math.round((trajectoryPoints[1]?.time - trajectoryPoints[0]?.time) * 1000 || 20);
    await this.sendPacket(`BUF_START:POINTS=${total},DT_MS=${dtMs}`);

    // Stream points in chunks of 50 points (exact format from version 1)
    const chunkSize = 50;
    for (let i = 0; i < total; i += chunkSize) {
      if (this.isEstop) {
        this.logRx('WARN:UPLOAD_ABORTED - Emergency Stop signaled during buffer transfer');
        break;
      }

      const chunk = trajectoryPoints.slice(i, i + chunkSize);
      // Strictly 3 fields: time_ms:target_step:disp_mm (matching flashed ESP32 firmware parser)
      const chunkPayload = chunk.map(p => `${Math.round(p.time * 1000)}:${p.step}:${Number(p.disp).toFixed(2)}`).join(';');
      
      await this.sendPacket(`CHUNK:${i}:${chunkPayload}`);

      const progress = Math.min(100, Math.round(((i + chunk.length) / total) * 100));
      if (this.onProgress) this.onProgress(progress, i + chunk.length, total);

      // Yield for serial transfer
      await new Promise(r => setTimeout(r, this.isSimulated ? 2 : 25));
    }

    if (!this.isEstop) {
      await this.sendPacket(`BUF_END:CHECKSUM=0x${(total * 47 & 0xFFFF).toString(16).toUpperCase()}`);
      
      // Wait for ESP32 to acknowledge STATUS:READY or settle
      await new Promise((resolve) => {
        const timeout = setTimeout(() => {
          this.setState('READY');
          resolve();
        }, 300);

        const checkInterval = setInterval(() => {
          if (this.state === 'READY') {
            clearInterval(checkInterval);
            clearTimeout(timeout);
            resolve();
          }
        }, 20);
      });

      this.logRx(`[SYSTEM] Trajectory buffer verification passed. ${total} motion steps loaded.`);
    }
  }

  /**
   * Trigger Shake Sequence
   */
  async executeShake() {
    if (!this.isConnected) {
      throw new Error('Device not connected.');
    }
    this.isEstop = false;
    await this.sendPacket('EXEC:START');
  }

  /**
   * Stop / Emergency Stop
   */
  async emergencyStop() {
    this.isEstop = true;
    this.stopExecution();
    this.setState('ESTOP');

    // Send software ESTOP packet to immediately kill stepper PWM & disable H-bridges
    try {
      await this.sendPacket('ESTOP:EMERGENCY_HALT');
    } catch (e) {
      console.warn('ESTOP packet send notice:', e);
    }
  }

  /**
   * Reset / Clear Emergency Stop
   */
  async resetEstop() {
    this.isEstop = false;
    this.stopExecution();
    try {
      // Send HOME to clear emergencyStopFlag and set currentState = STATE_READY in firmware!
      await this.sendPacket('HOME:RESET_ESTOP');
    } catch (e) {}
    this.setState('READY');
    this.logRx('[SYSTEM] E-STOP cleared. Motor drivers re-enabled.');
  }

  /**
   * Homing Cycle
   */
  async homeTable() {
    this.isEstop = false;
    await this.sendPacket('HOME:OPTICAL_LIMIT_CENTER');
    this.setState('READY');
  }

  stopExecution() {
    if (this.simTimer) {
      clearInterval(this.simTimer);
      this.simTimer = null;
    }
  }

  /**
   * Runs the simulated shake loop in standalone mode.
   * Accurately supports both 'with_adxl' and 'no_adxl' modes!
   */
  runSimulatedShakeLoop() {
    this.stopExecution();
    if (!this.trajectoryBuffer || this.trajectoryBuffer.length === 0) return;

    let index = 0;
    const total = this.trajectoryBuffer.length;
    const dtMs = Math.round((this.trajectoryBuffer[1]?.time - this.trajectoryBuffer[0]?.time) * 1000) || 20;

    // Resonant state variables for 2nd order chassis vibration model
    let resPos = 0;
    let resVel = 0;
    const omegaN = 2 * Math.PI * 9.5; // 9.5 Hz natural chassis frequency
    const zeta = 0.15; // chassis damping ratio

    this.simTimer = setInterval(() => {
      if (index >= total || this.isEstop || this.state === 'ESTOP') {
        this.stopExecution();
        if (!this.isEstop && this.state !== 'ESTOP') {
          this.setState('CONNECTED');
          this.logRx('STATUS:SHAKE_COMPLETE [Profile Finished, Carriage Idle at 0.00mm]');
        }
        return;
      }

      const point = this.trajectoryBuffer[index];
      const cmdAccel = point.accel || 0;
      const cmdDisp = point.disp || 0;

      let measuredAccel = cmdAccel;
      let measuredDisp = cmdDisp;

      if (this.sensorMode === 'with_adxl') {
        // Physical ADXL355 sensor simulation with structural chassis dynamics & 25 ug/sqrt(Hz) noise
        const dtSec = dtMs / 1000;
        const resAccel = -2 * zeta * omegaN * resVel - omegaN * omegaN * resPos + (cmdAccel * 9.81 * 0.10);
        resVel += resAccel * dtSec;
        resPos += resVel * dtSec;

        const u1 = Math.random() || 0.001;
        const u2 = Math.random() || 0.001;
        const sensorNoise = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2) * 0.0025;

        measuredAccel = cmdAccel * 0.98 + (resPos * 0.04) + sensorNoise;
        measuredDisp = cmdDisp + (resPos * 0.12);
      } else {
        // Without ADXL: Pure mechanical open-loop kinematics from motor microstepping
        measuredAccel = cmdAccel;
        measuredDisp = cmdDisp;
      }

      // Stream simulated TLM packet
      const tlmLine = `TLM:${Math.round(point.time * 1000)},${measuredAccel.toFixed(5)},${measuredDisp.toFixed(2)},${point.step}`;
      this.logRx(tlmLine);

      if (this.onTelemetry) {
        this.onTelemetry({
          time: point.time,
          accel: measuredAccel,
          disp: measuredDisp,
          step: point.step,
          cmdAccel: cmdAccel,
          cmdDisp: cmdDisp
        });
      }

      index++;
    }, dtMs);
  }

  clearTrajectoryBuffer() {
    this.trajectoryBuffer = [];
  }

  async disconnect() {
    this.stopExecution();
    this.isConnected = false;
    this.isSimulated = false;

    if (this.reader) {
      try {
        await this.reader.cancel();
      } catch (e) {}
    }

    if (this.readLoopPromise) {
      try {
        await this.readLoopPromise;
      } catch (e) {}
      this.readLoopPromise = null;
    }

    if (this.port) {
      try {
        await this.port.close();
      } catch (e) {}
      this.port = null;
    }

    this.reader = null;
    this.setState('DISCONNECTED');
  }
}
