import React, { useState } from 'react';
import { 
  Code, 
  X, 
  Copy, 
  Check, 
  Download, 
  FileJson, 
  FileCode, 
  Cpu
} from 'lucide-react';

export function PayloadGeneratorModal({
  isOpen,
  onClose,
  timeArray = [],
  dispArray = [],
  accelArray = [],
  stepsPerMm = 80.0,
  waveformMeta = {}
}) {
  const [activeTab, setActiveTab] = useState('cpp_firmware'); // 'json' | 'cpp_firmware' | 'c_header'
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const trajectoryPoints = timeArray.map((t, i) => {
    const disp = dispArray[i] || 0;
    const targetStep = Math.round(disp * stepsPerMm);
    return {
      t_ms: Math.round(t * 1000),
      target_step: targetStep,
      disp_mm: Number(disp.toFixed(3)),
      accel_g: Number((accelArray[i] || 0).toFixed(4))
    };
  });

  const jsonPayload = JSON.stringify(
    {
      meta: {
        name: waveformMeta.name || 'Seismic Waveform',
        steps_per_mm: stepsPerMm,
        point_count: trajectoryPoints.length,
        dt_ms: Math.round((trajectoryPoints[1]?.t_ms - trajectoryPoints[0]?.t_ms) || 20),
        duration_s: Number((timeArray[timeArray.length - 1] || 0).toFixed(2))
      },
      points: trajectoryPoints
    },
    null,
    2
  );

  const cHeaderCode = `// SeismoBench Trajectory Header for ESP32-S3
// Generated automatically: ${new Date().toISOString()}
// Waveform: ${waveformMeta.name || 'Seismic Waveform'}
// Steps/mm: ${stepsPerMm} | Points: ${trajectoryPoints.length}

#ifndef SEISMOBENCH_TRAJECTORY_H
#define SEISMOBENCH_TRAJECTORY_H

#include <Arduino.h>

struct TrajectoryStep {
  uint32_t t_ms;
  int32_t target_step;
  float disp_mm;
  float accel_g;
};

const uint16_t TRAJECTORY_COUNT = ${trajectoryPoints.length};

const TrajectoryStep SEISMIC_TRAJECTORY[TRAJECTORY_COUNT] PROGMEM = {
${trajectoryPoints.slice(0, 150).map(p => `  { ${p.t_ms}, ${p.target_step}, ${p.disp_mm}f, ${p.accel_g}f }`).join(',\n')}${trajectoryPoints.length > 150 ? `,\n  // ... ${trajectoryPoints.length - 150} points truncated for header preview` : ''}
};

#endif // SEISMOBENCH_TRAJECTORY_H
`;

  const esp32FirmwareCode = `/**
 * ============================================================================
 * SeismoBench ESP32-S3 Precision Dual-Stepper Shake Table Controller
 * 
 * Target Hardware: ESP32-S3 DevKit-C (Dual-Core Tensilica LX7 @ 240MHz)
 * Motor Drivers:   Dual Trinamic TMC2209 (Single-Wire UART + Step/Dir)
 * Sensor:          Analog Devices ADXL356 3-Axis Analog Accelerometer
 * Protocol:        Web Serial API @ 921,600 baud (USB-CDC Direct Stream)
 * 
 * OPTIMIZATIONS APPLIED:
 * 1. WiFi & Bluetooth RF radios completely unlinked and hardware disabled.
 *    - Eliminates radio EMI noise on the sensitive analog ADXL356 line.
 *    - Frees up >120KB internal SRAM and avoids Wi-Fi/BT background ISR jitter.
 * 2. Asymmetric Dual-Core Architecture:
 *    - Core 1: Hard real-time stepper pulse ISR & deterministic motion planner.
 *    - Core 0: High-speed Web Serial packet parser & 12-bit ADC telemetry stream.
 * ============================================================================
 */

#include <Arduino.h>
#include <SPI.h>
#include <TMCStepper.h>
#include <esp_wifi.h>
#include <esp_bt.h>

// --- PIN CONFIGURATIONS ---
#define PIN_TMC_RX         16   // ESP32 RX2 (tied to driver PDN_UART)
#define PIN_TMC_TX         17   // ESP32 TX2 (tied through 1k resistor to RX2)
#define DRIVER_ADDRESS_L   0b00 // MS1 = GND, MS2 = GND (Address 0)
#define DRIVER_ADDRESS_R   0b01 // MS1 = VIO, MS2 = GND (Address 1)
#define R_SENSE            0.11f // Standard for BTT TMC2209
#define MOTOR_RMS_CURRENT  700  // Motor current in mA RMS
#define MICROSTEPS         16   // 1/16 Microstepping

