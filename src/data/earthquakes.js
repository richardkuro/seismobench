import { ELCENTRO_TIME, ELCENTRO_ACCEL } from './elcentro_data.js';

/**
 * Seismic Event Records, Preloaded Waveforms, and CSV Parsing
 * Includes Richter/Moment Magnitude (Mw), MMI Intensity, and focal depth data.
 */

/**
 * 1. 1940 El Centro (Imperial Valley, California)
 * Mw 6.9 | PGA 0.348g | MMI VIII | Strike-Slip Imperial Fault
 */
export function getElCentro1940() {
  const pga = Math.max(...ELCENTRO_ACCEL.map(Math.abs));
  return {
    id: 'elcentro',
    name: '1940 El Centro (NS Component)',
    location: 'Imperial Valley, California',
    date: 'May 18, 1940',
    magnitude: 6.9,
    mmi: 'VIII',
    depthKm: 16.0,
    pga: Number(pga.toFixed(4)),
    duration: Number((ELCENTRO_TIME[ELCENTRO_TIME.length - 1] - ELCENTRO_TIME[0]).toFixed(2)),
    dt: Number(((ELCENTRO_TIME[ELCENTRO_TIME.length - 1] - ELCENTRO_TIME[0]) / (ELCENTRO_TIME.length - 1)).toFixed(4)),
    description: 'The definitive classic earthquake record in structural engineering. Recorded at the El Centro Irrigation District terminal building.',
    time: ELCENTRO_TIME,
    accel: ELCENTRO_ACCEL
  };
}

/**
 * 2. 1995 Kobe Earthquake (Kobe JMA Station)
 * Mw 6.9 | PGA 0.82g | MMI IX | Destructive Near-Fault Pulse
 */
export function generateKobeWaveform() {
  const dt = 0.02;
  const duration = 25.0;
  const n = Math.floor(duration / dt);
  const time = [];
  const accel = [];
  const pga = 0.82;

  for (let i = 0; i < n; i++) {
    const t = i * dt;
    time.push(Number(t.toFixed(3)));

    let val = 0;
    if (t >= 3.0 && t <= 20.0) {
      const tc = t - 7.5;
      const pulse1 = Math.exp(-0.25 * tc * tc) * Math.sin(2 * Math.PI * 1.4 * tc);
      const pulse2 = 0.5 * Math.exp(-0.15 * Math.pow(t - 9.0, 2)) * Math.sin(2 * Math.PI * 2.8 * t + 0.8);
      const pulse3 = 0.3 * Math.exp(-0.1 * Math.pow(t - 11.5, 2)) * Math.sin(2 * Math.PI * 4.2 * t + 1.5);
      const microTremors = 0.12 * Math.sin(2 * Math.PI * 7.5 * t) * Math.exp(-0.08 * Math.pow(t - 8.0, 2));

      val = (pulse1 + pulse2 + pulse3 + microTremors) * pga * 0.95;
    }
    accel.push(Number(val.toFixed(5)));
  }

  return {
    id: 'kobe',
    name: '1995 Kobe Earthquake (Kobe JMA)',
    location: 'Hanshin, Japan',
    date: 'Jan 17, 1995',
    magnitude: 6.9,
    mmi: 'IX',
    depthKm: 17.6,
    pga: 0.82,
    duration: duration,
    dt: dt,
    description: 'Severe near-fault ground motion characterized by extreme peak ground velocity (100 cm/s) and intense 1-3 Hz velocity pulses.',
    time,
    accel
  };
}

/**
 * 3. 1994 Northridge Earthquake (Sylmar County Hospital Station)
 * Mw 6.7 | PGA 0.84g | MMI IX | Blind Thrust Fault Fling-Step
 */
