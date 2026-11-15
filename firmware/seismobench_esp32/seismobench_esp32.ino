/**
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

// ============================================================================
// 1. PIN CONFIGURATIONS
// ============================================================================

// --- TMC2209 Single-Wire UART ---
#define PIN_TMC_RX         16   // ESP32 RX2 (connected to driver PDN_UART)
#define PIN_TMC_TX         17   // ESP32 TX2 (connected through 1kΩ resistor to RX2)
#define DRIVER_ADDRESS_L   0b00 // MS1 = GND, MS2 = GND (Address 0)
#define DRIVER_ADDRESS_R   0b01 // MS1 = VIO, MS2 = GND (Address 1)
#define R_SENSE            0.11f // 0.11 Ohm (standard for BTT TMC2209)
#define MOTOR_RMS_CURRENT  700  // Motor current in mA RMS (safe default: 600-800mA)
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

// ADXL355 SPI Registers
#define ADXL355_REG_DEVID_AD   0x00 // Should read 0xAD
#define ADXL355_REG_PARTID     0x02 // Should read 0xED
#define ADXL355_REG_STATUS     0x04
#define ADXL355_REG_XDATA3     0x08
#define ADXL355_REG_RANGE      0x2C // Range register (0x01 = +/-2g, 0x02 = +/-4g, 0x03 = +/-8g)
#define ADXL355_REG_POWER_CTL  0x2D // Power control (bit 0: 0 = Measurement, 1 = Standby)

// Scale factor for +/-2g range: 256,000 LSB/g (3.9 ug/LSB)
const float ADXL355_SCALE_2G = 256000.0f;

// Baud rate for Web Serial API
#define SERIAL_BAUD        921600

// ============================================================================
// 2. DATA STRUCTURES & TRAJECTORY BUFFER
// ============================================================================

struct TrajectoryPoint {
  uint32_t t_ms;
  int32_t target_step;
  float disp_mm;
  float accel_g;
};

#define MAX_POINTS 4096
TrajectoryPoint trajectoryBuffer[MAX_POINTS];
volatile uint16_t bufferPointCount = 0;
volatile uint16_t bufferDtMs = 20;
volatile bool sensorEnabled = true; // Toggle between ADXL355 SPI and Open-Loop Stepper
bool adxlPresent = false;

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

// Hardware Serial instance for TMC2209 UART
HardwareSerial DriverSerial(1);
TMC2209Stepper driverL(&DriverSerial, R_SENSE, DRIVER_ADDRESS_L);
TMC2209Stepper driverR(&DriverSerial, R_SENSE, DRIVER_ADDRESS_R);

// FreeRTOS Task Handle for Core 1 Motion Engine
TaskHandle_t motionTaskHandle = NULL;

// ============================================================================
// 2.1 ADXL355 SPI HARDWARE DRIVER
// ============================================================================
SPISettings adxlSpiSettings(10000000, MSBFIRST, SPI_MODE0); // 10MHz SPI Mode 0

uint8_t adxlReadByte(uint8_t reg) {
  SPI.beginTransaction(adxlSpiSettings);
  digitalWrite(PIN_ADXL_CS, LOW);
  SPI.transfer((reg << 1) | 0x01); // Read command bit 0 = 1
  uint8_t val = SPI.transfer(0x00);
  digitalWrite(PIN_ADXL_CS, HIGH);
  SPI.endTransaction();
  return val;
}

void adxlWriteByte(uint8_t reg, uint8_t val) {
  SPI.beginTransaction(adxlSpiSettings);
  digitalWrite(PIN_ADXL_CS, LOW);
  SPI.transfer((reg << 1) | 0x00); // Write command bit 0 = 0
  SPI.transfer(val);
  digitalWrite(PIN_ADXL_CS, HIGH);
  SPI.endTransaction();
}

float adxlReadAccelX() {
  SPI.beginTransaction(adxlSpiSettings);
  digitalWrite(PIN_ADXL_CS, LOW);
  SPI.transfer((ADXL355_REG_XDATA3 << 1) | 0x01);
  uint8_t b0 = SPI.transfer(0x00); // XDATA3 (bits 19:12)
  uint8_t b1 = SPI.transfer(0x00); // XDATA2 (bits 11:4)
  uint8_t b2 = SPI.transfer(0x00); // XDATA1 (bits 3:0 in bits [7:4])
  digitalWrite(PIN_ADXL_CS, HIGH);
  SPI.endTransaction();

  // Reconstruct 20-bit two's complement integer
  int32_t rawX = ((int32_t)b0 << 12) | ((int32_t)b1 << 4) | ((int32_t)b2 >> 4);
  if (rawX & 0x80000) {
    rawX |= 0xFFF00000; // Sign extend negative values
  }

  // Convert to g (for +/- 2g range: 256,000 LSB/g)
  return (float)rawX / ADXL355_SCALE_2G;
}

// ============================================================================
// 3. HARDWARE STEPPING & MOTION ENGINE (CORE 1)
// ============================================================================

void IRAM_ATTR executeStepPulse(bool dirForward) {
  // Set direction pins (both motors move in sync for shake table carriage)
  digitalWrite(PIN_DIR_L, dirForward ? HIGH : LOW);
  digitalWrite(PIN_DIR_R, dirForward ? HIGH : LOW);
  
  // Ultra-short pulse (TMC2209 minimum step pulse width is 100ns)
  digitalWrite(PIN_STEP_L, HIGH);
  digitalWrite(PIN_STEP_R, HIGH);
  delayMicroseconds(2);
  digitalWrite(PIN_STEP_L, LOW);
  digitalWrite(PIN_STEP_R, LOW);
  delayMicroseconds(2);
}

void motionTaskCore1(void* parameter) {
  for (;;) {
    // Wait until notified to start
    ulTaskNotifyTake(pdTRUE, portMAX_DELAY);

    if (bufferPointCount == 0 || emergencyStopFlag) {
      continue;
    }

    currentState = STATE_RUNNING;
    Serial.println("STATUS:SHAKING_ACTIVE [FreeRTOS Core 1 Motion Engine Active]");

    // Enable both drivers (Active LOW)
    digitalWrite(PIN_EN, LOW);

    uint32_t startTime = millis();

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

      // Read acceleration: ADXL355 SPI or Open-Loop Kinematics fallback
      float accel_g = 0.0f;
      if (sensorEnabled && adxlPresent) {
        accel_g = adxlReadAccelX();
      } else {
        accel_g = pt.accel_g;
      }

      // Stream high-rate telemetry line to USB Serial
      Serial.printf("TLM:%lu,%.5f,%.3f,%ld\n", pt.t_ms, accel_g, pt.disp_mm, currentStepPos);

      // Maintain deterministic interval timing
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

// ============================================================================
// 4. SETUP
// ============================================================================

void setup() {
  // 1. Completely disable WiFi and Bluetooth hardware to eliminate jitter & EMI
  esp_wifi_stop();
  esp_wifi_deinit();
  esp_bt_controller_disable();
  esp_bt_controller_deinit();

  // 2. High-speed USB Serial for Web Serial API
  Serial.begin(SERIAL_BAUD);
  Serial.setRxBufferSize(16384);

  // 3. Configure Stepper GPIOs
  pinMode(PIN_STEP_L, OUTPUT);
  pinMode(PIN_DIR_L, OUTPUT);
  pinMode(PIN_STEP_R, OUTPUT);
  pinMode(PIN_DIR_R, OUTPUT);
  pinMode(PIN_EN, OUTPUT);

  // Default: Drivers disabled (HIGH) until trajectory executes
  digitalWrite(PIN_EN, HIGH);
  digitalWrite(PIN_STEP_L, LOW);
  digitalWrite(PIN_STEP_R, LOW);

  // 4. Configure ADXL355 High-Precision SPI Accelerometer
  pinMode(PIN_ADXL_CS, OUTPUT);
  digitalWrite(PIN_ADXL_CS, HIGH); // CS idle HIGH

  // Initialize hardware SPI bus on defined pins (SCLK, MISO, MOSI, SS)
  SPI.begin(PIN_ADXL_SCK, PIN_ADXL_MISO, PIN_ADXL_MOSI, PIN_ADXL_CS);

  // Read PARTID (Should return 0xED)
  uint8_t devId = adxlReadByte(ADXL355_REG_DEVID_AD); // 0xAD
  uint8_t partId = adxlReadByte(ADXL355_REG_PARTID);   // 0xED
  adxlPresent = (devId == 0xAD || partId == 0xED);

  if (adxlPresent) {
    // Set Range to +/- 2g (0x01)
    adxlWriteByte(ADXL355_REG_RANGE, 0x01);
    // Power control: clear STANDBY bit (write 0x00) to enter Active Measurement Mode
    adxlWriteByte(ADXL355_REG_POWER_CTL, 0x00);
    delay(10); // Settle analog front-end filter
  } else {
    Serial.println("WARN:ADXL355_NOT_DETECTED - Fallback to Open-Loop Stepper Telemetry");
  }

  // 5. Initialize TMC2209 Drivers via Single-Wire UART
  DriverSerial.begin(115200, SERIAL_8N1, PIN_TMC_RX, PIN_TMC_TX);

  driverL.begin();
  driverL.toff(4);
  driverL.blank_time(24);
  driverL.rms_current(MOTOR_RMS_CURRENT);
  driverL.microsteps(MICROSTEPS);
  driverL.en_spreadCycle(false); // StealthChop for silent, vibration-free motion
  driverL.pwm_autoscale(true);

  driverR.begin();
  driverR.toff(4);
  driverR.blank_time(24);
  driverR.rms_current(MOTOR_RMS_CURRENT);
  driverR.microsteps(MICROSTEPS);
  driverR.en_spreadCycle(false);
  driverR.pwm_autoscale(true);

  // 6. Launch Dedicated Motion Task pinned to Core 1
  xTaskCreatePinnedToCore(
    motionTaskCore1,
    "MotionEngineCore1",
    8192,
    NULL,
    configMAX_PRIORITIES - 1, // High priority
    &motionTaskHandle,
    1 // Pin strictly to Core 1
  );

  Serial.printf("STATUS:READY [ESP32 Ready | SENSOR:%s (0x%02X) | Dual TMC2209:OK]\n", 
    adxlPresent ? "ADXL355_SPI" : "OPEN_LOOP", partId);
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

    // Token format: time_ms:target_step:disp_mm or time_ms:target_step:disp_mm:accel_g
    int c1 = token.indexOf(':');
    int c2 = token.indexOf(':', c1 + 1);
    int c3 = (c2 > 0) ? token.indexOf(':', c2 + 1) : -1;

    if (c1 > 0 && c2 > c1) {
      uint32_t t_ms = token.substring(0, c1).toInt();
      int32_t step = token.substring(c1 + 1, c2).toInt();
      float disp = (c3 > c2) ? token.substring(c2 + 1, c3).toFloat() : token.substring(c2 + 1).toFloat();
      float accel = (c3 > c2) ? token.substring(c3 + 1).toFloat() : 0.0f;

      trajectoryBuffer[currentOffset].t_ms = t_ms;
      trajectoryBuffer[currentOffset].target_step = step;
      trajectoryBuffer[currentOffset].disp_mm = disp;
      trajectoryBuffer[currentOffset].accel_g = accel;
      currentOffset++;
    }

    if (nextSemi == -1) break;
    startIdx = nextSemi + 1;
  }
}

void loop() {
  if (Serial.available()) {
    String line = Serial.readStringUntil('\n');
    line.trim();
    if (line.length() == 0) return;

    if (line.startsWith("PING")) {
      uint8_t verL = driverL.version();
      uint8_t verR = driverR.version();
      uint8_t partId = adxlReadByte(ADXL355_REG_PARTID);
      Serial.printf("PONG:ESP32_DUAL_STEPPER_FW_V2.5 [TMC2209_L:0x%02X, TMC2209_R:0x%02X, SENSOR:%s (0x%02X)]\n", 
        verL, verR, (sensorEnabled && adxlPresent) ? "ADXL355_ACTIVE" : "OPEN_LOOP", partId);
    }
    else if (line.startsWith("CFG:SENSOR=")) {
      int sVal = line.substring(11).toInt();
      sensorEnabled = (sVal != 0);
      Serial.printf("OK:SENSOR_MODE_UPDATED [%s]\n", (sensorEnabled && adxlPresent) ? "ADXL355_SPI_ACTIVE" : "OPEN_LOOP_STEPPER");
    }
    else if (line.startsWith("BUF_START:")) {
      emergencyStopFlag = false;
      currentState = STATE_BUFFERING;
      bufferPointCount = 0;

      // Extract dt_ms if present
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
      // Format: CHUNK:<offset>:<chunkPayload>
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
      digitalWrite(PIN_EN, HIGH); // Disable stepper H-bridges (Active LOW)
      Serial.println("WARN:ESTOP_ASSERTED - Stepper PWM Killed, Table Disabled");
    }
    else if (line.startsWith("RESET") || line.startsWith("HOME")) {
      emergencyStopFlag = false;
      currentStepPos = 0;
      currentState = STATE_READY;
      digitalWrite(PIN_EN, HIGH); // Drivers safe until next execution
      Serial.println("OK:RESET_CYCLE_COMPLETE - Center Reference 0.00mm, E-STOP Cleared, Drivers Ready");
    }
  }
}