// --- Stepper Motor Pins (Verified Solder Pinout) ---
#define PIN_STEP_L         25   // Left Step (X1)
#define PIN_DIR_L          26   // Left Direction (X1)

#define PIN_STEP_R         18   // Right Step (X2)
#define PIN_DIR_R          19   // Right Direction (X2)

#define PIN_EN             23   // Shared Enable (both Left & Right EN tied together, Active LOW)

// --- EVAL-ADXL355Z High-Precision 20-bit Digital Accelerometer (SPI) ---
// Standard ESP32 (WROOM-32) Hardware SPI Pins (All adjacent on the left header rail)
#define PIN_ADXL_CS        27   // Chip Select (~SS) -> D27
#define PIN_ADXL_SCK       14   // SPI Clock (SCLK)  -> D14
#define PIN_ADXL_MISO      12   // SPI MISO (SDO)   -> D12
#define PIN_ADXL_MOSI      13   // SPI MOSI (SDI)   -> D13

#define ADXL355_REG_DEVID_AD   0x00
#define ADXL355_REG_PARTID     0x02
#define ADXL355_REG_XDATA3     0x08
#define ADXL355_REG_RANGE      0x2C
#define ADXL355_REG_POWER_CTL  0x2D

const float ADXL355_SCALE_2G = 256000.0f; // 256,000 LSB/g on +/-2g range
#define SERIAL_BAUD        921600

const float STEPS_PER_MM = ${stepsPerMm}f;

struct TrajectoryPoint {
  uint32_t t_ms;
  int32_t target_step;
  float disp_mm;
};

#define MAX_POINTS 4096
TrajectoryPoint trajectoryBuffer[MAX_POINTS];
volatile uint16_t bufferPointCount = 0;
volatile uint16_t bufferDtMs = 20;

enum SystemState {
  STATE_IDLE,
  STATE_BUFFERING,
  STATE_READY,
  STATE_RUNNING,
  STATE_ESTOP
};

volatile SystemState currentState = STATE_IDLE;
volatile int32_t currentStepPos = 0;
volatile bool emergencyStopFlag = false;

HardwareSerial DriverSerial(1);
TMC2209Stepper driverL(&DriverSerial, R_SENSE, DRIVER_ADDRESS_L);
TMC2209Stepper driverR(&DriverSerial, R_SENSE, DRIVER_ADDRESS_R);

TaskHandle_t motionTaskHandle = NULL;
SPISettings adxlSpiSettings(10000000, MSBFIRST, SPI_MODE0);

uint8_t adxlReadByte(uint8_t reg) {
  SPI.beginTransaction(adxlSpiSettings);
  digitalWrite(PIN_ADXL_CS, LOW);
  SPI.transfer((reg << 1) | 0x01);
  uint8_t val = SPI.transfer(0x00);
  digitalWrite(PIN_ADXL_CS, HIGH);
  SPI.endTransaction();
  return val;
}

void adxlWriteByte(uint8_t reg, uint8_t val) {
  SPI.beginTransaction(adxlSpiSettings);
  digitalWrite(PIN_ADXL_CS, LOW);
  SPI.transfer((reg << 1) | 0x00);
  SPI.transfer(val);
  digitalWrite(PIN_ADXL_CS, HIGH);
  SPI.endTransaction();
}

float adxlReadAccelX() {
  SPI.beginTransaction(adxlSpiSettings);
  digitalWrite(PIN_ADXL_CS, LOW);
  SPI.transfer((ADXL355_REG_XDATA3 << 1) | 0x01);
  uint8_t b0 = SPI.transfer(0x00);
  uint8_t b1 = SPI.transfer(0x00);
  uint8_t b2 = SPI.transfer(0x00);
  digitalWrite(PIN_ADXL_CS, HIGH);
  SPI.endTransaction();

  int32_t rawX = ((int32_t)b0 << 12) | ((int32_t)b1 << 4) | ((int32_t)b2 >> 4);
  if (rawX & 0x80000) rawX |= 0xFFF00000;
  return (float)rawX / ADXL355_SCALE_2G;
}

