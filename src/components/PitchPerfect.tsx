import React from 'react';
import { EarTests } from "@/components/ear-tests/EarTests";
import musicBackground from "@/assets/music-background.jpg";

const PitchPerfect = () => {

  return (
    <div 
      className="min-h-screen bg-gradient-background relative overflow-hidden"
      style={{
        backgroundImage: `url(${musicBackground})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundBlendMode: 'overlay',
      }}
    >
      {/* Overlay for better readability */}
      <div className="absolute inset-0 bg-gradient-to-br from-background/90 to-background/60" />
      
      {/* Content */}
      <div className="relative z-10 min-h-screen flex flex-col">
        {/* Header */}
        <header className="text-center py-8">
          <h1 className="text-5xl md:text-7xl font-bold bg-gradient-primary bg-clip-text text-transparent mb-4 slide-in-music">
            PitchPerfect
          </h1>
          <p className="text-xl text-muted-foreground slide-in-music">
            Master Your Musical Ear
          </p>
        </header>

        {/* Main Content */}
        <main className="flex-1 flex items-center justify-center px-4">
          <div className="w-full max-w-4xl slide-in-music">
            <EarTests />
          </div>
        </main>

        {/* Footer */}
        <footer className="text-center py-4 text-muted-foreground">
          <p className="text-sm">© 2024 Lukhsaan Elankumaran</p>
        </footer>
      </div>
    </div>
  );
};

export default PitchPerfect;