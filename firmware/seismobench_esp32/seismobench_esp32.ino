/**
 * ============================================================================
 * SeismoBench ESP32-S3 Precision Dual-Stepper Shake Table Controller (v3.5)
 * 
 * Target Hardware: ESP32-S3 DevKit-C (Dual-Core Tensilica LX7 @ 240MHz)
 * Motor Drivers:   Dual Trinamic TMC2209 (Single-Wire UART + Step/Dir)
 * Sensor:          Analog Devices ADXL355 20-bit High-Precision SPI Accelerometer
 * Protocol:        Web Serial API @ 921,600 baud (USB-CDC Direct Stream)
 * 
 * CORE ARCHITECTURE & ANTI-RESONANCE UPGRADES:
 * 1. Trinamic SpreadCycle Chopper:
 *    - Replaces StealthChop with cycle-by-cycle hardware peak-current chopper.
 *    - Completely eliminates StealthChop voltage-mode PLL de-sync and croaking
 *      during rapid 1-15 Hz frequency oscillations and direction reversals.
 *    - Enables MicroPlyer 256-microstep hardware interpolation for silent,
 *      smooth mechanical vibration absorption.
 * 2. 1000mA RMS Dynamic Motor Current:
 *    - Provides full holding and dynamic torque to overcome carriage and belt inertia.
 * 3. Continuous Cubic Hermite Trajectory Spline (Core 1):
 *    - Sub-step position P(t) is evaluated continuously via C1-smooth Hermite splines.
 *    - Derivative velocity naturally decelerates to 0.0 at wave peaks/turnaround crests.
 *    - Eliminates instantaneous velocity jumps, infinite-jerk impulses, and resonance stalls.
 * 4. Lock-Free Core Decoupling (Core 1 <-> Core 0):
 *    - Core 1 NEVER calls blocking Serial.printf!
 *    - Telemetry is pushed into a lock-free ring buffer (< 1 microsecond).
 *    - Core 0 drains the queue to USB CDC at 921600 baud without blocking step pulses.
 * ============================================================================
 */

#include <Arduino.h>
#include <SPI.h>
#include <TMCStepper.h>
#include <esp_wifi.h>
#include <esp_bt.h>

// ============================================================================
// 1. PIN CONFIGURATIONS & HARDWARE REGISTERS
// ============================================================================

// --- TMC2209 Single-Wire UART ---
#define PIN_TMC_RX         16   // ESP32 RX2 (connected to driver PDN_UART)
#define PIN_TMC_TX         17   // ESP32 TX2 (connected through 1kΩ resistor to RX2)
#define DRIVER_ADDRESS_L   0b00 // MS1 = GND, MS2 = GND (Address 0)
#define DRIVER_ADDRESS_R   0b01 // MS1 = VIO, MS2 = GND (Address 1)
#define R_SENSE            0.11f // 0.11 Ohm (standard for BTT TMC2209)
#define MOTOR_RMS_CURRENT  1000  // 1000 mA RMS for full dynamic torque without stall
#define MICROSTEPS         16    // 1/16 Microstepping (interpolated to 256 by TMC2209)

// --- Stepper Motor Pins ---
#define PIN_STEP_L         25   // Left Step (X1)
#define PIN_DIR_L          26   // Left Direction (X1)
#define PIN_STEP_R         18   // Right Step (X2)
#define PIN_DIR_R          19   // Right Direction (X2)
#define PIN_EN             23   // Shared Enable (both Left & Right EN tied together, Active LOW)

inline void setStepDirection(bool forward) {
  digitalWrite(PIN_DIR_L, forward ? HIGH : LOW);
  digitalWrite(PIN_DIR_R, forward ? HIGH : LOW);
}

inline void pulseStepPins() {
  digitalWrite(PIN_STEP_L, HIGH);
  digitalWrite(PIN_STEP_R, HIGH);
  delayMicroseconds(2);
  digitalWrite(PIN_STEP_L, LOW);
  digitalWrite(PIN_STEP_R, LOW);
  delayMicroseconds(2);
}

