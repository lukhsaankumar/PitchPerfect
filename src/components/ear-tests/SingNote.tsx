import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, Mic, MicOff, RefreshCw } from "lucide-react";

interface SingNoteProps {
  onBack: () => void;
}

export const SingNote: React.FC<SingNoteProps> = ({ onBack }) => {
  const [currentFrequency, setCurrentFrequency] = useState<number | null>(null);
  const [listening, setListening] = useState(false);
  const [targetNote, setTargetNote] = useState<string>("");
  const [targetFrequency, setTargetFrequency] = useState<number>(0);
  const [feedback, setFeedback] = useState<string>("");
  const [success, setSuccess] = useState(false);
  const [selectedVoiceRange, setSelectedVoiceRange] = useState<string>("Baritone");

  // Hold UI/state
  const [holdProgress, setHoldProgress] = useState(0);

  // Audio graph refs
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Logic refs (avoid stale state in audio callback)
  const targetFrequencyRef = useRef<number>(0);
  const targetNoteRef = useRef<string>("");
  const successRef = useRef<boolean>(false);
  const holdTimerRef = useRef<NodeJS.Timeout | null>(null);
  const progressTimerRef = useRef<NodeJS.Timeout | null>(null);
  const holdingRef = useRef<boolean>(false);

  const noteStrings = ["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B"] as const;
  const A4 = 440; // Reference frequency for A4

  const HOLD_MS = 1000; // 1 second hold (continuous)
  const TOLERANCE_RATIO = 0.04; // ~20 cents

  const voiceRanges = {
    "Bass": { min: "E2", max: "E4" },
    "Baritone": { min: "A2", max: "A4" },
    "Tenor": { min: "C3", max: "B4" },
    "Countertenor": { min: "G3", max: "D5" },
    "Contralto": { min: "E3", max: "F5" },
    "Mezzo-soprano": { min: "A3", max: "A5" },
    "Soprano": { min: "C4", max: "C6" }
  };

  // ===== Note helpers =====
  const getNoteFrequency = (note: string, octave: number): number => {
    const noteIndex = noteStrings.indexOf(note as any);
    const midiNumber = (octave + 1) * 12 + noteIndex;
    return A4 * Math.pow(2, (midiNumber - 69) / 12);
  };

  const getNoteNumber = (note: string, octave: number): number => {
    const noteIndex = noteStrings.indexOf(note as any);
    return octave * 12 + noteIndex;
  };

  const getNotesInRange = (minNote: string, maxNote: string): string[] => {
    const minOctave = parseInt(minNote.slice(-1));
    const maxOctave = parseInt(maxNote.slice(-1));
    const minNoteBase = minNote.slice(0, -1);
    const maxNoteBase = maxNote.slice(0, -1);

    const minNoteNumber = getNoteNumber(minNoteBase, minOctave);
    const maxNoteNumber = getNoteNumber(maxNoteBase, maxOctave);

    const validNotes: string[] = [];
    for (let noteNum = minNoteNumber; noteNum <= maxNoteNumber; noteNum++) {
      const octave = Math.floor(noteNum / 12);
      const noteIndex = noteNum % 12;
      if (noteIndex >= 0 && noteIndex < noteStrings.length) {
        const noteName = noteStrings[noteIndex];
        // Keep natural notes only (per current behavior)
        if (!noteName.includes('♯')) validNotes.push(`${noteName}${octave}`);
      }
    }
    return validNotes;
  };

  const generateRandomTargetNote = useCallback(() => {
    const range = voiceRanges[selectedVoiceRange as keyof typeof voiceRanges];
    const validNotes = getNotesInRange(range.min, range.max);

    const pick = (noteString: string) => {
      const noteName = noteString.slice(0, -1);
      const octave = parseInt(noteString.slice(-1));
      const freq = getNoteFrequency(noteName, octave);
      targetFrequencyRef.current = freq;
      targetNoteRef.current = noteString;
      setTargetNote(noteString);
      setTargetFrequency(freq);
    };

    if (validNotes.length === 0) {
      const fallback = getNotesInRange("A2", "A4");
      pick(fallback[Math.floor(Math.random() * fallback.length)]);
    } else {
      pick(validNotes[Math.floor(Math.random() * validNotes.length)]);
    }

    setFeedback(`Sing: ${targetNoteRef.current}`);
    setSuccess(false);
    successRef.current = false;
    clearHold();
  }, [selectedVoiceRange]);

  const handleVoiceRangeChange = (newRange: string) => {
    setSelectedVoiceRange(newRange);
    const range = voiceRanges[newRange as keyof typeof voiceRanges];
    const validNotes = getNotesInRange(range.min, range.max);
    if (targetNote && !validNotes.includes(targetNote)) generateRandomTargetNote();
  };

  // ===== Pitch detection (autocorrelation, same as SingInterval) =====
  const detectPitch = (buffer: Float32Array, sampleRate: number): number | null => {
    // RMS gate
    let rms = 0;
    for (let i = 0; i < buffer.length; i++) rms += buffer[i] * buffer[i];
    rms = Math.sqrt(rms / buffer.length);
    if (rms < 0.01) return null;

    const correlations = new Array(Math.floor(buffer.length / 2));
    for (let lag = 0; lag < correlations.length; lag++) {
      let correlation = 0;
      for (let i = 0; i < buffer.length - lag; i++) correlation += buffer[i] * buffer[i + lag];
      correlations[lag] = correlation;
    }

    let bestCorrelation = 0;
    let bestLag = 0;
    const minLag = Math.floor(sampleRate / 800); // 800 Hz max
    const maxLag = Math.floor(sampleRate / 50);  // 50 Hz min
    for (let lag = minLag; lag < Math.min(maxLag, correlations.length); lag++) {
      if (correlations[lag] > bestCorrelation) { bestCorrelation = correlations[lag]; bestLag = lag; }
    }

    if (bestLag === 0) return null;
    const frequency = sampleRate / bestLag;
    return frequency >= 50 && frequency <= 800 ? frequency : null;
  };

  const getCurrentNote = (frequency: number): { note: string, cents: number } => {
    const noteNumber = 12 * (Math.log(frequency / A4) / Math.log(2)) + 69;
    const rounded = Math.round(noteNumber);
    const noteIndex = ((rounded % 12) + 12) % 12;
    const octave = Math.floor(rounded / 12) - 1;
    const cents = Math.round((noteNumber - rounded) * 100);
    return { note: noteStrings[noteIndex] + octave, cents };
  };

  // ===== Hold helpers (copied semantics from SingInterval) =====
  const clearHold = () => {
    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
    if (progressTimerRef.current) {
      clearInterval(progressTimerRef.current);
      progressTimerRef.current = null;
    }
    holdingRef.current = false;
    setHoldProgress(0);
  };

  const startHold = (durationMs: number, onSuccess: () => void) => {
    if (holdingRef.current) return;
    holdingRef.current = true;
    setHoldProgress(0);

    holdTimerRef.current = setTimeout(() => {
      holdingRef.current = false;
      onSuccess();
      clearHold();
    }, durationMs);

    // progress bar animation
    let progress = 0;
    const stepMs = 100;
    progressTimerRef.current = setInterval(() => {
      progress = Math.min(100, progress + (100 * stepMs) / durationMs);
      setHoldProgress(progress);
      if (progress >= 100 && progressTimerRef.current) {
        clearInterval(progressTimerRef.current);
        progressTimerRef.current = null;
      }
    }, stepMs) as unknown as NodeJS.Timeout;
  };

  // ===== Core check (continuous correctness required) =====
  const checkPitchAccuracy = (freq: number) => {
    if (successRef.current) return;
    const tFreq = targetFrequencyRef.current;
    const tNote = targetNoteRef.current;
    if (!tFreq) return;

    const info = getCurrentNote(freq);
    const ratio = freq / tFreq;
    const within = Math.abs(ratio - 1) < TOLERANCE_RATIO && info.note === tNote;

    if (within) {
      setFeedback(`Perfect! Hold it… ${info.note}`);
      if (!holdingRef.current) {
        startHold(HOLD_MS, () => {
          setSuccess(true);
          successRef.current = true;
          setFeedback(`Great! You held ${tNote} for 1 second! 🎉`);
          stopListening(); // stop after success
        });
      }
    } else {
      // Cancel hold immediately on drift or wrong pitch
      if (holdingRef.current) clearHold();

      // Directional guidance
      const semitoneRatio = Math.pow(2, 1 / 12);
      const semitonesOff = Math.log(ratio) / Math.log(semitoneRatio);
      if (ratio < 1) {
        setFeedback(`Higher! (${info.note} - ${Math.abs(Math.round(semitonesOff))} semitones low)`);
      } else {
        setFeedback(`Lower! (${info.note} - ${Math.round(semitonesOff)} semitones high)`);
      }
    }
  };

  // ===== Audio processing =====
  const startListening = async () => {
    try {
      if (listening) return;

      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      if (audioContext.state === 'suspended') await audioContext.resume();
      audioContextRef.current = audioContext;

      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 4096;
      analyser.smoothingTimeConstant = 0.3;
      analyserRef.current = analyser;

      const scriptProcessor = audioContext.createScriptProcessor(4096, 1, 1);
      scriptProcessorRef.current = scriptProcessor;

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, autoGainControl: false, noiseSuppression: false }
      });
      streamRef.current = stream;

      const source = audioContext.createMediaStreamSource(stream);
      source.connect(analyser);
      analyser.connect(scriptProcessor);
      scriptProcessor.connect(audioContext.destination);

      scriptProcessor.addEventListener('audioprocess', (event) => {
        if (successRef.current) return;
        const input = event.inputBuffer.getChannelData(0);
        const freq = detectPitch(input, audioContext.sampleRate);
        if (freq && !isNaN(freq)) {
          setCurrentFrequency(freq);
          checkPitchAccuracy(freq);
        } else {
          setCurrentFrequency(null);
          if (holdingRef.current) clearHold(); // reset meter on silence
        }
      });

      setListening(true);
    } catch (err) {
      console.error('Error starting microphone:', err);
      setFeedback('Could not access microphone. Please check permissions.');
    }
  };

  const stopListening = () => {
    if (scriptProcessorRef.current) {
      scriptProcessorRef.current.disconnect();
      scriptProcessorRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    if (streamRef.current) {
      const tracks = streamRef.current.getTracks();
      tracks.forEach((t) => t.stop());
      streamRef.current = null;
    }
    clearHold();
    setListening(false);
    setCurrentFrequency(null);
  };

  // keep refs in sync with state when these change (also updated eagerly in generator)
  useEffect(() => { targetFrequencyRef.current = targetFrequency; }, [targetFrequency]);
  useEffect(() => { targetNoteRef.current = targetNote; }, [targetNote]);
  useEffect(() => { successRef.current = success; }, [success]);

  useEffect(() => {
    generateRandomTargetNote();
    return () => { stopListening(); };
  }, [generateRandomTargetNote]);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4 mb-6">
        <Button variant="ghost" size="icon" onClick={onBack}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <h3 className="text-2xl font-bold">Sing & Match</h3>
      </div>

      <Card className="bg-gradient-card border-border/20 shadow-card max-w-md mx-auto">
        <CardHeader>
          <CardTitle className="text-center">Target Note Challenge</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Target Note Display */}
          <div className="text-center space-y-4">
            <div className="p-6 rounded-xl bg-primary/10 border border-primary/20">
              <div className="text-4xl font-bold text-primary mb-2">{targetNote}</div>
              <div className="text-sm text-muted-foreground">Target Note ({targetFrequency.toFixed(1)} Hz)</div>
            </div>
          </div>

          {/* Feedback & Hold Meter */}
          <div className={`text-center p-4 rounded-xl ${
            success ? 'bg-green-100 text-green-800 border border-green-200' :
            holdingRef.current ? 'bg-blue-100 text-blue-800 border border-blue-200' :
            'bg-gray-100 text-gray-700'
          }`}>
            <div className="font-medium">{feedback}</div>
            {holdingRef.current && !success && (
              <>
                <div className="text-sm mt-2">Hold for 1 second…</div>
                <div className="w-full bg-gray-200 rounded-full h-2 mt-2">
                  <div className="bg-blue-600 h-2 rounded-full transition-all duration-100" style={{ width: `${holdProgress}%` }} />
                </div>
              </>
            )}
          </div>

          {/* Current Pitch Display */}
          <div className="text-center space-y-2">
            <div className="text-lg text-gray-600">Current Pitch: {currentFrequency ? `${currentFrequency.toFixed(1)} Hz` : 'No signal detected'}</div>
            {currentFrequency && (
              <div className="text-xl font-bold text-blue-600">{getCurrentNote(currentFrequency).note}</div>
            )}
          </div>

          {/* Controls */}
          <div className="space-y-4">
            {!listening ? (
              <Button size="lg" onClick={startListening} className="w-full bg-blue-600 hover:bg-blue-700">
                <Mic className="w-5 h-5 mr-2" /> Start Singing
              </Button>
            ) : (
              <Button variant="destructive" size="lg" onClick={stopListening} className="w-full">
                <MicOff className="w-5 h-5 mr-2" /> Stop Listening
              </Button>
            )}

            <Button
              size="lg"
              onClick={generateRandomTargetNote}
              className={`w-full ${success ? 'bg-green-600 hover:bg-green-700 text-white' : 'bg-black hover:bg-black/80 text-white'}`}
            >
              <RefreshCw className="w-5 h-5 mr-2" />
              {success ? 'Next Note' : 'Change Target Note'}
            </Button>
          </div>

          {/* Instructions */}
          <div className="text-sm text-gray-600 space-y-2">
            <p>• Sing the target note shown above</p>
            <p>• Follow the pitch guidance (higher/lower)</p>
            <p>• Hold the correct pitch for 1 second to succeed</p>
            <p>• Make sure to allow microphone access</p>
          </div>

          {/* Visual Feedback */}
          {listening && (
            <div className="flex justify-center items-center space-x-2">
              <div className={`w-4 h-4 rounded-full ${currentFrequency ? 'bg-green-500' : 'bg-gray-300'}`}></div>
              <span className="text-sm">{currentFrequency ? 'Signal detected' : 'Listening...'}</span>
            </div>
          )}

          {/* Voice Range Selector */}
          <div className="space-y-3">
            <div className="text-sm font-medium text-center text-muted-foreground">Voice Range</div>
            <div className="grid grid-cols-2 gap-2">
              {Object.keys(voiceRanges).map((range) => (
                <Button
                  key={range}
                  variant={selectedVoiceRange === range ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => handleVoiceRangeChange(range)}
                  className="text-xs"
                >
                  {range}
                </Button>
              ))}
            </div>
            <div className="text-xs text-center text-muted-foreground">
              {voiceRanges[selectedVoiceRange as keyof typeof voiceRanges].min} - {voiceRanges[selectedVoiceRange as keyof typeof voiceRanges].max}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