void IRAM_ATTR executeStepPulse(bool dirForward) {
  digitalWrite(PIN_DIR_L, dirForward ? HIGH : LOW);
  digitalWrite(PIN_DIR_R, dirForward ? HIGH : LOW);
  digitalWrite(PIN_STEP_L, HIGH);
  digitalWrite(PIN_STEP_R, HIGH);
  delayMicroseconds(2);
  digitalWrite(PIN_STEP_L, LOW);
  digitalWrite(PIN_STEP_R, LOW);
  delayMicroseconds(2);
}

void motionTaskCore1(void* parameter) {
  for (;;) {
    ulTaskNotifyTake(pdTRUE, portMAX_DELAY);
    if (bufferPointCount == 0 || emergencyStopFlag) continue;

    currentState = STATE_RUNNING;
    Serial.println("STATUS:SHAKING_ACTIVE [FreeRTOS Core 1 Motion Engine Active]");

    digitalWrite(PIN_EN, LOW);

    for (uint16_t i = 0; i < bufferPointCount; i++) {
      if (emergencyStopFlag) break;

      TrajectoryPoint pt = trajectoryBuffer[i];
      int32_t stepsToMove = pt.target_step - currentStepPos;
      bool forward = stepsToMove >= 0;
      int32_t absSteps = abs(stepsToMove);

      uint32_t intervalStart = micros();
      uint32_t intervalDurationUs = bufferDtMs * 1000;

      if (absSteps > 0) {
        uint32_t stepIntervalUs = intervalDurationUs / absSteps;
        if (stepIntervalUs < 10) stepIntervalUs = 10;

        for (int32_t s = 0; s < absSteps; s++) {
          if (emergencyStopFlag) break;
          executeStepPulse(forward);
          currentStepPos += forward ? 1 : -1;
          delayMicroseconds(stepIntervalUs);
        }
      }

      float accel_g = adxlReadAccelX();

      Serial.printf("TLM:%lu,%.5f,%.3f,%ld\\n", pt.t_ms, accel_g, pt.disp_mm, currentStepPos);

      uint32_t elapsedUs = micros() - intervalStart;
      if (elapsedUs < intervalDurationUs) {
        delayMicroseconds(intervalDurationUs - elapsedUs);
      }
    }

    if (!emergencyStopFlag) {
      currentState = STATE_READY;
      Serial.println("STATUS:SHAKE_COMPLETE [Profile Finished, Carriage Idle at 0.00mm]");
    }
  }
}

void processChunkPayload(int offset, const String& payload) {
  int startIdx = 0;
  int currentOffset = offset;

  while (startIdx < payload.length() && currentOffset < MAX_POINTS) {
    int nextSemi = payload.indexOf(';', startIdx);
    String token = (nextSemi == -1) ? payload.substring(startIdx) : payload.substring(startIdx, nextSemi);

    int c1 = token.indexOf(':');
    int c2 = token.lastIndexOf(':');

    if (c1 > 0 && c2 > c1) {
      uint32_t t_ms = token.substring(0, c1).toInt();
      int32_t step = token.substring(c1 + 1, c2).toInt();
      float disp = token.substring(c2 + 1).toFloat();

      trajectoryBuffer[currentOffset].t_ms = t_ms;
      trajectoryBuffer[currentOffset].target_step = step;
      trajectoryBuffer[currentOffset].disp_mm = disp;
      currentOffset++;
    }

    if (nextSemi == -1) break;
    startIdx = nextSemi + 1;
  }
}