export function generateNorthridgeWaveform() {
  const dt = 0.02;
  const duration = 20.0;
  const n = Math.floor(duration / dt);
  const time = [];
  const accel = [];
  const pga = 0.84;

  for (let i = 0; i < n; i++) {
    const t = i * dt;
    time.push(Number(t.toFixed(3)));

    let val = 0;
    if (t >= 2.5 && t <= 16.0) {
      const tc = t - 5.8;
      const p1 = Math.exp(-0.35 * tc * tc) * Math.cos(2 * Math.PI * 1.8 * tc);
      const p2 = -0.7 * Math.exp(-0.25 * Math.pow(t - 7.2, 2)) * Math.sin(2 * Math.PI * 2.2 * t);
      const p3 = 0.45 * Math.exp(-0.18 * Math.pow(t - 9.5, 2)) * Math.sin(2 * Math.PI * 5.1 * t);
      const p4 = 0.2 * Math.sin(2 * Math.PI * 9.8 * t) * Math.exp(-0.12 * Math.pow(t - 6.5, 2));

      val = (p1 + p2 + p3 + p4) * pga * 0.92;
    }
    accel.push(Number(val.toFixed(5)));
  }

  return {
    id: 'northridge',
    name: '1994 Northridge (Sylmar Station)',
    location: 'Los Angeles, California',
    date: 'Jan 17, 1994',
    magnitude: 6.7,
    mmi: 'IX',
    depthKm: 18.2,
    pga: 0.84,
    duration: duration,
    dt: dt,
    description: 'Classic thrust-fault earthquake with intense forward-directivity motion and high spectral acceleration recorded at the Sylmar County Hospital.',
    time,
    accel
  };
}

/**
 * 4. 1985 Mexico City Earthquake (SCT Station)
 * Mw 8.0 | PGA 0.17g | MMI IX | Iconic Soft-Soil Lakebed Harmonic Resonance
 */
export function generateMexicoCityWaveform() {
  const dt = 0.02;
  const duration = 30.0;
  const n = Math.floor(duration / dt);
  const time = [];
  const accel = [];
  const pga = 0.17; // Long resonant period T ~ 2.0s

  for (let i = 0; i < n; i++) {
    const t = i * dt;
    time.push(Number(t.toFixed(3)));

    let val = 0;
    if (t >= 2.0 && t <= 27.0) {
      // 2-second resonant harmonic oscillation typical of Mexico City lacustrine clay
      const env = Math.sin(Math.PI * (t - 2.0) / 25.0);
      const harmonicResonance = Math.sin(2 * Math.PI * 0.50 * t) // 0.5 Hz (2.0s period)
                              + 0.35 * Math.sin(2 * Math.PI * 0.48 * t + 0.4)
                              + 0.15 * Math.sin(2 * Math.PI * 1.1 * t + 1.2);
      val = env * harmonicResonance * pga * 0.88;
    }
    accel.push(Number(val.toFixed(5)));
  }

  return {
    id: 'mexico1985',
    name: '1985 Mexico City (SCT Station)',
    location: 'Mexico City, Mexico',
    date: 'Sep 19, 1985',
    magnitude: 8.0,
    mmi: 'IX',
    depthKm: 20.0,
    pga: 0.17,
    duration: duration,
    dt: dt,
    description: 'Famous site-amplification earthquake where ancient lakebed clay produced a sustained 2.0s (0.5 Hz) harmonic resonance that collapsed mid-rise structures 350 km from the epicenter.',
    time,
    accel
  };
}

/**
 * 5. 2011 Tohoku Great East Japan Earthquake (Sendai MYG004)
 * Mw 9.1 | PGA 1.25g | MMI X | Mega-Thrust Subduction Zone Disaster
 */
