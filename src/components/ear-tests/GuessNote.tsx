import React, { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ArrowLeft, Play, CheckCircle, XCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface GuessNoteProps {
  onBack: () => void;
}

export const GuessNote: React.FC<GuessNoteProps> = ({ onBack }) => {
  const { toast } = useToast();
  
  const enharmonicMapping: { [key: string]: string } = {
    "A#": "Bb", "Bb": "A#", "C#": "Db", "Db": "C#",
    "D#": "Eb", "Eb": "D#", "F#": "Gb", "Gb": "F#",
    "G#": "Ab", "Ab": "G#",
  };

  const notes = {
    A: ["A0", "A1", "A2", "A3", "A4", "A5", "A6", "A7"],
    Bb: ["Bb0", "Bb1", "Bb2", "Bb3", "Bb4", "Bb5", "Bb6", "Bb7"],
    B: ["B0", "B1", "B2", "B3", "B4", "B5", "B6", "B7"],
    C: ["C0", "C1", "C2", "C3", "C4", "C5", "C6", "C7"],
    Db: ["Db0", "Db1", "Db2", "Db3", "Db4", "Db5", "Db6", "Db7"],
    D: ["D0", "D1", "D2", "D3", "D4", "D5", "D6", "D7"],
    Eb: ["Eb0", "Eb1", "Eb2", "Eb3", "Eb4", "Eb5", "Eb6", "Eb7"],
    E: ["E0", "E1", "E2", "E3", "E4", "E5", "E6", "E7"],
    F: ["F0", "F1", "F2", "F3", "F4", "F5", "F6", "F7"],
    Gb: ["Gb0", "Gb1", "Gb2", "Gb3", "Gb4", "Gb5", "Gb6", "Gb7"],
    G: ["G0", "G1", "G2", "G3", "G4", "G5", "G6", "G7"],
    Ab: ["Ab0", "Ab1", "Ab2", "Ab3", "Ab4", "Ab5", "Ab6", "Ab7"],
  };

  const [currentNote, setCurrentNote] = useState("");
  const [userInput, setUserInput] = useState("");
  const [feedback, setFeedback] = useState("");
  const [playing, setPlaying] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [score, setScore] = useState(0);
  const [total, setTotal] = useState(0);

  // Helper to play audio with gain boost
  const playAudioWithGain = async (src: string, gainValue = 2.0) => {
    setPlaying(true);
    try {
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      const response = await fetch(src);
      const arrayBuffer = await response.arrayBuffer();
      const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
      const source = audioContext.createBufferSource();
      source.buffer = audioBuffer;
      const gainNode = audioContext.createGain();
      gainNode.gain.value = gainValue;
      source.connect(gainNode).connect(audioContext.destination);
      source.start();
      source.onended = () => {
        setPlaying(false);
        audioContext.close();
      };
    } catch (e) {
      setTimeout(() => setPlaying(false), 1000);
    }
  };

  const playCurrentNote = () => {
    if (!currentNote) return;
    playAudioWithGain(`/piano-mp3/${currentNote}.mp3`, 2.0);
  };

  const generateRandomNote = () => {
    const noteKeys = Object.keys(notes);
    const randomKey = noteKeys[Math.floor(Math.random() * noteKeys.length)];
    const randomOctave = notes[randomKey as keyof typeof notes][
      Math.floor(Math.random() * notes[randomKey as keyof typeof notes].length)
    ];
    
    setCurrentNote(randomOctave);
    setSubmitted(false);
    setFeedback("");
    setUserInput("");

    // Auto-play the note
    setTimeout(() => {
      playAudioWithGain(`/piano-mp3/${randomOctave}.mp3`, 2.0);
    }, 100);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!userInput.trim()) return;

    const normalizedInput = userInput.charAt(0).toUpperCase() + userInput.slice(1).trim();
    const currentBaseNote = currentNote.slice(0, -1);

    const isCorrect = 
      normalizedInput === currentBaseNote ||
      enharmonicMapping[normalizedInput] === currentBaseNote;

    setTotal(prev => prev + 1);
    
    if (isCorrect) {
      setScore(prev => prev + 1);
      setFeedback("Correct!");
    } else {
      setFeedback(`Wrong! The correct note was ${currentBaseNote}`);
    }

    setSubmitted(true);
  };

  useEffect(() => {
    generateRandomNote();
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4 mb-6">
        <Button variant="ghost" size="icon" onClick={onBack}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <h3 className="text-2xl font-bold">Guess the Note</h3>
        <div className="ml-auto text-sm text-muted-foreground">
          Score: {score}/{total}
        </div>
      </div>

      <Card className="bg-gradient-card border-border/20 shadow-card max-w-md mx-auto">
        <CardHeader>
          <CardTitle className="text-center">Listen & Identify</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="text-center">
            <Button
              variant="playButton"
              size="playIcon"
              onClick={playCurrentNote}
              disabled={playing || !currentNote}
              className={`${playing ? 'listening-pulse' : ''}`}
            >
              <Play className="w-6 h-6" />
            </Button>
            <p className="text-sm text-muted-foreground mt-2">
              Click to replay the note
            </p>
          </div>

          {!submitted ? (
            <form onSubmit={handleSubmit} className="space-y-4">
              <Input
                type="text"
                value={userInput}
                onChange={(e) => setUserInput(e.target.value)}
                placeholder="Enter note (e.g., A4, Bb3)"
                className="text-center text-lg"
                autoFocus
              />
              <Button 
                type="submit" 
                variant="musical" 
                size="lg" 
                className="w-full"
                disabled={!currentNote || !userInput.trim()}
              >
                Submit Answer
              </Button>
            </form>
          ) : (
            <div className="space-y-4">
              <div className={`text-center p-4 rounded-lg ${
                feedback.includes('Correct') 
                  ? 'bg-success/10 text-success border border-success/20' 
                  : 'bg-destructive/10 text-destructive border border-destructive/20'
              }`}>
                <div className="flex items-center justify-center gap-2 mb-2">
                  {feedback.includes('Correct') ? (
                    <CheckCircle className="w-5 h-5" />
                  ) : (
                    <XCircle className="w-5 h-5" />
                  )}
                  <span className="font-semibold">{feedback}</span>
                </div>
              </div>
              
              <Button 
                variant="musical" 
                size="lg" 
                onClick={generateRandomNote} 
                disabled={playing}
                className="w-full"
              >
                Next Note
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};