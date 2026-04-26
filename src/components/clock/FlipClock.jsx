import React, { useEffect, useRef, useState, useCallback } from 'react';
import './FlipClock.css';

// ════════════════════════════════════════════
// Settings & Defaults
// ════════════════════════════════════════════

const DEFAULT_SETTINGS = {
  showClock: true,
  is24Hour: false,
  showClockSeconds: false,
  scale: 1.0,
  clockBrightness: 1.0,
  textColor: '#e0e0e0',

  showCountdown: false,
  showCountdownSeconds: true,
  countdownMode: 'daily', // 'daily' | 'custom'
  countdownDisplayFormat: 'MMMMss', // 'MMMMss' | 'MMMM:SS' | 'HH:MM:SS'
  customCountdownTarget: '17:00',
  countdownScale: 1.0,
  countdownBrightness: 1.0,
  countdownColor: '#448aff',
  enableZeroPulse: true,
  zeroPulseSpeed: 2.0,

  clockPosition: 'top', // 'top' | 'bottom'
  elementSpacing: 30,

  flipSpeed: 0.6,
};

function pad(n, len = 2) {
  return String(n).padStart(len, '0');
}

// ════════════════════════════════════════════
// FlipDigit — 3D split-flap animation
// 4-layer architecture:
//   1. .digital-bottom — static bottom, shows OLD during flip, then NEW
//   2. .digital-top — static top, ALWAYS shows NEW
//   3. .flap-top — animated top half of OLD, folds 0→-90°
//   4. .flap-bottom — animated bottom half of NEW, unfolds 90°→0°
// ════════════════════════════════════════════

function FlipDigit({ digit, speed = 0.6, small = false, pulse = false, pulseSpeed = 2 }) {
  const currRef = useRef(digit);
  const [prev, setPrev] = useState(digit);
  const [display, setDisplay] = useState(digit);
  const [flipping, setFlipping] = useState(false);

  const startFlip = useCallback((newDigit) => {
    setPrev(currRef.current);
    setDisplay(newDigit);
    currRef.current = newDigit;
    setFlipping(true);
  }, []);

  useEffect(() => {
    if (digit !== currRef.current) {
      startFlip(digit);
      const totalMs = (speed * 1000) + 50;
      const t = setTimeout(() => {
        setFlipping(false);
        setPrev(digit);
      }, totalMs);
      return () => clearTimeout(t);
    }
  }, [digit, startFlip, speed]);

  const sizeClass = small ? 'flip-digit-small' : '';
  const pulseClass = pulse ? 'pulse-red' : '';
  const animStyle = {
    '--flip-speed': `${speed}s`,
    '--pulse-speed': `${pulseSpeed}s`,
  };

  return (
    <div className={`flip-digit ${sizeClass} ${pulseClass} ${flipping ? 'flipping' : ''}`} style={animStyle}>
      <div className="digital-top" data-content={display}></div>
      <div className="digital-bottom" data-content={flipping ? prev : display}></div>
      <div className="flap-top" data-content={prev}></div>
      <div className="flap-bottom" data-content={display}></div>
    </div>
  );
}

// ════════════════════════════════════════════
// CountdownDisplay
// ════════════════════════════════════════════

function getLeadingZerosMask(digits, enabled) {
  if (!enabled) return digits.map(() => false);
  let stillZero = true;
  return digits.map(d => {
    if (d !== '0') stillZero = false;
    return stillZero;
  });
}