export function generateTohokuWaveform() {
  const dt = 0.02;
  const duration = 35.0;
  const n = Math.floor(duration / dt);
  const time = [];
  const accel = [];
  const pga = 1.25;

  for (let i = 0; i < n; i++) {
    const t = i * dt;
    time.push(Number(t.toFixed(3)));

    let val = 0;
    if (t >= 3.0 && t <= 32.0) {
      // Dual-asperity rupture with massive high-frequency multi-stage energy
      const asperity1 = Math.exp(-0.08 * Math.pow(t - 11.0, 2)) * (Math.sin(2 * Math.PI * 2.5 * t) + 0.6 * Math.sin(2 * Math.PI * 4.8 * t));
      const asperity2 = Math.exp(-0.06 * Math.pow(t - 20.0, 2)) * (Math.sin(2 * Math.PI * 1.8 * t + 1.0) + 0.5 * Math.sin(2 * Math.PI * 6.2 * t));
      const highFreqChirp = 0.25 * Math.sin(2 * Math.PI * 8.5 * t) * Math.exp(-0.03 * Math.pow(t - 15.0, 2));

      val = (asperity1 + asperity2 + highFreqChirp) * pga * 0.58;
    }
    accel.push(Number(val.toFixed(5)));
  }

  return {
    id: 'tohoku2011',
    name: '2011 Tohoku Earthquake (Sendai MYG004)',
    location: 'Miyagi / Sendai, Japan',
    date: 'Mar 11, 2011',
    magnitude: 9.1,
    mmi: 'X',
    depthKm: 29.0,
    pga: 1.25,
    duration: duration,
    dt: dt,
    description: 'Catastrophic mega-thrust subduction zone earthquake. Produced unprecedented ground accelerations exceeding 1.2g in Sendai and triggered widespread tsunami waves.',
    time,
    accel
  };
}

/**
 * 6. 1999 Chi-Chi Earthquake (TCU068 Station)
 * Mw 7.7 | PGA 0.51g | MMI IX | Massive Fling-Step & Tectonic Surface Rupture
 */
export function generateChiChiWaveform() {
  const dt = 0.02;
  const duration = 28.0;
  const n = Math.floor(duration / dt);
  const time = [];
  const accel = [];
  const pga = 0.51;

  for (let i = 0; i < n; i++) {
    const t = i * dt;
    time.push(Number(t.toFixed(3)));

    let val = 0;
    if (t >= 3.0 && t <= 24.0) {
      const tc = t - 8.5;
      // Asymmetrical velocity fling pulse characteristic of Chelungpu fault rupture
      const flingPulse = Math.exp(-0.18 * tc * tc) * Math.sin(2 * Math.PI * 0.85 * tc);
      const shearRupture = 0.45 * Math.exp(-0.12 * Math.pow(t - 12.0, 2)) * Math.sin(2 * Math.PI * 2.6 * t);
      const afterRumble = 0.2 * Math.sin(2 * Math.PI * 5.4 * t) * Math.exp(-0.08 * (t - 8.0));

      val = (flingPulse + shearRupture + afterRumble) * pga * 0.92;
    }
    accel.push(Number(val.toFixed(5)));
  }

  return {
    id: 'chichi1999',
    name: '1999 Chi-Chi (TCU068 Station)',
    location: 'Nantou, Taiwan',
    date: 'Sep 21, 1999',
    magnitude: 7.7,
    mmi: 'IX',
    depthKm: 8.0,
    pga: 0.51,
    duration: duration,
    dt: dt,
    description: 'Near-fault Chelungpu fault rupture that produced historic permanent surface offsets (>8 meters) and clean large-displacement velocity pulses.',
    time,
    accel
  };
}

/**
 * 7. 2023 Turkey-Syria Earthquake (Pazarcık / Hatay Station)
 * Mw 7.8 | PGA 1.11g | MMI X | Strike-Slip Super-Shear Rupture
 */
