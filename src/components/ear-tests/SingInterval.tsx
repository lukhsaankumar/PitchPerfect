import React, { useState, useEffect, useRef } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, Mic, MicOff, RefreshCw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface SingIntervalProps { onBack: () => void; }

type Phase = 'waiting' | 'first' | 'second' | 'complete';

export const SingInterval: React.FC<SingIntervalProps> = ({ onBack }) => {
  const { toast } = useToast();

  // UI / state
  const [currentFrequency, setCurrentFrequency] = useState<number | null>(null);
  const [listening, setListening] = useState(false);
  const [targetInterval, setTargetInterval] = useState<string>("");
  const [feedback, setFeedback] = useState<string>("");
  const [phase, setPhase] = useState<Phase>('waiting');
  const [firstNote, setFirstNote] = useState<{ note: string, frequency: number } | null>(null);
  const [secondNote, setSecondNote] = useState<{ note: string, frequency: number } | null>(null);
  const [holdProgress, setHoldProgress] = useState(0);

  // audio graph refs
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // logic refs (avoid stale state in audio callback)
  const phaseRef = useRef<Phase>('waiting');
  const holdTimerRef = useRef<NodeJS.Timeout | null>(null);
  const progressTimerRef = useRef<NodeJS.Timeout | null>(null);
  const holdingRef = useRef<boolean>(false);

  const firstTargetFreqRef = useRef<number | null>(null); // must hold for 1s in phase 1
  const secondTargetFreqRef = useRef<number | null>(null); // computed from first + interval + direction, hold 1s

  const noteStrings = ["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B"] as const;
  const A4 = 440;

  const intervals = [
    { name: "Minor 2", semitones: 1 },
    { name: "Major 2", semitones: 2 },
    { name: "Minor 3", semitones: 3 },
    { name: "Major 3", semitones: 4 },
    { name: "Perfect 4", semitones: 5 },
    { name: "Tritone", semitones: 6 },
    { name: "Perfect 5", semitones: 7 },
    { name: "Minor 6", semitones: 8 },
    { name: "Major 6", semitones: 9 },
    { name: "Minor 7", semitones: 10 },
    { name: "Major 7", semitones: 11 },
    { name: "Perfect 8", semitones: 12 }
  ];

  // ===== Pitch detection (autocorrelation, same as SingNote) =====
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
      if (correlations[lag] > bestCorrelation) {
        bestCorrelation = correlations[lag];
        bestLag = lag;
      }
    }

    if (bestLag === 0) return null;
    const frequency = sampleRate / bestLag;
    return frequency >= 50 && frequency <= 800 ? frequency : null;
  };

  // ===== Note helpers =====
  const getCurrentNote = (frequency: number): { note: string, midiNumber: number, cents: number } => {
    const noteNumber = 12 * (Math.log(frequency / A4) / Math.log(2)) + 69;
    const rounded = Math.round(noteNumber);
    const noteIndex = ((rounded % 12) + 12) % 12;
    const octave = Math.floor(rounded / 12) - 1;
    const cents = Math.round((noteNumber - rounded) * 100);
    return { note: noteStrings[noteIndex] + octave, midiNumber: rounded, cents };
  };

  const TOLERANCE_RATIO = 0.04; // ~20 cents

  // ===== Hold helpers =====
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

  // ===== Audio processing =====
  const startListening = async () => {
    try {
      if (listening) return;

      // Fresh session reset to avoid lingering targets from prior runs
      firstTargetFreqRef.current = null;
      secondTargetFreqRef.current = null;
      clearHold();
      setFirstNote(null);
      setSecondNote(null);

      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      if (audioContext.state === 'suspended') await audioContext.resume();
      audioContextRef.current = audioContext;

      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 4096;
      analyser.smoothingTimeConstant = 0.2;
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
        if (!audioContextRef.current) return;
        const inputBuffer = event.inputBuffer.getChannelData(0);
        const freq = detectPitch(inputBuffer, audioContextRef.current.sampleRate);

        if (freq && !isNaN(freq)) {
          setCurrentFrequency(freq);
          processFrequency(freq);
        } else {
          setCurrentFrequency(null);
          // If user stops singing, cancel any active hold and reset meter
          if (holdingRef.current) clearHold();
        }
      });

      setListening(true);
      setPhase('first');
      phaseRef.current = 'first';
      setFeedback('Start by singing any note and hold it for 1 second.');
      toast({ title: 'Microphone Active', description: 'Sing your first note!' });
    } catch (err) {
      console.error('Error starting microphone:', err);
      toast({ title: 'Microphone Error', description: 'Could not access microphone. Please check permissions.', variant: 'destructive' });
    }
  };

  const stopListening = (preservePhase = false) => {
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
    if (!preservePhase) {
      setPhase('waiting');
      phaseRef.current = 'waiting';
    }
  };

  // ===== Core logic =====
  const processFrequency = (freq: number) => {
    const ph = phaseRef.current;

    if (ph === 'first') {
      // Initialize target of first hold if not set yet
      if (!firstTargetFreqRef.current) {
        firstTargetFreqRef.current = freq;
        const n = getCurrentNote(freq).note;
        setFeedback(`Holding ${n}… (1 second)`);
        startHold(1000, () => {
          const nInfo = getCurrentNote(firstTargetFreqRef.current!);
          setFirstNote({ note: nInfo.note, frequency: firstTargetFreqRef.current! });
          setFeedback(`Great! Now sing the ${targetInterval} from ${nInfo.note} (up or down).`);
          // Advance to second phase
          setPhase('second');
          phaseRef.current = 'second';
          // Clear any second target until we see which direction the user goes
          secondTargetFreqRef.current = null;
        });
        return;
      }

      // Maintain/cancel the hold around the chosen first target
      const ratio = freq / firstTargetFreqRef.current;
      const within = Math.abs(ratio - 1) < TOLERANCE_RATIO;
      const noteNow = getCurrentNote(freq).note;

      if (within) {
        if (!holdingRef.current) {
          setFeedback(`Perfect! Hold it… ${noteNow}`);
          startHold(1000, () => {
            const nInfo = getCurrentNote(firstTargetFreqRef.current!);
            setFirstNote({ note: nInfo.note, frequency: firstTargetFreqRef.current! });
            setFeedback(`Great! Now sing the ${targetInterval} from ${nInfo.note} (up or down).`);
            setPhase('second');
            phaseRef.current = 'second';
            secondTargetFreqRef.current = null;
          });
        }
      } else {
        if (holdingRef.current) {
          // Cancel hold if user drifts or changes pitch
          setFeedback(`Try to keep it steady near ${getCurrentNote(firstTargetFreqRef.current!).note}`);
          clearHold();
        }
      }
      return;
    }

    if (ph === 'second' && firstTargetFreqRef.current) {
      const intervalSpec = intervals.find(i => i.name.toLowerCase() === targetInterval.toLowerCase());
      if (!intervalSpec) return;

      // Decide direction dynamically based on the user's current pitch relative to the first note
      const goingUp = freq >= firstTargetFreqRef.current;
      const goalFreq = firstTargetFreqRef.current * Math.pow(2, (goingUp ? intervalSpec.semitones : -intervalSpec.semitones) / 12);
      const goalNote = getCurrentNote(goalFreq).note;
      secondTargetFreqRef.current = goalFreq;

      const ratio = freq / goalFreq;
      const within = Math.abs(ratio - 1) < TOLERANCE_RATIO;

      if (within) {
        if (!holdingRef.current) {
          setFeedback(`Perfect! Hold ${goalNote}… (1 second)`);
          startHold(1000, () => {
            setSecondNote({ note: goalNote, frequency: goalFreq });
            setPhase('complete');
            phaseRef.current = 'complete';
            setFeedback(`Nice! You sang a ${intervalSpec.name} ${goingUp ? 'up' : 'down'} from ${firstNote?.note || getCurrentNote(firstTargetFreqRef.current!).note}. 🎉`);
            toast({ title: 'Interval Complete', description: `Sung ${intervalSpec.name} ${goingUp ? 'up' : 'down'}.` });
            // Stop listening once second note is correctly held — but preserve 'complete' phase
            stopListening(true);
          });
        }
      } else {
        // Directional guidance toward the goal and cancel hold if drifting
        const semitoneRatio = Math.pow(2, 1 / 12);
        const semitonesOff = Math.log(ratio) / Math.log(semitoneRatio);
        if (ratio < 1) {
          setFeedback(`Higher! Aim for ${goalNote} (${Math.abs(Math.round(semitonesOff))} semitones low)`);
        } else {
          setFeedback(`Lower! Aim for ${goalNote} (${Math.round(semitonesOff)} semitones high)`);
        }
        if (holdingRef.current) clearHold(); // cancel any active hold when leaving tolerance
      }
      return;
    }
  };

  // ===== Interval session controls =====
  const generateRandomInterval = () => {
    const randomInterval = intervals[Math.floor(Math.random() * intervals.length)];
    resetForNewInterval(randomInterval.name);
  };

  const resetForNewInterval = (name: string) => {
    // Ensure listening is stopped so the next run behaves exactly like first load
    if (listening) {
      stopListening();
    }
    setTargetInterval(name);
    setPhase('waiting');
    phaseRef.current = 'waiting';
    setFirstNote(null);
    setSecondNote(null);
    setFeedback(`Sing any note, then sing a ${name} interval (up or down). Hold first for 1s, second for 1s.`);
    setHoldProgress(0);

    // reset internal targets & holds fully
    firstTargetFreqRef.current = null;
    secondTargetFreqRef.current = null;
    clearHold();
  };

  useEffect(() => {
    generateRandomInterval();
    return () => { stopListening(); };
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4 mb-6">
        <Button variant="ghost" size="icon" onClick={onBack}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <h3 className="text-2xl font-bold">Sing Interval</h3>
      </div>

      <Card className="bg-gradient-card border-border/20 shadow-card max-w-md mx-auto">
        <CardHeader>
          <CardTitle className="text-center">Interval Singing Challenge</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Target Interval Display */}
          <div className="text-center space-y-4">
            <div className="p-6 rounded-xl bg-primary/10 border border-primary/20">
              <div className="text-4xl font-bold text-primary mb-2">{targetInterval}</div>
              <div className="text-sm text-muted-foreground">Target Interval</div>
            </div>
          </div>

          {/* Phase Indicator & Progress */}
          <div className="text-center space-y-2">
            <div className="flex justify-center space-x-2">
              {(['first','second','complete'] as Phase[]).map((p) => (
                <div key={p} className={`w-3 h-3 rounded-full ${
                  phase === p ? 'bg-primary' :
                  (p === 'first' && (phase === 'second' || phase === 'complete')) ||
                  (p === 'second' && phase === 'complete') ? 'bg-green-500' : 'bg-muted'
                }`} />
              ))}
            </div>
            {holdingRef.current && (
              <div className="w-full bg-muted rounded-full h-2">
                <div className="bg-primary h-2 rounded-full transition-all duration-100" style={{ width: `${holdProgress}%` }} />
              </div>
            )}
          </div>

          {/* Notes Display */}
          {(firstNote || secondNote) && (
            <div className="grid grid-cols-2 gap-4">
              <div className={`text-center p-4 rounded-xl ${firstNote ? 'bg-green-500/10 border border-green-500/20' : 'bg-muted/20'}`}>
                <div className="text-lg font-bold">{firstNote?.note || '?'}</div>
                <div className="text-xs text-muted-foreground">First Note</div>
              </div>
              <div className={`text-center p-4 rounded-xl ${secondNote ? 'bg-green-500/10 border border-green-500/20' : 'bg-muted/20'}`}>
                <div className="text-lg font-bold">{secondNote?.note || '?'}</div>
                <div className="text-xs text-muted-foreground">Second Note</div>
              </div>
            </div>
          )}

          {/* Feedback Display */}
          <div className={`text-center p-4 rounded-xl ${
            phase === 'complete'
              ? 'bg-green-500/10 text-green-700 border border-green-500/20'
              : 'bg-secondary/20'
          }`}>
            <div className="font-medium">{feedback}</div>
          </div>

          {/* Current Pitch Display */}
          {listening && (
            <div className="text-center space-y-2">
              <div className="text-lg text-muted-foreground">
                Current Pitch: {currentFrequency ? `${currentFrequency.toFixed(1)} Hz` : 'No signal'}
              </div>
              {currentFrequency && (
                <div className="text-xl font-bold text-primary">{getCurrentNote(currentFrequency).note}</div>
              )}
            </div>
          )}

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
              onClick={generateRandomInterval}
              className={`w-full ${phase === 'complete' ? 'bg-green-600 hover:bg-green-700 text-white' : 'bg-black hover:bg-black/80 text-white'}`}
            >
              <RefreshCw className="w-5 h-5 mr-2" />
              {phase === 'complete' ? 'Next Interval' : 'Change Interval'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