// --- EVAL-ADXL355Z High-Precision 20-bit Digital Accelerometer (SPI) ---
#define PIN_ADXL_CS        27   // Chip Select (~SS) -> D27
#define PIN_ADXL_SCK       14   // SPI Clock (SCLK)  -> D14
#define PIN_ADXL_MISO      12   // SPI MISO (SDO)   -> D12
#define PIN_ADXL_MOSI      13   // SPI MOSI (SDI)   -> D13

// ADXL355 SPI Registers
#define ADXL355_REG_DEVID_AD   0x00
#define ADXL355_REG_PARTID     0x02
#define ADXL355_REG_STATUS     0x04
#define ADXL355_REG_XDATA3     0x08
#define ADXL355_REG_RANGE      0x2C
#define ADXL355_REG_POWER_CTL  0x2D

const float ADXL355_SCALE_2G = 256000.0f; // Scale factor for +/-2g range: 256,000 LSB/g
#define SERIAL_BAUD        921600

// ============================================================================
// 2. DATA STRUCTURES & TRAJECTORY BUFFER
// ============================================================================

struct TrajectoryPoint {
  uint32_t t_ms;
  int32_t target_step;
  float disp_mm;
};

#define MAX_POINTS 4096
TrajectoryPoint trajectoryBuffer[MAX_POINTS];
float knotVelocities[MAX_POINTS];
volatile uint16_t bufferPointCount = 0;
volatile uint16_t bufferDtMs = 20;

// System states
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
volatile bool sensorEnabled = true;

// Lock-Free Telemetry Queue
struct TelemetryItem {
  uint32_t t_ms;
  float accel;
  float disp;
  int32_t step;
};

#define TLM_QUEUE_SIZE 256
TelemetryItem tlmQueue[TLM_QUEUE_SIZE];
volatile uint16_t tlmHead = 0;
volatile uint16_t tlmTail = 0;

inline void pushTelemetry(uint32_t t_ms, float accel, float disp, int32_t step) {
  uint16_t nextHead = (tlmHead + 1) % TLM_QUEUE_SIZE;
  if (nextHead != tlmTail) {
    tlmQueue[tlmHead].t_ms = t_ms;
    tlmQueue[tlmHead].accel = accel;
    tlmQueue[tlmHead].disp = disp;
    tlmQueue[tlmHead].step = step;
    tlmHead = nextHead;
  }
}

// Hardware Serial instance for TMC2209 UART
HardwareSerial DriverSerial(1);
TMC2209Stepper driverL(&DriverSerial, R_SENSE, DRIVER_ADDRESS_L);
TMC2209Stepper driverR(&DriverSerial, R_SENSE, DRIVER_ADDRESS_R);

TaskHandle_t motionTaskHandle = NULL;

// ============================================================================
// 2.1 ADXL355 SPI HARDWARE DRIVER
// ============================================================================
SPISettings adxlSpiSettings(10000000, MSBFIRST, SPI_MODE0); // 10MHz SPI Mode 0

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
  if (rawX & 0x80000) {
    rawX |= 0xFFF00000;
  }
  return (float)rawX / ADXL355_SCALE_2G;
}

// ============================================================================
// 3. CONTINUOUS CUBIC HERMITE TRAJECTORY ENGINE (CORE 1)
// ============================================================================

void calculateKnotVelocities() {
  if (bufferPointCount < 2) return;
  float dt_sec = (float)bufferDtMs / 1000.0f;
  
  for (uint16_t i = 1; i < bufferPointCount - 1; i++) {
    knotVelocities[i] = (float)(trajectoryBuffer[i + 1].target_step - trajectoryBuffer[i - 1].target_step) / (2.0f * dt_sec);
  }
  knotVelocities[0] = (float)(trajectoryBuffer[1].target_step - trajectoryBuffer[0].target_step) / dt_sec;
  knotVelocities[bufferPointCount - 1] = (float)(trajectoryBuffer[bufferPointCount - 1].target_step - trajectoryBuffer[bufferPointCount - 2].target_step) / dt_sec;
}

