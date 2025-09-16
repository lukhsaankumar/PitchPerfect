import React, { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, Mic, Volume2 } from "lucide-react";
import { GuessNote } from "./GuessNote";
import { SingNote } from "./SingNote";
import { GuessInterval } from "./GuessInterval";
import { SingInterval } from "./SingInterval";
import { GuessChord } from "./GuessChord";
import notesIcon from "@/assets/notes-icon.png";
import intervalsIcon from "@/assets/intervals-icon.png";
import chordsIcon from "@/assets/chords-icon.png";

type EarTestMode = "guessNote" | "singNote" | "guessInterval" | "singInterval" | "guessChord" | null;
type Category = "notes" | "intervals" | "chords" | null;

interface EarTestsProps {
  onBack?: () => void;
}

export const EarTests: React.FC<EarTestsProps> = ({ onBack }) => {
  const [category, setCategory] = useState<Category>(null);
  const [mode, setMode] = useState<EarTestMode>(null);

  const handleCategorySelect = (selectedCategory: Category) => {
    setCategory(selectedCategory);
  };

  const handleModeSelect = (selectedMode: EarTestMode) => {
    setMode(selectedMode);
  };

  const handleBackToCategories = () => {
    setMode(null);
    setCategory(null);
  };

  const handleBackToModes = () => {
    setMode(null);
  };

  // Main category selection
  if (!category) {
    return (
      <div key="category-selection" className="space-y-8">
        <div className="flex flex-col items-center gap-4 mb-8">
          {onBack && (
            <Button variant="ghost" size="icon" onClick={onBack} className="self-start">
              <ArrowLeft className="w-5 h-5" />
            </Button>
          )}
          <h2 className="text-3xl font-bold text-foreground text-center">Ear Training</h2>
        </div>

        <div className="grid gap-6 md:gap-8 max-w-md mx-auto">
          <Button
            key="notes-btn"
            variant="musical"
            size="xl"
            onClick={() => handleCategorySelect("notes")}
            className="fade-in-top"
          >
            <img src={notesIcon} alt="Notes" className="w-6 h-6" />
            Notes
          </Button>
          
          <Button
            key="intervals-btn"
            variant="musical"
            size="xl"
            onClick={() => handleCategorySelect("intervals")}
            className="fade-in-top"
            style={{ animationDelay: '0.1s' }}
          >
            <img src={intervalsIcon} alt="Intervals" className="w-6 h-6" />
            Intervals
          </Button>
          
          <Button
            key="chords-btn"
            variant="musical"
            size="xl"
            onClick={() => handleCategorySelect("chords")}
            className="fade-in-top"
            style={{ animationDelay: '0.2s' }}
          >
            <img src={chordsIcon} alt="Chords" className="w-6 h-6" />
            Chords
          </Button>
        </div>
      </div>
    );
  }

  // Mode selection for notes and intervals
  if (category && !mode) {
    const isChords = category === "chords";
    
    if (isChords) {
      // Directly go to chord guessing
      setMode("guessChord");
      return null;
    }

    return (
      <div key={`${category}-mode-selection`} className="space-y-8">
        <div className="flex flex-col items-center gap-4 mb-8">
          <Button variant="ghost" size="icon" onClick={handleBackToCategories} className="self-start">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <h2 className="text-3xl font-bold text-foreground text-center">
            {category === "notes" ? "Note Training" : "Interval Training"}
          </h2>
        </div>

        <div className="grid gap-6 md:gap-8 max-w-md mx-auto">
          <Button
            key={`${category}-guess-btn`}
            variant="musical"
            size="xl"
            onClick={() => handleModeSelect(category === "notes" ? "guessNote" : "guessInterval")}
            className="fade-in-top"
          >
            <Volume2 className="w-6 h-6" />
            Guess
          </Button>
          
            <Button
              key={`${category}-sing-btn`}
              variant="musical"
              size="xl"
              onClick={() => handleModeSelect(category === "notes" ? "singNote" : "singInterval")}
              className="fade-in-top"
              style={{ animationDelay: '0.1s' }}
            >
              <Mic className="w-6 h-6" />
              Sing
            </Button>
        </div>
      </div>
    );
  }

  // Render the selected component
  const renderActiveComponent = () => {
    switch (mode) {
      case "guessNote":
        return <GuessNote onBack={handleBackToModes} />;
      case "singNote":
        return <SingNote onBack={handleBackToModes} />;
      case "guessInterval":
        return <GuessInterval onBack={handleBackToModes} />;
      case "singInterval":
        return <SingInterval onBack={handleBackToModes} />;
      case "guessChord":
        return <GuessChord onBack={handleBackToCategories} />;
      default:
        return null;
    }
  };

  return (
    <div className="slide-in-music">
      {renderActiveComponent()}
    </div>
  );
};