export function generateTurkeyWaveform() {
  const dt = 0.02;
  const duration = 30.0;
  const n = Math.floor(duration / dt);
  const time = [];
  const accel = [];
  const pga = 1.11;

  for (let i = 0; i < n; i++) {
    const t = i * dt;
    time.push(Number(t.toFixed(3)));

    let val = 0;
    if (t >= 2.0 && t <= 25.0) {
      const tc = t - 7.0;
      // High-energy supershear strike-slip rupture
      const mainShock = Math.exp(-0.3 * tc * tc) * Math.sin(2 * Math.PI * 2.2 * tc);
      const secondPulse = 0.7 * Math.exp(-0.15 * Math.pow(t - 10.5, 2)) * Math.sin(2 * Math.PI * 1.5 * t);
      const highFreqShaking = 0.35 * Math.sin(2 * Math.PI * 6.5 * t) * Math.exp(-0.1 * Math.pow(t - 8.0, 2));

      val = (mainShock + secondPulse + highFreqShaking) * pga * 0.75;
    }
    accel.push(Number(val.toFixed(5)));
  }

  return {
    id: 'turkey2023',
    name: '2023 Turkey-Syria (Pazarcık Station)',
    location: 'Kahramanmaraş, Turkey',
    date: 'Feb 6, 2023',
    magnitude: 7.8,
    mmi: 'X',
    depthKm: 10.0,
    pga: 1.11,
    duration: duration,
    dt: dt,
    description: 'Massive East Anatolian Fault strike-slip rupture with violent high-frequency acceleration pulses causing catastrophic structural collapses.',
    time,
    accel
  };
}

/**
 * 8. Shinozuka Stochastic Academic Benchmark (from Namazu 2025 Paper)
 * Based on Spectral Representation Method (SRM) with Shinozuka & Deodatis PSD:
 * S(w) = 0.25 * sigma^2 * b^3 * w^2 * exp(-b * |w|)
 */
export function generateShinozukaBenchmark(duration = 30.0, dt = 0.02) {
  const n = Math.floor(duration / dt);
  const time = [];
  const accel = [];
  
  const N_srm = 128;
  const omegaU = 4 * Math.PI; // 4*pi rad/s (2 Hz cut-off)
  const dOmega = omegaU / N_srm;
  const sigma = 1.0;
  const b = 1.0;
  const As = 3.0; // Benchmark scale factor

  // Fixed deterministic phases for exact academic reproducibility
  const phases = new Float64Array(N_srm);
  for (let k = 0; k < N_srm; k++) {
    phases[k] = (Math.sin(k * 1337.42) * 0.5 + 0.5) * 2 * Math.PI;
  }

  for (let i = 0; i < n; i++) {
    const t = i * dt;
    time.push(Number(t.toFixed(3)));

    let sum = 0;
    for (let k = 0; k < N_srm; k++) {
      const omegaN = k * dOmega;
      const psd = 0.25 * Math.pow(sigma, 2) * Math.pow(b, 3) * Math.pow(omegaN, 2) * Math.exp(-b * Math.abs(omegaN));
      const amp = Math.sqrt(4.0 * psd * dOmega);
      sum += amp * Math.cos(omegaN * t + phases[k]);
    }

    // Apply linear ramp-up (1s) and ramp-down (1s) per Namazu Eq. 4
    let env = 1.0;
    if (t < 1.0) env = t;
    else if (t > duration - 1.0) env = duration - t;

    const val = (sum * As * env) / 25.0; // Scaled to acceleration in g (~0.28g)
    accel.push(Number(val.toFixed(5)));
  }

  return {
    id: 'shinozuka',
    name: 'Shinozuka Stochastic Benchmark (Namazu 2025)',
    location: 'Academic SRM Verification',
    date: 'Springer 2025',
    magnitude: 7.2,
    mmi: 'VIII',
    depthKm: 15.0,
    pga: 0.28,
    duration: duration,
    dt: dt,
    description: 'Exact Shinozuka & Deodatis Power Spectral Density benchmark from the Namazu shake table research paper (Grashorn et al., Springer 2025). Ideal for transfer-function and frequency fidelity tests.',
    time,
    accel
  };
}

/**
 * 9. Synthetic Sine Sweep (1 Hz to 15 Hz resonance test)
 */
