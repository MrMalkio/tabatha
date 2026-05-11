import React, { useState, useRef, useCallback } from 'react';

/**
 * VoiceInput — Speech-to-text input using the Web Speech API.
 * Provides a mic button that toggles voice recognition.
 * Transcribed text is passed to onResult callback.
 *
 * Falls back gracefully if SpeechRecognition is unavailable.
 */
export function VoiceInput({ onResult, placeholder = 'Tap mic to speak...', disabled = false, size = 'sm' }) {
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [error, setError] = useState(null);
  const recognitionRef = useRef(null);

  const SpeechRecognition = typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition);

  const startListening = useCallback(() => {
    if (!SpeechRecognition) {
      setError('Speech recognition not supported');
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognition.onstart = () => {
      setListening(true);
      setError(null);
    };

    recognition.onresult = (event) => {
      let finalTranscript = '';
      let interimTranscript = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          finalTranscript += result[0].transcript;
        } else {
          interimTranscript += result[0].transcript;
        }
      }
      setTranscript(finalTranscript || interimTranscript);
      if (finalTranscript) {
        onResult?.(finalTranscript.trim());
      }
    };

    recognition.onerror = (event) => {
      setError(event.error === 'not-allowed' ? 'Microphone access denied' : `Error: ${event.error}`);
      setListening(false);
    };

    recognition.onend = () => {
      setListening(false);
    };

    recognitionRef.current = recognition;
    recognition.start();
  }, [SpeechRecognition, onResult]);

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop();
    setListening(false);
  }, []);

  const toggle = useCallback(() => {
    if (listening) stopListening();
    else startListening();
  }, [listening, startListening, stopListening]);

  const fontSize = size === 'sm' ? '11px' : '13px';

  if (!SpeechRecognition) {
    return null; // Silently hide if unsupported
  }

  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
      <button
        onClick={toggle}
        disabled={disabled}
        title={listening ? 'Stop listening' : 'Voice input'}
        style={{
          background: listening ? '#ef5350' : 'transparent',
          border: `1px solid ${listening ? '#ef5350' : 'var(--color-border)'}`,
          color: listening ? '#fff' : 'var(--color-text-muted)',
          borderRadius: '50%',
          width: size === 'sm' ? '24px' : '32px',
          height: size === 'sm' ? '24px' : '32px',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: disabled ? 'not-allowed' : 'pointer',
          fontSize: size === 'sm' ? '12px' : '16px',
          transition: 'all 0.2s',
          animation: listening ? 'pulse 1.5s infinite' : 'none',
          opacity: disabled ? 0.4 : 1,
        }}
      >
        {listening ? '⏹' : '🎙'}
      </button>
      {listening && transcript && (
        <span style={{ fontSize, color: 'var(--color-text-muted)', fontStyle: 'italic', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {transcript}
        </span>
      )}
      {error && (
        <span style={{ fontSize: '9px', color: '#ef5350' }}>{error}</span>
      )}
      <style>{`
        @keyframes pulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(239,83,80,0.4); }
          50% { box-shadow: 0 0 0 6px rgba(239,83,80,0); }
        }
      `}</style>
    </div>
  );
}
