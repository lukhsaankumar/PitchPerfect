import React, { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ArrowLeft, Play, CheckCircle, XCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface GuessIntervalProps {
  onBack: () => void;
}

export const GuessInterval: React.FC<GuessIntervalProps> = ({ onBack }) => {
  const { toast } = useToast();

  const octaves = {
    '3': [["C3", 0], ["Db3", 1], ["D3", 2], ["Eb3", 3], ["E3", 4], ["F3", 5], ["Gb3", 6], ["G3", 7], ["Ab3", 8], ["A3", 9], ["Bb3", 10], ["B3", 11]],
    '4': [["C4", 0], ["Db4", 1], ["D4", 2], ["Eb4", 3], ["E4", 4], ["F4", 5], ["Gb4", 6], ["G4", 7], ["Ab4", 8], ["A4", 9], ["Bb4", 10], ["B4", 11]],
    '5': [["C5", 0], ["Db5", 1], ["D5", 2], ["Eb5", 3], ["E5", 4], ["F5", 5], ["Gb5", 6], ["G5", 7], ["Ab5", 8], ["A5", 9], ["Bb5", 10], ["B5", 11]],
  };

  const intervals = [
    "Perfect Unison", "Minor 2nd", "Major 2nd", "Minor 3rd", "Major 3rd",
    "Perfect 4th", "Tritone", "Perfect 5th", "Minor 6th", "Major 6th",
    "Minor 7th", "Major 7th", "Octave"
  ];

  const [noteOne, setNoteOne] = useState<[string, number] | null>(null);
  const [noteTwo, setNoteTwo] = useState<[string, number] | null>(null);
  const [correctInterval, setCorrectInterval] = useState("");
  const [userInput, setUserInput] = useState("");
  const [feedback, setFeedback] = useState("");
  const [playing, setPlaying] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [score, setScore] = useState(0);
  const [total, setTotal] = useState(0);

  const playCurrentInterval = () => {
    if (!noteOne || !noteTwo) return;

    setPlaying(true);

    // Try to play the actual interval audio files
    try {
      const audio1 = new Audio(`/piano-mp3/${noteOne[0]}.mp3`);
      const audio2 = new Audio(`/piano-mp3/${noteTwo[0]}.mp3`);
      
      audio1.volume = 1.0;
      audio2.volume = 1.0;
      
      audio1.play().catch(() => setPlaying(false));
      
      // Play second note after first note ends or after 1 second
      setTimeout(() => {
        audio2.play().catch(() => setPlaying(false));
        audio2.onended = () => setPlaying(false);
        audio2.onerror = () => setPlaying(false);
      }, 1000);
      
      audio1.onerror = () => setPlaying(false);
    } catch (error) {
      setTimeout(() => setPlaying(false), 2000);
    }
  };

  const generateRandomInterval = () => {
    const octaveKeys = Object.keys(octaves);
    const randomOctaveKey = octaveKeys[Math.floor(Math.random() * octaveKeys.length)];
    const randomOctave = octaves[randomOctaveKey as keyof typeof octaves];

    const firstNoteIndex = Math.floor(Math.random() * randomOctave.length);
    const intervalSize = Math.floor(Math.random() * 12) + 1; // 1-12 semitones
    const secondNoteIndex = (firstNoteIndex + intervalSize) % 12;

    const randomNoteOne = randomOctave[firstNoteIndex] as [string, number];
    const randomNoteTwo = randomOctave[secondNoteIndex] as [string, number];

    // Calculate interval (always ascending)
    const intervalIndex = Math.abs(randomNoteTwo[1] - randomNoteOne[1]);
    const intervalName = intervals[intervalIndex] || intervals[0];

    setNoteOne(randomNoteOne);
    setNoteTwo(randomNoteTwo);
    setCorrectInterval(intervalName);
    setFeedback("");
    setSubmitted(false);
    setUserInput("");

    // Auto-play the interval
    setTimeout(() => {
      try {
        const audio1 = new Audio(`/piano-mp3/${randomNoteOne[0]}.mp3`);
        const audio2 = new Audio(`/piano-mp3/${randomNoteTwo[0]}.mp3`);
        
        audio1.volume = 1.0;
        audio2.volume = 1.0;
        
        setPlaying(true);
        audio1.play().catch(() => setPlaying(false));
        
        setTimeout(() => {
          audio2.play().catch(() => setPlaying(false));
          audio2.onended = () => setPlaying(false);
          audio2.onerror = () => setPlaying(false);
        }, 1000);
        
        audio1.onerror = () => setPlaying(false);
      } catch (error) {
        setTimeout(() => setPlaying(false), 2000);
      }
    }, 100);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!userInput.trim()) return;

    const normalizedInput = userInput.trim();
    const isCorrect = normalizedInput.toLowerCase() === correctInterval.toLowerCase();

    setTotal(prev => prev + 1);

    if (isCorrect) {
      setScore(prev => prev + 1);
      setFeedback("Correct!");
    } else {
      setFeedback(`Wrong! The correct interval was ${correctInterval}`);
    }

    setSubmitted(true);
  };

  useEffect(() => {
    generateRandomInterval();
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4 mb-6">
        <Button variant="ghost" size="icon" onClick={onBack}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <h3 className="text-2xl font-bold">Guess the Interval</h3>
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
              onClick={playCurrentInterval}
              disabled={playing || !noteOne || !noteTwo}
              className={`${playing ? 'listening-pulse' : ''}`}
            >
              <Play className="w-6 h-6" />
            </Button>
            <p className="text-sm text-muted-foreground mt-2">
              Click to replay the interval
            </p>
          </div>

          {!submitted ? (
            <form onSubmit={handleSubmit} className="space-y-4">
              <Input
                type="text"
                value={userInput}
                onChange={(e) => setUserInput(e.target.value)}
                placeholder="Enter interval (e.g., Perfect 5th, Minor 3rd)"
                className="text-center text-lg"
                autoFocus
              />
              <Button 
                type="submit" 
                variant="musical" 
                size="lg" 
                className="w-full"
                disabled={!noteOne || !noteTwo || !userInput.trim()}
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
                onClick={generateRandomInterval} 
                disabled={playing}
                className="w-full"
              >
                Next Interval
              </Button>
            </div>
          )}

          {/* Interval Reference */}
          <div className="text-xs text-muted-foreground space-y-1">
            <p><strong>Common intervals:</strong></p>
            <p>Perfect 4th, Perfect 5th, Octave</p>
            <p>Major 3rd, Minor 3rd, Major 2nd, Minor 2nd</p>
            <p>Major 6th, Minor 6th, Major 7th, Minor 7th</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};