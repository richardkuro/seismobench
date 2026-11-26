import xml.etree.ElementTree as ET
import xml.dom.minidom

def generate_hardware_drawio():
    mxfile = ET.Element('mxfile', {
        'host': 'app.diagrams.net',
        'modified': '2026-11-26T20:30:00.000Z',
        'agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        'version': '24.7.5',
        'type': 'device'
    })
    
    diagram = ET.SubElement(mxfile, 'diagram', {
        'id': 'seismobench-hardware-architecture',
        'name': 'SeismoBench Hardware Block Diagram'
    })
    
    graph_model = ET.SubElement(diagram, 'mxGraphModel', {
        'dx': '2200',
        'dy': '1400',
        'grid': '1',
        'gridSize': '10',
        'guides': '1',
        'tooltips': '1',
        'connect': '1',
        'arrows': '1',
        'fold': '1',
        'page': '1',
        'pageScale': '1',
        'pageWidth': '2200',
        'pageHeight': '1400',
        'background': '#F8FAFC',
        'math': '0',
        'shadow': '1'
    })
    
    root = ET.SubElement(graph_model, 'root')
    ET.SubElement(root, 'mxCell', {'id': '0'})
    ET.SubElement(root, 'mxCell', {'id': '1', 'parent': '0'})
    
    def add_cell(id_str, val, style, x, y, w, h, parent='1'):
        c = ET.SubElement(root, 'mxCell', {
            'id': id_str,
            'value': val,
            'style': style,
            'vertex': '1',
            'parent': parent
        })
        ET.SubElement(c, 'mxGeometry', {
            'x': str(x),
            'y': str(y),
            'width': str(w),
            'height': str(h),
            'as': 'geometry'
        })
        return c

    def add_edge(id_str, val, style, src_id, tgt_id, pts=None, exitX=None, exitY=None, entryX=None, entryY=None):
        edge_style = style
        if exitX is not None and exitY is not None:
            edge_style += f';exitX={exitX};exitY={exitY};exitDx=0;exitDy=0'
        if entryX is not None and entryY is not None:
            edge_style += f';entryX={entryX};entryY={entryY};entryDx=0;entryDy=0'
            
        edge = ET.SubElement(root, 'mxCell', {
            'id': id_str,
            'value': val,
            'style': edge_style,
            'edge': '1',
            'parent': '1',
            'source': src_id,
            'target': tgt_id
        })
        geo = ET.SubElement(edge, 'mxGeometry', {'relative': '1', 'as': 'geometry'})
        if pts:
            arr = ET.SubElement(geo, 'Array', {'as': 'points'})
            for px, py in pts:
                ET.SubElement(arr, 'mxPoint', {'x': str(px), 'y': str(py)})
        return edge

    # ==========================================
    # STYLES DEFINITION
    # ==========================================
    title_style = 'text;html=1;strokeColor=none;fillColor=none;align=left;verticalAlign=middle;rounded=0;fontFamily=Helvetica;'
    
    # Subsystem Containers
    c_host_style = 'swimlane;html=1;startSize=36;rounded=1;shadow=1;comic=0;labelBackgroundColor=none;strokeWidth=2;fillColor=#F1F5F9;strokeColor=#475569;fontStyle=1;fontSize=13;fontColor=#0F172A;align=left;spacingLeft=15;'
    c_mcu_style = 'swimlane;html=1;startSize=36;rounded=1;shadow=1;comic=0;labelBackgroundColor=none;strokeWidth=2;fillColor=#ECFDF5;strokeColor=#059669;fontStyle=1;fontSize=13;fontColor=#064E3B;align=left;spacingLeft=15;'
    c_drv_style = 'swimlane;html=1;startSize=36;rounded=1;shadow=1;comic=0;labelBackgroundColor=none;strokeWidth=2;fillColor=#FAF5FF;strokeColor=#9333EA;fontStyle=1;fontSize=13;fontColor=#581C87;align=left;spacingLeft=15;'
    c_pwr_style = 'swimlane;html=1;startSize=36;rounded=1;shadow=1;comic=0;labelBackgroundColor=none;strokeWidth=2;fillColor=#FEF2F2;strokeColor=#DC2626;fontStyle=1;fontSize=13;fontColor=#7F1D1D;align=left;spacingLeft=15;'
    c_mech_style = 'swimlane;html=1;startSize=36;rounded=1;shadow=1;comic=0;labelBackgroundColor=none;strokeWidth=2;fillColor=#FFFBEB;strokeColor=#D97706;fontStyle=1;fontSize=13;fontColor=#78350F;align=left;spacingLeft=15;'
    c_sens_style = 'swimlane;html=1;startSize=36;rounded=1;shadow=1;comic=0;labelBackgroundColor=none;strokeWidth=2;fillColor=#ECFEFF;strokeColor=#0891B2;fontStyle=1;fontSize=13;fontColor=#164E63;align=left;spacingLeft=15;'

    # Normal Node Blocks
    card_base = 'rounded=1;whiteSpace=wrap;html=1;shadow=1;strokeWidth=1.5;fontSize=11;fontFamily=Helvetica;'
    card_host = card_base + 'fillColor=#FFFFFF;strokeColor=#64748B;fontColor=#1E293B;'
    card_host_hl = card_base + 'fillColor=#E0E7FF;strokeColor=#4F46E5;fontColor=#312E81;fontStyle=1;'
    
    card_mcu = card_base + 'fillColor=#FFFFFF;strokeColor=#10B981;fontColor=#064E3B;'
    card_mcu_core0 = card_base + 'fillColor=#D1FAE5;strokeColor=#059669;fontColor=#064E3B;'
    card_mcu_core1 = card_base + 'fillColor=#A7F3D0;strokeColor=#047857;fontColor=#064E3B;fontStyle=1;'
    card_mcu_ipc = card_base + 'fillColor=#FEE2E2;strokeColor=#EF4444;fontColor=#991B1B;'
    
    card_drv = card_base + 'fillColor=#FFFFFF;strokeColor=#A855F7;fontColor=#581C87;'
    card_drv_hl = card_base + 'fillColor=#F3E8FF;strokeColor=#9333EA;fontColor=#581C87;fontStyle=1;'
    card_motor = card_base + 'fillColor=#EDE9FE;strokeColor=#7C3AED;fontColor=#4C1D95;fontStyle=1;'
    
    card_pwr = card_base + 'fillColor=#FFFFFF;strokeColor=#EF4444;fontColor=#7F1D1D;'
    card_pwr_hl = card_base + 'fillColor=#FEE2E2;strokeColor=#DC2626;fontColor=#7F1D1D;fontStyle=1;'
    
    card_mech = card_base + 'fillColor=#FFFFFF;strokeColor=#F59E0B;fontColor=#78350F;'
    card_mech_hl = card_base + 'fillColor=#FEF3C7;strokeColor=#D97706;fontColor=#78350F;fontStyle=1;'
    
    card_sens = card_base + 'fillColor=#FFFFFF;strokeColor=#06B6D4;fontColor=#164E63;'
    card_sens_hl = card_base + 'fillColor=#CFFAFE;strokeColor=#0891B2;fontColor=#164E63;fontStyle=1;'

    # Connectors
    edge_base = 'edgeStyle=orthogonalEdgeStyle;rounded=1;jettySize=auto;orthogonalLoop=1;strokeWidth=2;fontSize=10;labelBackgroundColor=#FFFFFF;'
    edge_data = edge_base + 'strokeColor=#2563EB;fontColor=#1E40AF;'
    edge_fast_pulse = edge_base + 'strokeColor=#059669;fontColor=#065F46;strokeWidth=2.5;'
    edge_uart = edge_base + 'strokeColor=#7C3AED;fontColor=#5B21B6;'
    edge_power = edge_base + 'strokeColor=#DC2626;fontColor=#991B1B;strokeWidth=2.5;'
    edge_spi = edge_base + 'strokeColor=#0891B2;fontColor=#0E7490;'
    edge_mech = edge_base + 'strokeColor=#D97706;fontColor=#92400E;strokeWidth=3;'

    # ==========================================
    # 1. HEADER & METADATA
    # ==========================================
    add_cell('title_box', 
        '<b><font style="font-size: 22px;">SEISMOBENCH: PRECISION DUAL-STEPPER SHAKE TABLE CONTROLLER</font></b><br>'
        '<b><font style="font-size: 13px; color: #475569;">COMPLETE HARDWARE ARCHITECTURE &amp; SIGNAL WIRING BLOCK DIAGRAM</font></b><br>'
        '<font style="font-size: 11px; color: #64748B;">ESP32-S3 Dual-Core (240MHz) | Dual TMC2209 SpreadCycle (1000mA RMS) | ADXL355 20-bit SPI Accelerometer | Web Serial Direct Stream (921,600 Baud)</font>',
        title_style, 40, 20, 1100, 60
    )

    legend_html = (
        '<b>DIAGRAM BUS &amp; SIGNAL LEGEND</b><br>'
        '<span style="color:#2563EB;">━ Web Serial / Telemetry (921.6k Baud)</span><br>'
        '<span style="color:#059669;">━ Hard Real-Time Step/Dir Pulses (GPIO)</span><br>'
        '<span style="color:#7C3AED;">━ TMC Single-Wire UART Bus (115.2k Baud)</span><br>'
        '<span style="color:#0891B2;">━ High-Speed SPI Bus (5 MHz Mode 0)</span><br>'
        '<span style="color:#DC2626;">━ DC Power Rails (VMOT 12/24V, 5V, 3.3V)</span><br>'
        '<span style="color:#D97706;">━ Mechanical Timing Belt / Coupling</span>'
    )
    add_cell('legend_box', legend_html, card_base + 'fillColor=#FFFFFF;strokeColor=#CBD5E1;align=left;spacingLeft=10;fontSize=10;', 1730, 15, 290, 95)

    # ==========================================
    # 2. SUBSYSTEM CONTAINERS
    # ==========================================
    add_cell('c_host', '1. HOST WORKSTATION &amp; WEB APP INTERFACE', c_host_style, 40, 95, 340, 655)
    add_cell('c_mcu', '2. CENTRAL EMBEDDED CONTROLLER: ESP32-S3 DEVKIT (Dual-Core @ 240MHz)', c_mcu_style, 410, 95, 780, 655)
    add_cell('c_pwr', '3. POWER DISTRIBUTION SUBSYSTEM (PDS)', c_pwr_style, 1220, 95, 490, 235)
    add_cell('c_drv', '4. DUAL TRINAMIC TMC2209 STEPPER DRIVE SUBSYSTEM', c_drv_style, 1220, 350, 490, 400)
    add_cell('c_sens', '5. ACCELERATION SENSING &amp; TELEMETRY FEEDBACK', c_sens_style, 40, 775, 480, 395)
    add_cell('c_mech', '6. MECHANICAL SHAKE TABLE BENCH &amp; KINEMATICS', c_mech_style, 550, 775, 1160, 395)

    # ==========================================
    # 3. INTERNAL NODES: HOST WORKSTATION
    # ==========================================
    add_cell('host_pc', 
        '<b>Host Computer / Laptop</b><br>'
        'OS: Windows / Linux / macOS<br>'
        'Browser: Chrome / Edge / Opera<br>'
        '<i>(Native Web Serial API Support)</i>',
        card_host_hl, 60, 145, 300, 70
    )
    
    add_cell('host_dsp', 
        '<b>SeismoBench DSP Engine</b><br>'
        '• 2nd-Order Butterworth HPF (fc = 0.20 Hz)<br>'
        '• Double Integration: a(t) → v(t) → x(t)<br>'
        '• Baseline Zero-Drift Correction<br>'
        '• Radix-2 FFT Analyzer (0 - 25 Hz)',
        card_host, 60, 230, 300, 80
    )
    
    add_cell('host_records', 
        '<b>Seismic Record Library &amp; Generator</b><br>'
        '• 1940 El Centro (NS Component)<br>'
        '• 1995 Kobe JMA (Near-Fault Pulse)<br>'
        '• 1994 Northridge (Sylmar Hospital)<br>'
        '• Synthetic Sine Sweep (1 - 15 Hz Chirp)<br>'
        '• Custom CSV Seismogram Ingest',
        card_host, 60, 325, 300, 95
    )

    add_cell('host_kinematics', 
        '<b>Kinematic Trajectory Generator</b><br>'
        '• Steps/mm Mapping: 80.0 steps/mm<br>'
        '• Max Velocity Clamp: 250 mm/s<br>'
        '• Max Accel Clamp: 5000 mm/s²<br>'
        '• Full-Fidelity Unclipped Stream',
        card_host, 60, 435, 300, 80
    )

    add_cell('host_webserial', 
        '<b>Web Serial Controller</b><br>'
        '• Direct USB-CDC Stream @ 921,600 Baud<br>'
        '• Chunks: BUF_START:POINTS=N,DT_MS=dt<br>'
        '• CHUNK:offset:t:step:disp;...<br>'
        '• Safety Controls: ESTOP, HOME, CFG:SENSOR',
        card_host_hl, 60, 530, 300, 85
    )

    add_cell('host_charts', 
        '<b>Real-Time Interactive Dashboard</b><br>'
        '• Input vs Actual Telemetry Waveform<br>'
        '• Dynamic RMSE &amp; Correlation (Rxy)<br>'
        '• Phase Lag Measurement (ms)<br>'
        '• FFT Frequency Spectrum Overlay',
        card_host, 60, 630, 300, 80
    )

    # ==========================================
    # 4. INTERNAL NODES: CENTRAL MCU (ESP32-S3)
    # ==========================================
    add_cell('mcu_usb', 
        '<b>USB-CDC / UART Bridge Interface</b><br>'
        'Hardware FIFO @ <b>921,600 Baud</b> (Direct USB Stream)<br>'
        'Full Duplex Command Ingest &amp; Telemetry Egress',
        card_mcu, 440, 145, 720, 45
    )

    # CORE 0 Container Box
    add_cell('box_core0', 
        '<b>XTENSA LX7 - CORE 0: PROTOCOL &amp; SENSOR MANAGER</b>',
        'swimlane;html=1;startSize=26;rounded=1;fillColor=#D1FAE5;strokeColor=#10B981;fontColor=#064E3B;fontSize=11;fontStyle=1;align=left;spacingLeft=10;',
        440, 205, 340, 330
    )
    add_cell('core0_parser', 
        '<b>Web Serial Packet Parser</b><br>'
        '• BUF_START, CHUNK, BUF_END<br>'
        '• EXEC:START, ESTOP, HOME, PING<br>'
        '• Sensor Config (CFG:SENSOR=0/1)',
        card_mcu_core0, 455, 240, 310, 70
    )
    add_cell('core0_sram', 
        '<b>DMA SRAM Trajectory Buffer</b><br>'
        '• MAX_POINTS = 4096 (TrajectoryPoint)<br>'
        '• Point: {uint32_t t_ms, int32_t step, float disp}<br>'
        '• Free SRAM &gt; 280KB (WiFi/BT unlinked)',
        card_mcu_core0, 455, 325, 310, 75
    )
    add_cell('core0_drain', 
        '<b>Async Telemetry Queue Drainer</b><br>'
        '• Polls lock-free ring buffer in loop()<br>'
        '• Drains: TLM:t_ms,accel,disp,step<br>'
        '• Zero blocking impact on Core 1 motion',
        card_mcu_core0, 455, 415, 310, 75
    )

    # IPC Inter-Core Box
    add_cell('mcu_ipc', 
        '<b>Inter-Core Lock-Free IPC &amp; RTOS Sync</b><br>'
        '• FreeRTOS Task Notification (xTaskNotifyGive)<br>'
        '• Atomic Emergency Stop Flag (volatile bool)<br>'
        '• Lock-Free Ring Buffer (tlmQueue[128], &lt; 1µs push)',
        card_mcu_ipc, 440, 545, 720, 50
    )

    # CORE 1 Container Box
    add_cell('box_core1', 
        '<b>XTENSA LX7 - CORE 1: HARD REAL-TIME MOTION ENGINE</b>',
        'swimlane;html=1;startSize=26;rounded=1;fillColor=#A7F3D0;strokeColor=#059669;fontColor=#064E3B;fontSize=11;fontStyle=1;align=left;spacingLeft=10;',
        820, 205, 340, 330
    )
    add_cell('core1_freertos', 
        '<b>Dedicated Motion Task (Core 1)</b><br>'
        '• Pinned Task: motionTaskCore1 (8KB Stack)<br>'
        '• Priority: configMAX_PRIORITIES - 1<br>'
        '• Deterministic hard real-time execution',
        card_mcu_core1, 835, 240, 310, 65
    )
    add_cell('core1_spline', 
        '<b>Continuous Cubic Hermite Spline Engine</b><br>'
        '• Sub-step continuous trajectory evaluation<br>'
        '• C¹ velocity continuity across intervals<br>'
        '• Natural 0.0 velocity turnaround at wave peaks<br>'
        '• Zero infinite-jerk impulses &amp; zero croaking',
        card_mcu_core1, 835, 320, 310, 95
    )
    add_cell('core1_pulsing', 
        '<b>Microsecond Step Sequencer</b><br>'
        '• Fast digital pulse generation: pulseStepPins()<br>'
        '• Minimum 2µs pulse width (TMC2209 compatible)<br>'
        '• Instantaneous directional control',
        card_mcu_core1, 835, 430, 310, 65
    )

    # MCU GPIO Physical Pinout Matrix
    add_cell('mcu_pinout', 
        '<b>ESP32-S3 PHYSICAL GPIO ALLOCATION &amp; PIN MAPPING TABLE</b><br>'
        '• <b>Left Stepper (X1):</b> STEP → GPIO 25 | DIR → GPIO 26<br>'
        '• <b>Right Stepper (X2):</b> STEP → GPIO 18 | DIR → GPIO 19<br>'
        '• <b>Shared Motor Enable:</b> EN → GPIO 23 (Active LOW, Hardware Disable on ESTOP)<br>'
        '• <b>Trinamic Single-Wire UART:</b> RX2 → GPIO 16 | TX2 → GPIO 17 (via 1kΩ Resistor)<br>'
        '• <b>ADXL355 SPI Bus:</b> CS → GPIO 27 | SCK → GPIO 14 | MISO → GPIO 12 | MOSI → GPIO 13',
        card_mcu, 440, 605, 720, 110
    )

    # ==========================================
    # 5. INTERNAL NODES: POWER DISTRIBUTION (PDS)
    # ==========================================
    add_cell('pwr_mains', 
        '<b>AC Mains Input</b><br>'
        '100 - 240V AC<br>'
        '50 / 60 Hz',
        card_pwr, 1240, 145, 120, 55
    )

    add_cell('pwr_smps', 
        '<b>DC Switch-Mode Power Supply</b><br>'
        'Output: <b>12V / 24V DC @ 10A</b><br>'
        'Overload &amp; Short Protection',
        card_pwr_hl, 1390, 145, 190, 55
    )

    add_cell('pwr_caps', 
        '<b>Decoupling Filter Capacitors</b><br>'
        'Dual <b>100µF 35V Low-ESR</b><br>'
        'Prevents Back-EMF Spikes on VMOT',
        card_pwr, 1390, 215, 190, 50
    )

    add_cell('pwr_logic', 
        '<b>Logic Power Regulators</b><br>'
        '• USB VBUS: 5.0V DC (ESP32 DevKit)<br>'
        '• Onboard LDO: 3.3V DC (VIO &amp; ADXL VDD)',
        card_pwr, 1240, 215, 130, 90
    )

    add_cell('pwr_gnd', 
        '<b>Unified Star Ground Bus</b><br>'
        'Common Ground: 12V/24V Power GND + 5V USB GND + 3.3V Logic GND',
        card_pwr, 1390, 275, 300, 35
    )

    # ==========================================
    # 6. INTERNAL NODES: MOTOR DRIVERS (TMC2209)
    # ==========================================
    add_cell('tmc_left', 
        '<b>TRINAMIC TMC2209 - LEFT (X1)</b><br>'
        '<b>UART Address: 0b00</b> (MS1=GND, MS2=GND)<br>'
        '• Mode: <b>SpreadCycle</b> (en_spreadCycle=true)<br>'
        '• Microstepping: 1/16 (Interpolated to <b>256</b>)<br>'
        '• Current: <b>1000 mA RMS</b> (Rsense = 0.11Ω)<br>'
        '• Pins: STEP (D25), DIR (D26), EN (D23)<br>'
        '• VMOT: 12-24V | VIO: 3.3V | PDN_UART',
        card_drv_hl, 1240, 400, 220, 140
    )

    add_cell('tmc_right', 
        '<b>TRINAMIC TMC2209 - RIGHT (X2)</b><br>'
        '<b>UART Address: 0b01</b> (MS1=VIO, MS2=GND)<br>'
        '• Mode: <b>SpreadCycle</b> (en_spreadCycle=true)<br>'
        '• Microstepping: 1/16 (Interpolated to <b>256</b>)<br>'
        '• Current: <b>1000 mA RMS</b> (Rsense = 0.11Ω)<br>'
        '• Pins: STEP (D18), DIR (D19), EN (D23)<br>'
        '• VMOT: 12-24V | VIO: 3.3V | PDN_UART',
        card_drv_hl, 1475, 400, 220, 140
    )

    add_cell('tmc_features', 
        '<b>TMC2209 Anti-Resonance Dynamic Configuration</b><br>'
        '• <b>SpreadCycle Mode:</b> Cycle-by-cycle hardware peak-current chopper eliminates StealthChop back-EMF phase collapse and prevents motor croaking during fast 1-15 Hz reversals.<br>'
        '• <b>MicroPlyer Interpolation:</b> Smooths 1/16 step pulses into 256 microstep sine waves.<br>'
        '• <b>Single-Wire UART Bus:</b> Real-time dynamic current tuning, blank time (24), toff (4).',
        card_drv, 1240, 555, 455, 80
    )

    add_cell('motor_left', 
        '<b>NEMA 17 Stepper (Left X1)</b><br>'
        '1.8° Step Angle (200 Steps/Rev)<br>'
        'Bipolar 4-Wire (Coils 1A/1B, 2A/2B)<br>'
        'High Dynamic Torque',
        card_motor, 1240, 650, 220, 75
    )

    add_cell('motor_right', 
        '<b>NEMA 17 Stepper (Right X2)</b><br>'
        '1.8° Step Angle (200 Steps/Rev)<br>'
        'Bipolar 4-Wire (Coils 1A/1B, 2A/2B)<br>'
        'Synchronized Dual Drive',
        card_motor, 1475, 650, 220, 75
    )

    # ==========================================
    # 7. INTERNAL NODES: SENSING & ACCELEROMETER
    # ==========================================
    add_cell('adxl_chip', 
        '<b>Analog Devices EVAL-ADXL355Z Accelerometer</b><br>'
        '• <b>Resolution:</b> 20-bit High-Precision Triaxial ADC<br>'
        '• <b>Measurement Range:</b> ±2.048g Dynamic Range<br>'
        '• <b>Scale Factor:</b> 256,000 LSB/g (0.0039 mg/LSB)<br>'
        '• <b>Noise Density:</b> 25 µg/√Hz (Ultra-Low Noise Floor)<br>'
        '• <b>Output Data Rate:</b> Up to 4000 Hz<br>'
        '• <b>Physical Sensor Health:</b> PartID: 0xED, DevID: 0xAD',
        card_sens_hl, 60, 825, 440, 115
    )

    add_cell('adxl_spi', 
        '<b>High-Speed SPI Digital Interface</b><br>'
        '• Clock Rate: <b>5.0 MHz</b> | SPI Mode: <b>Mode 0</b> (CPOL=0, CPHA=0)<br>'
        '• Signals: CS (D27), SCK (D14), MISO (D12), MOSI (D13)<br>'
        '• Readout: 20-bit XDATA registers (Burst Read 0x08 - 0x0A)<br>'
        '• Dedicated low-noise analog LDO supply (3.3V VDD / VIO)',
        card_sens, 60, 955, 440, 90
    )

    add_cell('adxl_mount', 
        '<b>Rigid Carriage Mechanical Coupling</b><br>'
        '• Direct bolt mount on center-of-mass of the vibrating shake table plate.<br>'
        '• Measures true physical ground acceleration response a_actual(t).<br>'
        '• Software Bypass: CFG:SENSOR=0 allows open-loop operation if sensor is unplugged.',
        card_sens, 60, 1060, 440, 80
    )

    # ==========================================
    # 8. INTERNAL NODES: MECHANICAL SHAKE TABLE BENCH
    # ==========================================
    add_cell('mech_pulleys', 
        '<b>Dual GT2 Timing Pulleys</b><br>'
        '• Pitch: <b>2.0 mm</b><br>'
        '• Tooth Count: <b>20T</b> (Aluminum)<br>'
        '• Circumference: <b>40.0 mm / rev</b><br>'
        '• Bore: 5mm with dual grub screws',
        card_mech, 575, 825, 230, 90
    )

    add_cell('mech_belts', 
        '<b>Dual GT2 Timing Belts</b><br>'
        '• High-tensile Neoprene with fiberglass core<br>'
        '• Zero-backlash dual synchronized drive<br>'
        '• Integrated spring/screw tensioners<br>'
        '• Pitch: 2mm | Width: 6mm',
        card_mech, 825, 825, 250, 90
    )

    add_cell('mech_kinematics', 
        '<b>Calculated Kinematic Resolution</b><br>'
        '<b>Steps per mm = (200 × 16) / (20 × 2) = 80.0 steps/mm</b><br>'
        '• Linear Resolution: <b>12.5 µm per microstep</b><br>'
        '• MicroPlyer 256 Virtual Resolution: <b>0.78 µm / step</b><br>'
        '• Maximum Linear Speed: 250+ mm/s',
        card_mech_hl, 1095, 825, 300, 90
    )

    add_cell('mech_rails', 
        '<b>Precision Linear Motion Guides</b><br>'
        '• Dual MGN12 Precision Ground Linear Guide Rails / Hardened Chrome Shafts<br>'
        '• 4x Recirculating Ball Bearing Slider Blocks (Zero-play, ultra-low rolling friction)<br>'
        '• Eliminates lateral yaw, carriage tilt, and parasitic pitch oscillation',
        card_mech, 575, 930, 820, 65
    )

    add_cell('mech_table', 
        '<b>SHAKE TABLE PLATFORM / MOVING CARRIAGE</b><br>'
        '• <b>Physical Stroke Limit:</b> ±40.0 mm (80 mm Total Linear Travel Stroke)<br>'
        '• <b>Construction:</b> High-rigidity CNC anodized aluminum / acrylic fixture plate<br>'
        '• <b>Payload Capacity:</b> Up to 5.0 kg structural specimens &amp; scale models<br>'
        '• <b>Integrated Safety:</b> Soft software clamps + mechanical damped endstop bumpers',
        card_mech_hl, 575, 1010, 520, 115
    )

    add_cell('mech_specimen', 
        '<b>TEST SPECIMEN / EXPERIMENTAL BENCH</b><br>'
        '• Multi-Story Building Scale Frame / SDOF Resonator<br>'
        '• Tuned Liquid Damper (TLD) / Base Isolation Bearings<br>'
        '• Structural Dynamic Resonance Investigation (1 - 15 Hz)<br>'
        '• Real-time destructive &amp; non-destructive seismic analysis',
        card_mech, 1115, 1010, 280, 115
    )

    # ==========================================
    # 9. CONNECTORS & BUS WIRES
    # ==========================================
    # 1. Host to MCU (Web Serial)
    add_edge('e_host_mcu', 'Web Serial API (921,600 Baud Full Duplex USB-CDC Direct Stream)', edge_data, 'host_webserial', 'mcu_usb', 
             exitX=1, exitY=0.5, entryX=0, entryY=0.5)
    
    # 2. MCU Core 0 to Core 1 (IPC)
    add_edge('e_core0_ipc', 'Trajectory Buffer Pointers &amp; Sync', edge_fast_pulse, 'core0_sram', 'mcu_ipc',
             exitX=0.5, exitY=1, entryX=0.25, entryY=0)
    add_edge('e_ipc_core1', 'xTaskNotifyGive / Motion Execution Trigger', edge_fast_pulse, 'mcu_ipc', 'core1_freertos',
             exitX=0.75, exitY=0, entryX=0.5, entryY=1)
    add_edge('e_core1_tlm', 'Lock-Free Telemetry Push (&lt; 1µs)', edge_fast_pulse, 'core1_spline', 'mcu_ipc',
             pts=[(990, 525), (750, 525), (750, 545)])
    add_edge('e_ipc_drain', 'Telemetry Ring Buffer Pop', edge_data, 'mcu_ipc', 'core0_drain',
             pts=[(650, 545), (650, 505), (610, 505)])

    # 3. MCU to Drivers (Step/Dir & UART)
    add_edge('e_step_left', 'Left Step/Dir (D25, D26)', edge_fast_pulse, 'mcu_pinout', 'tmc_left',
             exitX=1, exitY=0.2, entryX=0, entryY=0.4)
    add_edge('e_step_right', 'Right Step/Dir (D18, D19)', edge_fast_pulse, 'mcu_pinout', 'tmc_right',
             exitX=1, exitY=0.4, entryX=0, entryY=0.4, pts=[(1175, 649), (1210, 649), (1210, 480), (1475, 480)])
    add_edge('e_en_shared', 'Shared Enable (D23, Active LOW)', edge_fast_pulse, 'mcu_pinout', 'tmc_features',
             exitX=1, exitY=0.6, entryX=0, entryY=0.5, pts=[(1160, 671), (1200, 671), (1200, 595)])

    # UART Single-Wire
    add_edge('e_uart_bus', 'TMC Single-Wire UART (TX2 D17 + 1kΩ, RX2 D16)', edge_uart, 'mcu_pinout', 'tmc_features',
             exitX=1, exitY=0.8, entryX=0, entryY=0.8, pts=[(1160, 693), (1220, 693), (1220, 619)])

    # 4. Drivers to Stepper Motors (Coil Phases)
    add_edge('e_drv_mot_l', 'Motor Phases (1A, 1B, 2A, 2B)', edge_fast_pulse, 'tmc_left', 'motor_left',
             exitX=0.5, exitY=1, entryX=0.5, entryY=0)
    add_edge('e_drv_mot_r', 'Motor Phases (1A, 1B, 2A, 2B)', edge_fast_pulse, 'tmc_right', 'motor_right',
             exitX=0.5, exitY=1, entryX=0.5, entryY=0)

    # 5. Motors to Mechanical Transmission
    add_edge('e_mot_pulley_l', 'Rotor Shaft Coupling (5mm D-Shaft)', edge_mech, 'motor_left', 'mech_pulleys',
             exitX=0.5, exitY=1, entryX=0.8, entryY=0, pts=[(1350, 740), (1350, 760), (760, 760), (760, 825)])
    add_edge('e_mot_pulley_r', 'Rotor Shaft Coupling (5mm D-Shaft)', edge_mech, 'motor_right', 'mech_belts',
             exitX=0.5, exitY=1, entryX=0.8, entryY=0, pts=[(1585, 740), (1585, 770), (1025, 770), (1025, 825)])
    add_edge('e_pulleys_belts', 'GT2 2mm Mesh', edge_mech, 'mech_pulleys', 'mech_belts')
    add_edge('e_belts_table', 'Belt Clamps (Linear Drive Force)', edge_mech, 'mech_belts', 'mech_table',
             exitX=0.5, exitY=1, entryX=0.6, entryY=0, pts=[(950, 925), (950, 990), (887, 990), (887, 1010)])
    add_edge('e_rails_table', 'Low-Friction Linear Constraint', edge_mech, 'mech_rails', 'mech_table',
             exitX=0.3, exitY=1, entryX=0.3, entryY=0)
    add_edge('e_table_specimen', 'Rigid Structural Clamping', edge_mech, 'mech_table', 'mech_specimen',
             exitX=1, exitY=0.5, entryX=0, entryY=0.5)

    # 6. Mechanical Table to Accelerometer Sensor
    add_edge('e_table_adxl', 'Physical Motion &amp; Inertial Vibration Coupling', edge_mech, 'mech_table', 'adxl_mount',
             exitX=0, exitY=0.5, entryX=1, entryY=0.5, pts=[(575, 1067), (530, 1067), (530, 1100), (500, 1100)])
    add_edge('e_mount_chip', 'Mechanical Rigidity', edge_mech, 'adxl_mount', 'adxl_chip',
             exitX=0.5, exitY=0, entryX=0.5, entryY=1)

    # 7. Accelerometer SPI to MCU
    add_edge('e_adxl_spi', 'SPI Bus: CS (D27), SCK (D14), MISO (D12), MOSI (D13) @ 5 MHz', edge_spi, 'adxl_spi', 'mcu_pinout',
             exitX=0.5, exitY=0, entryX=0.1, entryY=1, pts=[(280, 955), (280, 750), (512, 750), (512, 715)])

    # 8. Power Connections
    add_edge('e_ac_smps', 'AC Mains Line', edge_power, 'pwr_mains', 'pwr_smps')
    add_edge('e_smps_caps', '24V/12V DC Bus', edge_power, 'pwr_smps', 'pwr_caps')
    add_edge('e_caps_vmot_l', 'VMOT (12-24V DC)', edge_power, 'pwr_caps', 'tmc_left',
             exitX=0.2, exitY=1, entryX=0.5, entryY=0, pts=[(1428, 265), (1428, 335), (1350, 335), (1350, 400)])
    add_edge('e_caps_vmot_r', 'VMOT (12-24V DC)', edge_power, 'pwr_caps', 'tmc_right',
             exitX=0.8, exitY=1, entryX=0.5, entryY=0, pts=[(1542, 265), (1542, 335), (1585, 335), (1585, 400)])
    add_edge('e_usb_pwr', 'USB 5V VBUS Power', edge_power, 'mcu_usb', 'pwr_logic',
             exitX=0.95, exitY=0.5, entryX=0, entryY=0.2, pts=[(1160, 167), (1210, 167), (1210, 233), (1240, 233)])
    add_edge('e_ldo_vio', '3.3V Logic Bus (VIO)', edge_power, 'pwr_logic', 'tmc_features',
             exitX=0.5, exitY=1, entryX=0.1, entryY=0, pts=[(1305, 305), (1305, 340), (1285, 340), (1285, 555)])

    # Convert to formatted string
    xml_str = ET.tostring(mxfile, encoding='utf-8')
    dom = xml.dom.minidom.parseString(xml_str)
    pretty_xml = dom.toprettyxml(indent='  ')
    
    with open('hardware_block_diagram.drawio', 'w', encoding='utf-8') as f:
        f.write(pretty_xml)
        
    print('SUCCESS: hardware_block_diagram.drawio generated successfully!')

if __name__ == '__main__':
    generate_hardware_drawio()