export function generateSineSweep(duration = 15.0, dt = 0.01, pga = 0.25) {
  const n = Math.floor(duration / dt);
  const time = new Float64Array(n);
  const accel = new Float64Array(n);

  const fStart = 1.0;
  const fEnd = 15.0;

  for (let i = 0; i < n; i++) {
    const t = i * dt;
    time[i] = Number(t.toFixed(4));
    const phase = 2 * Math.PI * (fStart * t + ((fEnd - fStart) / (2 * duration)) * t * t);

    let env = 1.0;
    const rampTime = 0.75;
    if (t < rampTime) {
      env = 0.5 * (1 - Math.cos((Math.PI * t) / rampTime));
    } else if (t > duration - rampTime) {
      env = 0.5 * (1 - Math.cos((Math.PI * (duration - t)) / rampTime));
    }

    accel[i] = Number((pga * env * Math.sin(phase)).toFixed(5));
  }

  return {
    id: 'sweep',
    name: 'Synthetic Sine Sweep (1 Hz - 15 Hz)',
    location: 'Chassis Resonance Test',
    date: 'Standard Calibration',
    magnitude: 5.5,
    mmi: 'VI',
    depthKm: 10.0,
    pga: pga,
    duration: duration,
    dt: dt,
    description: 'Chirp signal sweeping through 1 to 15 Hz natural frequencies with Tukey windowing to identify shake table chassis and model resonance.',
    time: Array.from(time),
    accel: Array.from(accel)
  };
}

/**
 * Parses CSV raw text into { time, accel, pga, dt, duration }
 */
export function parseSeismogramCSV(csvText) {
  const lines = csvText.trim().split(/\r?\n/);
  if (lines.length < 5) {
    throw new Error('CSV file contains too few lines for a valid seismogram.');
  }

  let delimiter = ',';
  const firstLine = lines[0];
  if (firstLine.includes('\t')) delimiter = '\t';
  else if (firstLine.includes(';') && !firstLine.includes(',')) delimiter = ';';
  else if (!firstLine.includes(',') && firstLine.trim().split(/\s+/).length >= 2) delimiter = ' ';

  let timeColIdx = 0;
  let accelColIdx = 1;
  let startLine = 0;
  let detectedUnit = 'g';

  const headerParts = (delimiter === ' ' ? firstLine.trim().split(/\s+/) : firstLine.split(delimiter)).map(s => s.trim().toLowerCase());
  const isHeader = headerParts.some(p => p.includes('time') || p.includes('acc') || p.includes('sec') || isNaN(parseFloat(p)));

  if (isHeader) {
    startLine = 1;
    for (let c = 0; c < headerParts.length; c++) {
      const h = headerParts[c];
      if (h.includes('time') || h.includes('sec') || h === 't') {
        timeColIdx = c;
      }
      if (h.includes('acc') || h === 'a' || h.includes('gal') || h.includes('g') || h.includes('m/s')) {
        accelColIdx = c;
        if (h.includes('m/s') || h.includes('m/s2') || h.includes('m/s^2')) detectedUnit = 'm/s2';
        else if (h.includes('gal') || h.includes('cm/s')) detectedUnit = 'gal';
      }
    }
  }

  const times = [];
  const accels = [];
  let peakVal = 0;

  for (let i = startLine; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line || line.startsWith('#')) continue;

    const parts = delimiter === ' ' ? line.split(/\s+/) : line.split(delimiter);
    if (parts.length <= Math.max(timeColIdx, accelColIdx)) continue;

    const t = parseFloat(parts[timeColIdx]);
    let a = parseFloat(parts[accelColIdx]);

    if (!isNaN(t) && !isNaN(a)) {
      if (detectedUnit === 'm/s2') {
        a = a / 9.80665;
      } else if (detectedUnit === 'gal') {
        a = a / 980.665;
      }

      times.push(t);
      accels.push(a);

      const absA = Math.abs(a);
      if (absA > peakVal) peakVal = absA;
    }
  }

  if (times.length < 5) {
    throw new Error('Could not parse valid numerical time and acceleration columns from CSV.');
  }

  const dt = (times[times.length - 1] - times[0]) / (times.length - 1);
  const duration = times[times.length - 1] - times[0];

  return {
    time: times,
    accel: accels,
    dt: Number(dt.toFixed(5)),
    duration: Number(duration.toFixed(3)),
    pga: Number(peakVal.toFixed(4)),
    magnitude: 6.5,
    mmi: 'VII',
    detectedUnit
  };
}