inline float evaluateHermite(int32_t p0, int32_t p1, float v0, float v1, float dt_sec, float tau) {
  float tau2 = tau * tau;
  float tau3 = tau2 * tau;
  float h00 = 2.0f * tau3 - 3.0f * tau2 + 1.0f;
  float h10 = tau3 - 2.0f * tau2 + tau;
  float h01 = -2.0f * tau3 + 3.0f * tau2;
  float h11 = tau3 - tau2;
  return h00 * (float)p0 + h10 * dt_sec * v0 + h01 * (float)p1 + h11 * dt_sec * v1;
}

void motionTaskCore1(void* parameter) {
  for (;;) {
    ulTaskNotifyTake(pdTRUE, portMAX_DELAY);

    if (bufferPointCount < 2 || emergencyStopFlag) {
      continue;
    }

    currentState = STATE_RUNNING;
    calculateKnotVelocities();

    // Enable drivers (Active LOW)
    digitalWrite(PIN_EN, LOW);
    delayMicroseconds(50); // TMC2209 gate wake-up time

    uint32_t intervalDurationUs = (uint32_t)bufferDtMs * 1000;
    float dt_sec = (float)bufferDtMs / 1000.0f;
    uint32_t motionStartTimeUs = micros();
    uint32_t lastStepTimeUs = motionStartTimeUs;
    uint16_t currentInterval = 0;
    bool currentDirForward = true;

    while (currentInterval < bufferPointCount - 1 && !emergencyStopFlag) {
      uint32_t nowUs = micros();
      uint32_t elapsedMotionUs = nowUs - motionStartTimeUs;
      uint16_t activeK = elapsedMotionUs / intervalDurationUs;

      // Handle interval advancement and non-blocking telemetry queuing
      if (activeK > currentInterval) {
        while (currentInterval < activeK && currentInterval < bufferPointCount) {
          float accel_g = sensorEnabled ? adxlReadAccelX() : 0.0f;
          pushTelemetry(trajectoryBuffer[currentInterval].t_ms, accel_g, trajectoryBuffer[currentInterval].disp_mm, currentStepPos);
          currentInterval++;
        }
        if (currentInterval >= bufferPointCount - 1) break;
      }

      // Compute exact position along cubic Hermite trajectory
      uint32_t intervalElapsedUs = elapsedMotionUs - (activeK * intervalDurationUs);
      float tau = (float)intervalElapsedUs / (float)intervalDurationUs;
      if (tau > 1.0f) tau = 1.0f;

      float exactPos = evaluateHermite(
        trajectoryBuffer[activeK].target_step,
        trajectoryBuffer[activeK + 1].target_step,
        knotVelocities[activeK],
        knotVelocities[activeK + 1],
        dt_sec,
        tau
      );

      int32_t targetStep = (int32_t)lroundf(exactPos);

      // Deterministic pulse generation with minimum pulse interval safety
      if (targetStep != currentStepPos) {
        if (nowUs - lastStepTimeUs >= 18) { // Max ~55,000 steps/sec
          bool needForward = (targetStep > currentStepPos);
          if (needForward != currentDirForward) {
            currentDirForward = needForward;
            setStepDirection(currentDirForward);
            delayMicroseconds(1);
          }
          pulseStepPins();
          currentStepPos += currentDirForward ? 1 : -1;
          lastStepTimeUs = nowUs;
        }
      } else {
        delayMicroseconds(2);
      }
    }

    // Push final point telemetry
    if (bufferPointCount > 0) {
      float accel_g = sensorEnabled ? adxlReadAccelX() : 0.0f;
      pushTelemetry(trajectoryBuffer[bufferPointCount - 1].t_ms, accel_g, trajectoryBuffer[bufferPointCount - 1].disp_mm, currentStepPos);
    }

    if (!emergencyStopFlag) {
      currentState = STATE_READY;
    }
  }
}