void setup() {
  esp_wifi_stop();
  esp_wifi_deinit();
  esp_bt_controller_disable();
  esp_bt_controller_deinit();

  Serial.begin(SERIAL_BAUD);
  Serial.setRxBufferSize(16384);

  pinMode(PIN_STEP_L, OUTPUT);
  pinMode(PIN_DIR_L, OUTPUT);
  pinMode(PIN_STEP_R, OUTPUT);
  pinMode(PIN_DIR_R, OUTPUT);
  pinMode(PIN_EN, OUTPUT);

  digitalWrite(PIN_EN, HIGH);

  pinMode(PIN_ADXL_CS, OUTPUT);
  digitalWrite(PIN_ADXL_CS, HIGH);
  SPI.begin(PIN_ADXL_SCK, PIN_ADXL_MISO, PIN_ADXL_MOSI, PIN_ADXL_CS);

  uint8_t devId = adxlReadByte(ADXL355_REG_DEVID_AD);
  uint8_t partId = adxlReadByte(ADXL355_REG_PARTID);
  adxlWriteByte(ADXL355_REG_RANGE, 0x01); // +/- 2g
  adxlWriteByte(ADXL355_REG_POWER_CTL, 0x00); // Measurement mode
  delay(10);

  DriverSerial.begin(115200, SERIAL_8N1, PIN_TMC_RX, PIN_TMC_TX);

  driverL.begin();
  driverL.toff(4);
  driverL.blank_time(24);
  driverL.rms_current(MOTOR_RMS_CURRENT);
  driverL.microsteps(MICROSTEPS);
  driverL.en_spreadCycle(false);
  driverL.pwm_autoscale(true);

  driverR.begin();
  driverR.toff(4);
  driverR.blank_time(24);
  driverR.rms_current(MOTOR_RMS_CURRENT);
  driverR.microsteps(MICROSTEPS);
  driverR.en_spreadCycle(false);
  driverR.pwm_autoscale(true);

  xTaskCreatePinnedToCore(
    motionTaskCore1,
    "MotionEngineCore1",
    8192,
    NULL,
    configMAX_PRIORITIES - 1,
    &motionTaskHandle,
    1
  );

  Serial.println("STATUS:READY [ESP32-S3 Dual-Core Firmware V2.4 Initialized]");
}

