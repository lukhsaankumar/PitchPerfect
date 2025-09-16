import React, { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ArrowLeft, Play, CheckCircle, XCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface GuessChordProps {
  onBack: () => void;
}

export const GuessChord: React.FC<GuessChordProps> = ({ onBack }) => {
  const { toast } = useToast();

  const chords = ["Major", "Minor", "Dominant 7", "Diminished", "Augmented", "Minor 7", "Major 7"];
  const octaves = ["3", "4", "5"];
  const notes = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];

  const [currentChord, setCurrentChord] = useState<string | null>(null);
  const [correctChordType, setCorrectChordType] = useState("");
  const [userInput, setUserInput] = useState("");
  const [feedback, setFeedback] = useState("");
  const [playing, setPlaying] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [score, setScore] = useState(0);
  const [total, setTotal] = useState(0);

  const playCurrentChord = () => {
    if (!currentChord) return;

    setPlaying(true);

    // Try to play the actual audio file
    try {
      const audio = new Audio(`/piano-chords/${currentChord}.m4a`);
      audio.volume = 1.0;
      audio.play().catch(() => {
        setTimeout(() => setPlaying(false), 1500);
      });
      audio.onended = () => setPlaying(false);
      audio.onerror = () => setPlaying(false);
    } catch (error) {
      setTimeout(() => setPlaying(false), 1500);
    }
  };

  const generateRandomChord = () => {
    const randomOctave = octaves[Math.floor(Math.random() * octaves.length)];
    const randomNote = notes[Math.floor(Math.random() * notes.length)];
    const randomChordType = chords[Math.floor(Math.random() * chords.length)];

    const chordFileName = `${randomOctave}${randomNote} ${randomChordType}`;
    setCurrentChord(chordFileName);
    setCorrectChordType(randomChordType);
    setFeedback("");
    setSubmitted(false);
    setUserInput("");

    // Auto-play the chord
    setTimeout(() => {
      try {
        const audio = new Audio(`/piano-chords/${chordFileName}.m4a`);
        audio.volume = 1.0;
        setPlaying(true);
        audio.play().catch(() => setPlaying(false));
        audio.onended = () => setPlaying(false);
        audio.onerror = () => setPlaying(false);
      } catch (error) {
        setTimeout(() => setPlaying(false), 1500);
      }
    }, 100);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!userInput.trim()) return;

    const normalizedInput = userInput.trim();
    const isCorrect = normalizedInput.toLowerCase() === correctChordType.toLowerCase();

    setTotal(prev => prev + 1);

    if (isCorrect) {
      setScore(prev => prev + 1);
      setFeedback("Correct!");
    } else {
      setFeedback(`Wrong! The correct chord was ${correctChordType}`);
    }

    setSubmitted(true);
  };

  useEffect(() => {
    generateRandomChord();
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4 mb-6">
        <Button variant="ghost" size="icon" onClick={onBack}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <h3 className="text-2xl font-bold">Guess the Chord</h3>
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
              onClick={playCurrentChord}
              disabled={playing || !currentChord}
              className={`${playing ? 'listening-pulse' : ''}`}
            >
              <Play className="w-6 h-6" />
            </Button>
            <p className="text-sm text-muted-foreground mt-2">
              Click to replay the chord
            </p>
          </div>

          {!submitted ? (
            <form onSubmit={handleSubmit} className="space-y-4">
              <Input
                type="text"
                value={userInput}
                onChange={(e) => setUserInput(e.target.value)}
                placeholder="Enter chord type (e.g., Major, Minor, Dominant 7)"
                className="text-center text-lg"
                autoFocus
              />
              <Button 
                type="submit" 
                variant="musical" 
                size="lg" 
                className="w-full"
                disabled={!currentChord || !userInput.trim()}
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
                onClick={generateRandomChord} 
                disabled={playing}
                className="w-full"
              >
                Next Chord
              </Button>
            </div>
          )}

          {/* Chord Reference */}
          <div className="text-xs text-muted-foreground space-y-1">
            <p><strong>Chord types:</strong></p>
            <p>Major, Minor, Dominant 7</p>
            <p>Diminished, Augmented</p>
            <p>Minor 7, Major 7</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};