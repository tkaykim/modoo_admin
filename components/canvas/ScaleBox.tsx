'use client'
import React from 'react';

interface ScaleBoxProps {
  x: string;
  y: string;
  width: string;
  height: string;
  position: {
    x: number;
    y: number;
  };
  visible: boolean;
}

/**
 * ScaleBox component that displays real-world dimensions and position (in mm)
 * above selected canvas objects
 */
const ScaleBox: React.FC<ScaleBoxProps> = ({ x, y, width, height, position, visible }) => {
  if (!visible) return null;

  return (
    <div
      className="absolute pointer-events-none z-50"
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
        transform: 'translate(-50%, 100%)',
      }}
    >
      <div className="bg-black/80 text-white px-3 py-2 rounded-lg shadow-lg backdrop-blur-sm mb-2">
        <div className="flex flex-col gap-1 text-xs font-medium whitespace-nowrap">
          <div className="flex items-center gap-2">
            <span className="text-white/60">Position:</span>
            <span>X: {x}</span>
            <span className="text-white/40">|</span>
            <span>Y: {y}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-white/60">Size:</span>
            <span>{width}</span>
            <span className="text-white/60">×</span>
            <span>{height}</span>
          </div>
        </div>
      </div>
      {/* Arrow pointing down to object */}
      <div
        className="absolute left-1/2 -top-3 w-0 h-0"
        style={{
          transform: 'translate(-50%, 50%)',
          borderLeft: '6px solid transparent',
          borderRight: '6px solid transparent',
          borderBottom: '6px solid rgba(0, 0, 0, 0.8)',
        }}
      />
    </div>
  );
};

export default ScaleBox;