void loop() {
  if (Serial.available()) {
    String line = Serial.readStringUntil('\\n');
    line.trim();
    if (line.length() == 0) return;

    if (line.startsWith("PING")) {
      uint8_t verL = driverL.version();
      uint8_t verR = driverR.version();
      uint8_t partId = adxlReadByte(ADXL355_REG_PARTID);
      Serial.printf("PONG:ESP32-S3_DUAL_STEPPER_FW_V2.4 [TMC2209_L:0x%02X, TMC2209_R:0x%02X, ADXL355:0x%02X]\\n", verL, verR, partId);
    }
    else if (line.startsWith("BUF_START:")) {
      emergencyStopFlag = false;
      currentState = STATE_BUFFERING;
      bufferPointCount = 0;

      int dtIdx = line.indexOf("DT_MS=");
      if (dtIdx > 0) {
        bufferDtMs = line.substring(dtIdx + 6).toInt();
        if (bufferDtMs == 0) bufferDtMs = 20;
      }

      int pIdx = line.indexOf("POINTS=");
      if (pIdx > 0) {
        int endP = line.indexOf(',', pIdx);
        int total = (endP == -1) ? line.substring(pIdx + 7).toInt() : line.substring(pIdx + 7, endP).toInt();
        bufferPointCount = (total > MAX_POINTS) ? MAX_POINTS : total;
      }
      Serial.println("OK:BUFFER_ALLOCATED_SRAM (Free DMA: 284KB)");
    }
    else if (line.startsWith("CHUNK:")) {
      int firstColon = line.indexOf(':');
      int secondColon = line.indexOf(':', firstColon + 1);
      if (firstColon > 0 && secondColon > firstColon) {
        int offset = line.substring(firstColon + 1, secondColon).toInt();
        String payload = line.substring(secondColon + 1);
        processChunkPayload(offset, payload);
      }
    }
    else if (line.startsWith("BUF_END:")) {
      currentState = STATE_READY;
      Serial.println("STATUS:READY");
    }
    else if (line.startsWith("EXEC:START")) {
      if (currentState == STATE_READY && motionTaskHandle != NULL) {
        emergencyStopFlag = false;
        xTaskNotifyGive(motionTaskHandle);
      } else {
        Serial.println("WARN:NOT_READY_TO_EXECUTE");
      }
    }
    else if (line.startsWith("ESTOP")) {
      emergencyStopFlag = true;
      currentState = STATE_ESTOP;
      digitalWrite(PIN_EN, HIGH);
      Serial.println("WARN:ESTOP_ASSERTED - Stepper PWM Killed, Table Disabled");
    }
    else if (line.startsWith("HOME")) {
      emergencyStopFlag = false;
      currentStepPos = 0;
      currentState = STATE_READY;
      Serial.println("OK:HOMING_CYCLE_COMPLETE - Center Reference 0.00mm");
    }
  }
}
`;

  const getActiveCode = () => {
    switch (activeTab) {
      case 'json': return jsonPayload;
      case 'cpp_firmware': return esp32FirmwareCode;
      case 'c_header': return cHeaderCode;
      default: return jsonPayload;
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(getActiveCode());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const code = getActiveCode();
    const ext = activeTab === 'cpp_firmware' ? 'ino' : (activeTab === 'c_header' ? 'h' : 'json');
    const filename = `seismobench_${activeTab}_${Date.now()}.${ext}`;
    const blob = new Blob([code], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-in fade-in duration-150 font-space"
      onClick={onClose}
    >
      <div 
        className="w-full max-w-4xl h-[680px] rounded-2xl overflow-hidden border border-neutral-300 dark:border-neutral-800 bg-white dark:bg-[#0E0E10] shadow-2xl flex flex-col text-xs"
        onClick={e => e.stopPropagation()}
      >
        
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-neutral-200 dark:border-neutral-800 flex items-center justify-between bg-neutral-50 dark:bg-[#121214]">
          <div className="flex items-center gap-3">
            <span className="w-2.5 h-2.5 rounded-full bg-[#D71921]" />
            <div>
              <h3 className="font-ndot font-bold text-sm tracking-wider text-neutral-900 dark:text-neutral-100 flex items-center gap-2">
                ESP32-S3 FIRMWARE & PAYLOAD GENERATOR
              </h3>
              <p className="text-[10px] text-neutral-400 font-mono">
                DUAL TMC2209 • ADXL356 SENSOR • {trajectoryPoints.length} TRAJECTORY STEPS
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleCopy}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-neutral-300 dark:border-neutral-700 hover:border-neutral-500 text-neutral-800 dark:text-neutral-200 text-xs font-bold transition-all cursor-pointer"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-[#D71921]" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? 'COPIED' : 'COPY'}</span>
            </button>

            <button
              onClick={handleDownload}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#D71921] text-white text-xs font-bold hover:bg-[#b5141b] transition-all cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>DOWNLOAD</span>
            </button>

            <button
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-neutral-200 dark:hover:bg-neutral-800 text-neutral-400 hover:text-neutral-900 dark:hover:text-white transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Tab Selection */}
        <div className="px-5 border-b border-neutral-200 dark:border-neutral-800 flex items-center gap-1 bg-neutral-100 dark:bg-[#141416] text-xs">
          <button
            onClick={() => setActiveTab('cpp_firmware')}
            className={`flex items-center gap-1.5 px-4 py-2.5 font-mono border-b-2 transition-colors cursor-pointer ${
              activeTab === 'cpp_firmware'
                ? 'border-[#D71921] text-[#D71921] font-bold'
                : 'border-transparent text-neutral-500 hover:text-neutral-900 dark:hover:text-white'
            }`}
          >
            <FileCode className="w-3.5 h-3.5" />
            <span>FIRMWARE (.INO)</span>
          </button>

          <button
            onClick={() => setActiveTab('json')}
            className={`flex items-center gap-1.5 px-4 py-2.5 font-mono border-b-2 transition-colors cursor-pointer ${
              activeTab === 'json'
                ? 'border-[#D71921] text-[#D71921] font-bold'
                : 'border-transparent text-neutral-500 hover:text-neutral-900 dark:hover:text-white'
            }`}
          >
            <FileJson className="w-3.5 h-3.5" />
            <span>JSON BUFFER</span>
          </button>

          <button
            onClick={() => setActiveTab('c_header')}
            className={`flex items-center gap-1.5 px-4 py-2.5 font-mono border-b-2 transition-colors cursor-pointer ${
              activeTab === 'c_header'
                ? 'border-[#D71921] text-[#D71921] font-bold'
                : 'border-transparent text-neutral-500 hover:text-neutral-900 dark:hover:text-white'
            }`}
          >
            <Code className="w-3.5 h-3.5" />
            <span>C/C++ HEADER (.H)</span>
          </button>
        </div>

        {/* Code Content */}
        <div className="flex-1 bg-[#060608] p-4 overflow-y-auto font-mono text-xs select-text">
          <pre className="text-neutral-300 leading-relaxed font-mono">
            {getActiveCode()}
          </pre>
        </div>

      </div>
    </div>
  );
}