function CountdownDisplay({ config, totalSec, totalMin, seconds, label, subtext, flipSpeedVar }) {
  const fmt = config.countdownMode === 'daily' ? config.countdownDisplayFormat : 'HH:MM:SS';
  const secSpeed = Math.min(config.flipSpeed, 0.9);

  let digitElements;

  if (fmt === 'HH:MM:SS') {
    const h = pad(Math.floor(totalSec / 3600));
    const m = pad(Math.floor((totalSec % 3600) / 60));
    const s = pad(totalSec % 60);
    const digits = [h[0], h[1], m[0], m[1], s[0], s[1]];
    const pulseMask = getLeadingZerosMask(digits, config.enableZeroPulse);
    const ps = config.zeroPulseSpeed;

    digitElements = (
      <>
        <div className="flip-group">
          <FlipDigit digit={digits[0]} speed={config.flipSpeed} pulse={pulseMask[0]} pulseSpeed={ps} />
          <FlipDigit digit={digits[1]} speed={config.flipSpeed} pulse={pulseMask[1]} pulseSpeed={ps} />
        </div>
        <div className="clock-colon">:</div>
        <div className="flip-group">
          <FlipDigit digit={digits[2]} speed={config.flipSpeed} pulse={pulseMask[2]} pulseSpeed={ps} />
          <FlipDigit digit={digits[3]} speed={config.flipSpeed} pulse={pulseMask[3]} pulseSpeed={ps} />
        </div>
        {config.showCountdownSeconds && (
          <>
            <div className="clock-colon">:</div>
            <div className="flip-group">
              <FlipDigit digit={digits[4]} speed={secSpeed} pulse={pulseMask[4]} pulseSpeed={ps} />
              <FlipDigit digit={digits[5]} speed={secSpeed} pulse={pulseMask[5]} pulseSpeed={ps} />
            </div>
          </>
        )}
      </>
    );
  } else {
    const minStr = pad(totalMin, 4);
    const sStr = pad(seconds);
    const digits = [minStr[0], minStr[1], minStr[2], minStr[3], sStr[0], sStr[1]];
    const pulseMask = getLeadingZerosMask(digits, config.enableZeroPulse);
    const ps = config.zeroPulseSpeed;

    if (fmt === 'MMMM:SS') {
      digitElements = (
        <>
          <div className="flip-group">
            <FlipDigit digit={digits[0]} speed={config.flipSpeed} pulse={pulseMask[0]} pulseSpeed={ps} />
            <FlipDigit digit={digits[1]} speed={config.flipSpeed} pulse={pulseMask[1]} pulseSpeed={ps} />
          </div>
          <div className="flip-group">
            <FlipDigit digit={digits[2]} speed={config.flipSpeed} pulse={pulseMask[2]} pulseSpeed={ps} />
            <FlipDigit digit={digits[3]} speed={config.flipSpeed} pulse={pulseMask[3]} pulseSpeed={ps} />
          </div>
          {config.showCountdownSeconds && (
            <>
              <div className="clock-colon">:</div>
              <div className="flip-group">
                <FlipDigit digit={digits[4]} speed={secSpeed} pulse={pulseMask[4]} pulseSpeed={ps} />
                <FlipDigit digit={digits[5]} speed={secSpeed} pulse={pulseMask[5]} pulseSpeed={ps} />
              </div>
            </>
          )}
        </>
      );
    } else {
      digitElements = (
        <>
          <div className="flip-group">
            <FlipDigit digit={digits[0]} speed={config.flipSpeed} pulse={pulseMask[0]} pulseSpeed={ps} />
            <FlipDigit digit={digits[1]} speed={config.flipSpeed} pulse={pulseMask[1]} pulseSpeed={ps} />
          </div>
          <div className="flip-group">
            <FlipDigit digit={digits[2]} speed={config.flipSpeed} pulse={pulseMask[2]} pulseSpeed={ps} />
            <FlipDigit digit={digits[3]} speed={config.flipSpeed} pulse={pulseMask[3]} pulseSpeed={ps} />
          </div>
          {config.showCountdownSeconds && (
            <div className="countdown-small-seconds">
              <FlipDigit digit={digits[4]} speed={secSpeed} small pulse={pulseMask[4]} pulseSpeed={ps} />
              <FlipDigit digit={digits[5]} speed={secSpeed} small pulse={pulseMask[5]} pulseSpeed={ps} />
            </div>
          )}
        </>
      );
    }
  }

  return (
    <div
      className="clock-row countdown-row"
      style={{
        '--clock-scale': String(config.countdownScale),
        '--clock-brightness': String(config.countdownBrightness),
        '--clock-text-color': config.countdownColor,
        ...flipSpeedVar,
      }}
    >
      <div className="countdown-header">
        <div className="countdown-label">{label}</div>
        <div className="countdown-subtext">{subtext}</div>
      </div>
      <div className="countdown-digits">
        {digitElements}
      </div>
    </div>
  );
}