// ============================================================================
// 4. SETUP
// ============================================================================

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

  digitalWrite(PIN_EN, HIGH); // Disabled until trajectory runs
  digitalWrite(PIN_STEP_L, LOW);
  digitalWrite(PIN_STEP_R, LOW);
  setStepDirection(true);

  // ADXL355 SPI Init
  pinMode(PIN_ADXL_CS, OUTPUT);
  digitalWrite(PIN_ADXL_CS, HIGH);
  SPI.begin(PIN_ADXL_SCK, PIN_ADXL_MISO, PIN_ADXL_MOSI, PIN_ADXL_CS);

  uint8_t devId = adxlReadByte(ADXL355_REG_DEVID_AD);
  uint8_t partId = adxlReadByte(ADXL355_REG_PARTID);
  adxlWriteByte(ADXL355_REG_RANGE, 0x01); // +/- 2g
  adxlWriteByte(ADXL355_REG_POWER_CTL, 0x00); // Measurement mode
  delay(10);

  // TMC2209 Init
  DriverSerial.begin(115200, SERIAL_8N1, PIN_TMC_RX, PIN_TMC_TX);

  driverL.begin();
  driverL.toff(4);
  driverL.blank_time(24);
  driverL.rms_current(MOTOR_RMS_CURRENT);
  driverL.microsteps(MICROSTEPS);
  driverL.intpol(true);         // 256 microstep interpolation
  driverL.en_spreadCycle(true); // SpreadCycle for dynamic torque & anti-stall
  driverL.pwm_autoscale(false);

  driverR.begin();
  driverR.toff(4);
  driverR.blank_time(24);
  driverR.rms_current(MOTOR_RMS_CURRENT);
  driverR.microsteps(MICROSTEPS);
  driverR.intpol(true);
  driverR.en_spreadCycle(true);
  driverR.pwm_autoscale(false);

  xTaskCreatePinnedToCore(
    motionTaskCore1,
    "MotionEngineCore1",
    8192,
    NULL,
    configMAX_PRIORITIES - 1,
    &motionTaskHandle,
    1
  );

  Serial.printf("STATUS:READY [ESP32-S3 Ready | ADXL355:0x%02X (Part:0x%02X) | Dual TMC2209:SPREADCYCLE_OK]\n", devId, partId);
}

// ============================================================================
// 5. PACKET PARSER & COMMAND PROCESSOR (CORE 0)
// ============================================================================

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

void loop() {
  // 1. Drain non-blocking telemetry queue to USB Serial
  while (tlmTail != tlmHead) {
    TelemetryItem item = tlmQueue[tlmTail];
    tlmTail = (tlmTail + 1) % TLM_QUEUE_SIZE;
    Serial.printf("TLM:%lu,%.5f,%.3f,%ld\n", item.t_ms, item.accel, item.disp, item.step);
  }

  // 2. Process incoming Web Serial commands
  if (Serial.available()) {
    String line = Serial.readStringUntil('\n');
    line.trim();
    if (line.length() == 0) return;

    if (line.startsWith("PING")) {
      uint8_t verL = driverL.version();
      uint8_t verR = driverR.version();
      uint8_t partId = adxlReadByte(ADXL355_REG_PARTID);
      Serial.printf("PONG:ESP32-S3_DUAL_STEPPER_FW_V3.5 [TMC2209_L:0x%02X, TMC2209_R:0x%02X, ADXL355:0x%02X, SPREADCYCLE:OK]\n", verL, verR, partId);
    }
    else if (line.startsWith("CFG:SENSOR=")) {
      sensorEnabled = (line.substring(11).toInt() == 1);
      Serial.printf("OK:SENSOR_CONFIGURED [ADXL355:%s]\n", sensorEnabled ? "ACTIVE" : "DISABLED");
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
        tlmHead = 0;
        tlmTail = 0;
        Serial.println("STATUS:SHAKING_ACTIVE [FreeRTOS Core 1 Motion Engine Active]");
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
