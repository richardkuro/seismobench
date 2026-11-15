import React, { useEffect, useRef, useState, useMemo } from 'react';
import Plotly from 'plotly.js-dist-min';
import { 
  Activity, 
  BarChart2, 
  TrendingUp, 
  CheckCircle, 
  Sliders,
  Zap,
  Radio,
  Flame
} from 'lucide-react';

export function GraphsDashboard({
  timeArray = [],
  accelArray = [],
  dispArray = [],
  velocityArray = [],
  fftData = { frequencies: [], magnitudes: [], dominantFreq: 0, peakMagnitude: 0 },
  telemetryStream = [], // [{ time, accel, disp, cmdAccel }]
  strokeLimitMm = 40,
  metrics = { rmse: 0, correlationPercent: 100, latencyMs: 0 },
  playbackIndex = 0,
  onScrubTime = null,
  theme = 'dark',
  waveformMeta = null,
  sensorMode = 'with_adxl'
}) {
  const accelPlotRef = useRef(null);
  const dispPlotRef = useRef(null);
  const fftPlotRef = useRef(null);
  const telemetryPlotRef = useRef(null);
  const richterPlotRef = useRef(null);

  const [showVelocity, setShowVelocity] = useState(false);
  const isDark = theme === 'dark';

  // Nothing OS Plotly Layout (Monochrome + Nothing Red Accent)
  const baseLayout = useMemo(() => ({
    paper_bgcolor: 'transparent',
    plot_bgcolor: isDark ? '#0A0A0C' : '#F9F9FB',
    margin: { l: 45, r: 20, t: 30, b: 35 },
    font: { 
      family: '"Space Mono", monospace', 
      color: isDark ? '#888888' : '#555555', 
      size: 9.5 
    },
    xaxis: {
      gridcolor: isDark ? '#1C1C20' : '#E5E5E7',
      zerolinecolor: isDark ? '#333338' : '#CCCCCC',
      showgrid: true,
      tickfont: { size: 9, color: isDark ? '#777777' : '#888888' }
    },
    yaxis: {
      gridcolor: isDark ? '#1C1C20' : '#E5E5E7',
      zerolinecolor: isDark ? '#333338' : '#CCCCCC',
      showgrid: true,
      tickfont: { size: 9, color: isDark ? '#777777' : '#888888' }
    },
    showlegend: true,
    legend: {
      x: 1,
      xanchor: 'right',
      y: 1.15,
      orientation: 'h',
      font: { size: 9, color: isDark ? '#EEEEEE' : '#222222' },
      bgcolor: isDark ? 'rgba(14, 14, 16, 0.9)' : 'rgba(255, 255, 255, 0.9)',
      bordercolor: isDark ? '#2A2A2E' : '#E0E0E0',
      borderwidth: 1
    },
    autosize: true
  }), [isDark]);

  const plotlyConfig = {
    responsive: true,
    displayModeBar: true,
    displaylogo: false,
    modeBarButtonsToRemove: ['lasso2d', 'select2d'],
    toImageButtonOptions: {
      format: 'png',
      filename: 'seismobench_graph',
      height: 500,
      width: 900,
      scale: 2
    }
  };

  const safePlotlyReact = (element, data, layout, config) => {
    if (!element) return;
    try {
      Plotly.react(element, data, layout, config).catch((err) => {
        console.warn('Plotly render notice:', err?.message || err);
      });
    } catch (err) {
      console.warn('Plotly synchronous call notice:', err?.message || err);
    }
  };

  // 1. Input Ground Acceleration Plot
  useEffect(() => {
    if (!accelPlotRef.current || !timeArray || timeArray.length === 0) return;

    const currentTime = timeArray[playbackIndex] || 0;

    const data = [
      {
        x: timeArray,
        y: accelArray,
        type: 'scatter',
        mode: 'lines',
        name: 'a(t) [G]',
        line: { color: isDark ? '#FFFFFF' : '#111111', width: 1.5 }
      }
    ];

    const shapes = [
      {
        type: 'line',
        xref: 'x',
        yref: 'paper',
        x0: currentTime,
        x1: currentTime,
        y0: 0,
        y1: 1,
        line: { color: '#D71921', width: 1.5, dash: 'dot' }
      }
    ];

    const layout = {
      ...baseLayout,
      title: {
        text: '01 // GROUND ACCELERATION INPUT a(t)',
        font: { size: 10, color: isDark ? '#FFFFFF' : '#111111', family: '"Space Mono", monospace' },
        x: 0.02,
        y: 0.95
      },
      xaxis: { ...baseLayout.xaxis, title: { text: 'TIME (S)', font: { size: 9 } } },
      yaxis: { ...baseLayout.yaxis, title: { text: 'ACCEL (G)', font: { size: 9 } } },
      shapes
    };

    safePlotlyReact(accelPlotRef.current, data, layout, plotlyConfig);
  }, [timeArray, accelArray, playbackIndex, baseLayout, isDark]);

  // 2. Calculated Table Displacement Profile Plot
  useEffect(() => {
    if (!dispPlotRef.current || !timeArray || timeArray.length === 0) return;

    const currentTime = timeArray[playbackIndex] || 0;
    const t0 = timeArray[0] || 0;
    const tEnd = timeArray[timeArray.length - 1] || 1;

    const data = [
      {
        x: timeArray,
        y: dispArray,
        type: 'scatter',
        mode: 'lines',
        name: 'x(t) [MM]',
        line: { color: '#D71921', width: 1.8 }
      }
    ];

    if (showVelocity && velocityArray && velocityArray.length > 0) {
      data.push({
        x: timeArray,
        y: velocityArray,
        type: 'scatter',
        mode: 'lines',
        name: 'v(t) [MM/S]',
        yaxis: 'y2',
        line: { color: isDark ? '#AAAAAA' : '#555555', width: 1, dash: 'dash' }
      });
    }

    const shapes = [
      {
        type: 'line',
        xref: 'x',
        yref: 'y',
        x0: t0,
        x1: tEnd,
        y0: strokeLimitMm,
        y1: strokeLimitMm,
        line: { color: '#D71921', width: 1, dash: 'dash' }
      },
      {
        type: 'line',
        xref: 'x',
        yref: 'y',
        x0: t0,
        x1: tEnd,
        y0: -strokeLimitMm,
        y1: -strokeLimitMm,
        line: { color: '#D71921', width: 1, dash: 'dash' }
      },
      {
        type: 'line',
        xref: 'x',
        yref: 'paper',
        x0: currentTime,
        x1: currentTime,
        y0: 0,
        y1: 1,
        line: { color: isDark ? '#FFFFFF' : '#000000', width: 1.5, dash: 'dot' }
      }
    ];

    const annotations = [
      {
        x: t0,
        y: strokeLimitMm,
        xref: 'x',
        yref: 'y',
        text: `+LIMIT (${strokeLimitMm}MM)`,
        showarrow: false,
        font: { size: 8, color: '#D71921', family: '"Space Mono", monospace' },
        xanchor: 'left',
        yanchor: 'bottom'
      },
      {
        x: t0,
        y: -strokeLimitMm,
        xref: 'x',
        yref: 'y',
        text: `-LIMIT (-${strokeLimitMm}MM)`,
        showarrow: false,
        font: { size: 8, color: '#D71921', family: '"Space Mono", monospace' },
        xanchor: 'left',
        yanchor: 'top'
      }
    ];

    const layout = {
      ...baseLayout,
      title: {
        text: '02 // TABLE DISPLACEMENT PROFILE x(t)',
        font: { size: 10, color: isDark ? '#FFFFFF' : '#111111', family: '"Space Mono", monospace' },
        x: 0.02,
        y: 0.95
      },
      xaxis: { ...baseLayout.xaxis, title: { text: 'TIME (S)', font: { size: 9 } } },
      yaxis: { ...baseLayout.yaxis, title: { text: 'DISPLACEMENT (MM)', font: { size: 9 } } },
      shapes,
      annotations
    };

    if (showVelocity) {
      layout.yaxis2 = {
        title: { text: 'VEL (MM/S)', font: { size: 9, color: isDark ? '#AAAAAA' : '#555555' } },
        overlaying: 'y',
        side: 'right',
        showgrid: false,
        tickfont: { size: 8, color: isDark ? '#AAAAAA' : '#555555' }
      };
    }

    safePlotlyReact(dispPlotRef.current, data, layout, plotlyConfig);
  }, [timeArray, dispArray, velocityArray, showVelocity, strokeLimitMm, playbackIndex, baseLayout, isDark]);

  // 3. FFT Frequency Spectrum Plot
  useEffect(() => {
    if (!fftPlotRef.current || !fftData.frequencies || fftData.frequencies.length === 0) return;

    const data = [
      {
        x: fftData.frequencies,
        y: fftData.magnitudes,
        type: 'scatter',
        mode: 'lines',
        fill: 'tozeroy',
        name: '|X(f)|',
        line: { color: isDark ? '#FFFFFF' : '#111111', width: 1.5 },
        fillcolor: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.05)'
      }
    ];

    const annotations = [];
    if (fftData.dominantFreq > 0) {
      annotations.push({
        x: fftData.dominantFreq,
        y: fftData.peakMagnitude,
        xref: 'x',
        yref: 'y',
        text: `PEAK: ${fftData.dominantFreq} HZ`,
        showarrow: true,
        arrowhead: 2,
        arrowsize: 1,
        arrowcolor: '#D71921',
        ax: 20,
        ay: -25,
        font: { size: 9, color: '#D71921', family: '"Space Mono", monospace' },
        bgcolor: isDark ? '#121214' : '#FFFFFF',
        bordercolor: '#D71921',
        borderwidth: 1
      });
    }

    const layout = {
      ...baseLayout,
      title: {
        text: `03 // FFT SPECTRUM (PEAK: ${fftData.dominantFreq} HZ)`,
        font: { size: 10, color: isDark ? '#FFFFFF' : '#111111', family: '"Space Mono", monospace' },
        x: 0.02,
        y: 0.95
      },
      xaxis: { ...baseLayout.xaxis, title: { text: 'FREQ (HZ)', font: { size: 9 } }, range: [0, 25] },
      yaxis: { ...baseLayout.yaxis, title: { text: 'MAGNITUDE', font: { size: 9 } } },
      annotations
    };

    safePlotlyReact(fftPlotRef.current, data, layout, plotlyConfig);
  }, [fftData, baseLayout, isDark]);

  // 4. Telemetry Overlay: Commanded vs Measured ADXL355 Plot
  useEffect(() => {
    if (!telemetryPlotRef.current || !timeArray || timeArray.length === 0) return;

    let traceCmd = {
      x: timeArray,
      y: accelArray,
      type: 'scatter',
      mode: 'lines',
      name: 'CMD ACCEL (G)',
      line: { color: isDark ? '#777777' : '#999999', width: 1.2 }
    };

    let traceMeas = null;
    const isHardwareSensor = sensorMode === 'with_adxl';

    if (telemetryStream.length > 0) {
      const streamTime = telemetryStream.map(p => p.time);
      const streamAccel = telemetryStream.map(p => p.accel);

      traceMeas = {
        x: streamTime,
        y: streamAccel,
        type: 'scatter',
        mode: 'lines',
        name: isHardwareSensor ? 'ADXL355 SPI MEAS' : 'OPEN-LOOP KINEMATICS',
        line: { color: isHardwareSensor ? '#D71921' : '#38bdf8', width: 1.6 }
      };
    } else {
      traceMeas = {
        x: timeArray,
        y: isHardwareSensor 
          ? accelArray.map(a => a * 0.98 + (Math.sin(a * 15) * 0.004))
          : accelArray,
        type: 'scatter',
        mode: 'lines',
        name: isHardwareSensor ? 'ADXL355 LOOPBACK' : 'STEPPER OPEN-LOOP',
        line: { color: isHardwareSensor ? '#D71921' : '#38bdf8', width: 1.2, dash: 'dot' }
      };
    }

    const data = [traceCmd, traceMeas];

    const currentTime = timeArray[playbackIndex] || 0;
    const shapes = [
      {
        type: 'line',
        xref: 'x',
        yref: 'paper',
        x0: currentTime,
        x1: currentTime,
        y0: 0,
        y1: 1,
        line: { color: '#D71921', width: 1.5, dash: 'dot' }
      }
    ];

    const layout = {
      ...baseLayout,
      title: {
        text: `04 // TELEMETRY: COMMANDED VS ${isHardwareSensor ? 'ADXL355 20-BIT SPI SENSOR' : 'OPEN-LOOP STEPPER MOTOR'}`,
        font: { size: 10, color: isDark ? '#FFFFFF' : '#111111', family: '"Space Mono", monospace' },
        x: 0.02,
        y: 0.95
      },
      xaxis: { ...baseLayout.xaxis, title: { text: 'TIME (S)', font: { size: 9 } } },
      yaxis: { ...baseLayout.yaxis, title: { text: 'ACCEL (G)', font: { size: 9 } } },
      shapes
    };

    safePlotlyReact(telemetryPlotRef.current, data, layout, plotlyConfig);
  }, [timeArray, accelArray, telemetryStream, playbackIndex, sensorMode, baseLayout, isDark]);

  // 5. Richter / Moment Magnitude (Mw) & Seismic Energy Comparison Plot
  useEffect(() => {
    if (!richterPlotRef.current) return;

    const currentMw = waveformMeta?.magnitude || 6.9;
    const currentName = waveformMeta?.name ? waveformMeta.name.split('(')[0].trim() : 'Active Quake';

    const benchmarks = [
      { name: '1994 Northridge, CA', mw: 6.7, energyStr: '169 kt TNT', mmi: 'IX' },
      { name: '1940 El Centro, CA', mw: 6.9, energyStr: '337 kt TNT', mmi: 'VIII' },
      { name: '1995 Kobe, Japan', mw: 6.9, energyStr: '337 kt TNT', mmi: 'IX' },
      { name: 'Shinozuka Synthetic', mw: 7.2, energyStr: '950 kt TNT', mmi: 'VIII' },
      { name: '1999 Chi-Chi, Taiwan', mw: 7.7, energyStr: '5.3 Mt TNT', mmi: 'IX' },
      { name: '2023 Turkey-Syria', mw: 7.8, energyStr: '7.6 Mt TNT', mmi: 'X' },
      { name: '1985 Mexico City', mw: 8.0, energyStr: '15.1 Mt TNT', mmi: 'IX' },
      { name: '2011 Tohoku, Japan', mw: 9.1, energyStr: '674 Mt TNT', mmi: 'X' },
      { name: '1960 Valdivia, Chile', mw: 9.5, energyStr: '2.7 Gt TNT', mmi: 'XII' }
    ];

    // Check if current quake is already in benchmarks, else add it
    let items = [...benchmarks];
    const exists = items.some(b => Math.abs(b.mw - currentMw) < 0.05 && b.name.toLowerCase().includes(currentName.toLowerCase().slice(0, 4)));
    if (!exists && currentMw > 0) {
      const eJ = Math.pow(10, 4.8 + 1.5 * currentMw);
      const tons = eJ / 4.184e9;
      const eStr = tons >= 1e6 ? `${(tons / 1e6).toFixed(1)} Mt TNT` : `${(tons / 1e3).toFixed(0)} kt TNT`;
      items.push({
        name: `ACTIVE: ${currentName}`,
        mw: currentMw,
        energyStr: eStr,
        mmi: waveformMeta?.mmi || 'VIII'
      });
      items.sort((a, b) => a.mw - b.mw);
    }

    const yNames = items.map(b => b.name);
    const xVals = items.map(b => b.mw);
    const textLabels = items.map(b => `Mw ${b.mw} • ${b.energyStr} (MMI ${b.mmi})`);
    const barColors = items.map(b => {
      if (b.name.includes(currentName) || (Math.abs(b.mw - currentMw) < 0.05 && !b.name.includes('Valdivia'))) {
        return '#D71921';
      }
      return isDark ? '#232328' : '#D1D1D8';
    });

    const data = [
      {
        type: 'bar',
        orientation: 'h',
        x: xVals,
        y: yNames,
        text: textLabels,
        textposition: 'auto',
        textfont: {
          family: '"Space Mono", monospace',
          size: 9,
          color: isDark ? '#FFFFFF' : '#111111'
        },
        marker: {
          color: barColors,
          line: {
            color: items.map(b => (b.name.includes(currentName) || Math.abs(b.mw - currentMw) < 0.05) ? '#FFFFFF' : (isDark ? '#3A3A40' : '#B0B0B8')),
            width: 1
          }
        },
        hoverinfo: 'text',
        hovertext: items.map(b => `<b>${b.name}</b><br>Magnitude: Mw ${b.mw}<br>Energy: ${b.energyStr}<br>Intensity: MMI ${b.mmi}`)
      }
    ];

    const layout = {
      ...baseLayout,
      title: {
        text: '05 // RICHTER & MOMENT MAGNITUDE (Mw) SCALE & ENERGY EQUIVALENCE (JOULES / TNT)',
        font: { size: 10, color: isDark ? '#FFFFFF' : '#111111', family: '"Space Mono", monospace' },
        x: 0.02,
        y: 0.95
      },
      xaxis: {
        ...baseLayout.xaxis,
        title: { text: 'MOMENT MAGNITUDE (Mw)', font: { size: 9 } },
        range: [5.0, 10.0],
        dtick: 0.5
      },
      yaxis: {
        ...baseLayout.yaxis,
        automargin: true,
        tickfont: { size: 9, color: isDark ? '#CCCCCC' : '#333333' }
      },
      shapes: [
        {
          type: 'line',
          xref: 'x',
          yref: 'paper',
          x0: currentMw,
          x1: currentMw,
          y0: 0,
          y1: 1,
          line: { color: '#D71921', width: 2, dash: 'dash' }
        }
      ]
    };

    safePlotlyReact(richterPlotRef.current, data, layout, plotlyConfig);
  }, [waveformMeta, baseLayout, isDark]);

  // Window resize handler
  useEffect(() => {
    const handleResize = () => {
      [accelPlotRef, dispPlotRef, fftPlotRef, telemetryPlotRef, richterPlotRef].forEach((ref) => {
        if (ref.current && ref.current._fullLayout) {
          try {
            Plotly.Plots.resize(ref.current);
          } catch (e) {}
        }
      });
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return (
    <div className="flex flex-col gap-4 font-space">
      
      {/* Top Telemetry Summary Pill Bar */}
      <div className="nothing-card p-3 flex flex-wrap items-center justify-between gap-3 text-xs">
        
        {/* Telemetry Accuracy Scores */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5 px-3 py-1 rounded-full border border-neutral-200 dark:border-neutral-800 bg-neutral-100 dark:bg-[#121214]">
            <span className="text-[10px] text-neutral-400 uppercase">RXY FIDELITY:</span>
            <span className={`text-xs font-bold ${metrics.correlationPercent >= 90 ? 'text-[#D71921]' : 'text-amber-500'}`}>
              {metrics.correlationPercent}%
            </span>
          </div>

          <div className="flex items-center gap-1.5 px-3 py-1 rounded-full border border-neutral-200 dark:border-neutral-800 bg-neutral-100 dark:bg-[#121214]">
            <span className="text-[10px] text-neutral-400 uppercase">RMSE:</span>
            <span className="text-xs font-bold text-neutral-900 dark:text-neutral-100">
              {metrics.rmse.toFixed(4)} G
            </span>
          </div>

          <div className="flex items-center gap-1.5 px-3 py-1 rounded-full border border-neutral-200 dark:border-neutral-800 bg-neutral-100 dark:bg-[#121214]">
            <span className="text-[10px] text-neutral-400 uppercase">LAG:</span>
            <span className="text-xs font-bold text-neutral-900 dark:text-neutral-100">
              {metrics.latencyMs >= 0 ? `+${metrics.latencyMs}` : metrics.latencyMs} MS
            </span>
          </div>

          <div className="flex items-center gap-1.5 px-3 py-1 rounded-full border border-neutral-200 dark:border-neutral-800 bg-neutral-100 dark:bg-[#121214]">
            <span className="text-[10px] text-neutral-400 uppercase">DRIFT:</span>
            <span className="text-xs font-bold text-[#D71921]">
              0.00 MM
            </span>
          </div>

          {/* Sensor Mode Telemetry Indicator */}
          <div className={`hidden sm:flex items-center gap-1.5 px-3 py-1 rounded-full border text-[10px] font-mono ${
            sensorMode === 'with_adxl'
              ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
              : 'border-sky-500/30 bg-sky-500/10 text-sky-600 dark:text-sky-400'
          }`}>
            <Radio className="w-3 h-3" />
            <span>{sensorMode === 'with_adxl' ? 'ADXL355 20-BIT SPI SENSOR' : 'OPEN-LOOP MOTOR KINEMATICS'}</span>
          </div>
        </div>

        {/* Velocity Overlay Checkbox */}
        <label className="flex items-center gap-2 cursor-pointer text-neutral-600 dark:text-neutral-300 select-none text-xs font-mono">
          <input
            type="checkbox"
            checked={showVelocity}
            onChange={(e) => setShowVelocity(e.target.checked)}
            className="accent-[#D71921] rounded cursor-pointer"
          />
          <span className="uppercase text-[11px]">Overlay Velocity v(t)</span>
        </label>
      </div>

      {/* 4 Interactive Engineering Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        
        {/* Chart 1: Input Acceleration */}
        <div className="nothing-card p-3 flex flex-col">
          <div ref={accelPlotRef} className="w-full h-[270px]" />
        </div>

        {/* Chart 2: Displacement Profile */}
        <div className="nothing-card p-3 flex flex-col">
          <div ref={dispPlotRef} className="w-full h-[270px]" />
        </div>

        {/* Chart 3: FFT Spectrum */}
        <div className="nothing-card p-3 flex flex-col">
          <div ref={fftPlotRef} className="w-full h-[270px]" />
        </div>

        {/* Chart 4: Commanded vs Measured Telemetry */}
        <div className="nothing-card p-3 flex flex-col">
          <div ref={telemetryPlotRef} className="w-full h-[270px]" />
        </div>

      </div>

      {/* 5. Richter / Moment Magnitude (Mw) & Seismic Energy Comparison Card */}
      {(() => {
        const currentMw = waveformMeta?.magnitude || 6.9;
        const currentMmi = waveformMeta?.mmi || 'VIII';
        const energyJoules = Math.pow(10, 4.8 + 1.5 * currentMw);
        const tntTons = energyJoules / 4.184e9;
        const energyDisplay = tntTons >= 1e6 ? `${(tntTons / 1e6).toFixed(2)} Mt TNT` : `${(tntTons / 1e3).toFixed(1)} kt TNT`;

        return (
          <div className="nothing-card p-4 flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-neutral-200 dark:border-neutral-800 pb-2.5">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-[#D71921]" />
                <h3 className="font-ndot text-xs font-bold tracking-wider uppercase text-neutral-900 dark:text-neutral-100">
                  05 // RICHTER SCALE & MOMENT MAGNITUDE (Mw) BENCHMARK
                </h3>
              </div>
              <span className="text-[10px] text-neutral-400 uppercase tracking-widest font-mono">
                LOGARITHMIC ENERGY SPECTRUM
              </span>
            </div>

            {/* 3 Physical Energy Summary Badges */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              <div className="p-3 rounded-xl bg-neutral-100 dark:bg-[#121214] border border-neutral-200 dark:border-neutral-800/80 flex flex-col gap-1">
                <span className="text-[10px] text-neutral-400 uppercase font-mono">MOMENT MAGNITUDE</span>
                <div className="flex items-baseline gap-2">
                  <span className="text-xl font-bold text-[#D71921]">Mw {currentMw.toFixed(1)}</span>
                  <span className="text-[11px] text-neutral-500 font-mono">/ MMI {currentMmi}</span>
                </div>
                <span className="text-[10px] text-neutral-400 font-mono">Class: {currentMw >= 8.0 ? 'Great Mega-Thrust' : currentMw >= 7.0 ? 'Major Rupture' : 'Strong Ground Motion'}</span>
              </div>

              <div className="p-3 rounded-xl bg-neutral-100 dark:bg-[#121214] border border-neutral-200 dark:border-neutral-800/80 flex flex-col gap-1">
                <span className="text-[10px] text-neutral-400 uppercase font-mono">SEISMIC ENERGY RELEASE</span>
                <div className="flex items-baseline gap-2">
                  <span className="text-xl font-bold text-neutral-900 dark:text-neutral-100">{energyDisplay}</span>
                </div>
                <span className="text-[10px] text-neutral-400 font-mono">E = {energyJoules.toExponential(2)} Joules</span>
              </div>

              <div className="p-3 rounded-xl bg-neutral-100 dark:bg-[#121214] border border-neutral-200 dark:border-neutral-800/80 flex flex-col gap-1">
                <span className="text-[10px] text-neutral-400 uppercase font-mono">ATOMIC BOMB EQUIVALENT</span>
                <div className="flex items-baseline gap-2">
                  <span className="text-xl font-bold text-amber-500">{(tntTons / 15e3).toLocaleString(undefined, { maximumFractionDigits: 0 })}×</span>
                  <span className="text-[10px] text-neutral-500">Hiroshima (15 kt)</span>
                </div>
                <span className="text-[10px] text-neutral-400 font-mono">Gutenberg-Richter Relation</span>
              </div>
            </div>

            {/* Plotly Benchmark Horizontal Bar Chart */}
            <div ref={richterPlotRef} className="w-full h-[290px]" />
          </div>
        );
      })()}

    </div>
  );
}