// ════════════════════════════════════════════
// FlipClock – Main exported component
// ════════════════════════════════════════════

export function FlipClock({ settings: externalSettings, className = '' }) {
  const [time, setTime] = useState(new Date());
  const config = { ...DEFAULT_SETTINGS, ...externalSettings };

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // ── Time calculation ──
  let hours = time.getHours();
  const isPM = hours >= 12;
  if (!config.is24Hour) {
    hours = hours % 12 || 12;
  }
  const hStr = pad(hours);
  const mStr = pad(time.getMinutes());
  const sStr = pad(time.getSeconds());

  // ── Countdown calculation ──
  let countdownTotalSec = 0;
  let countdownLabel = '1440 COUNTDOWN';
  let countdownSubtext = 'Minutes remaining until midnight';

  if (config.countdownMode === 'daily') {
    const secsPassed = time.getHours() * 3600 + time.getMinutes() * 60 + time.getSeconds();
    countdownTotalSec = Math.max(0, 86400 - secsPassed);
  } else {
    const [targetH, targetM] = config.customCountdownTarget.split(':').map(Number);
    const targetSec = (targetH || 0) * 3600 + (targetM || 0) * 60;
    const nowSec = time.getHours() * 3600 + time.getMinutes() * 60 + time.getSeconds();
    countdownTotalSec = Math.max(0, targetSec - nowSec);
    countdownLabel = 'CUSTOM COUNTDOWN';
    countdownSubtext = `Counting down to ${config.customCountdownTarget}`;
  }

  const cdTotalMin = Math.floor(countdownTotalSec / 60);
  const cdS = countdownTotalSec % 60;

  const flipSpeedVar = { '--flip-speed': `${config.flipSpeed}s` };
  const secSpeed = Math.min(config.flipSpeed, 0.9);

  // ── Clock element ──
  const clockElement = config.showClock ? (
    <div
      className="clock-row"
      style={{
        '--clock-scale': String(config.scale),
        '--clock-brightness': String(config.clockBrightness),
        '--clock-text-color': config.textColor,
        ...flipSpeedVar,
      }}
    >
      <div className="flip-group">
        <FlipDigit digit={hStr.charAt(0)} speed={config.flipSpeed} />
        <FlipDigit digit={hStr.charAt(1)} speed={config.flipSpeed} />
      </div>
      <div className="clock-colon">:</div>
      <div className="flip-group">
        <FlipDigit digit={mStr.charAt(0)} speed={config.flipSpeed} />
        <FlipDigit digit={mStr.charAt(1)} speed={config.flipSpeed} />
      </div>
      {config.showClockSeconds && (
        <>
          <div className="clock-colon">:</div>
          <div className="flip-group">
            <FlipDigit digit={sStr.charAt(0)} speed={secSpeed} />
            <FlipDigit digit={sStr.charAt(1)} speed={secSpeed} />
          </div>
        </>
      )}
      {!config.is24Hour && <div className="am-pm">{isPM ? 'PM' : 'AM'}</div>}
    </div>
  ) : null;

  // ── Countdown element ──
  const countdownElement = config.showCountdown ? (
    <CountdownDisplay
      config={config}
      totalSec={countdownTotalSec}
      totalMin={cdTotalMin}
      seconds={cdS}
      label={countdownLabel}
      subtext={countdownSubtext}
      flipSpeedVar={flipSpeedVar}
    />
  ) : null;

  // ── Order based on position ──
  const topEl = config.clockPosition === 'top' ? clockElement : countdownElement;
  const bottomEl = config.clockPosition === 'top' ? countdownElement : clockElement;

  return (
    <div className={`tabatha-clock-container ${className}`}>
      {topEl}
      {topEl && bottomEl && (
        <div style={{ height: config.elementSpacing }} />
      )}
      {bottomEl}
    </div>
  );
}

export { DEFAULT_SETTINGS as CLOCK_DEFAULTS };
