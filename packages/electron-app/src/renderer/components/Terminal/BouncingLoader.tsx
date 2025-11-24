/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useState, useRef } from 'react';

const shortAsciiLogo = `
   █████████  ██████████ ██████   ██████ █████ ██████   █████ █████
  ███░░░░░███░░███░░░░░█░░██████ ██████ ░░███ ░░██████ ░░███ ░░███
 ███     ░░░  ░███  █ ░  ░███░█████░███  ░███  ░███░███ ░███  ░███
░███          ░██████    ░███░░███ ░███  ░███  ░███░░███░███  ░███
░███    █████ ░███░░█    ░███ ░░░  ░███  ░███  ░███ ░░██████  ░███
░░███  ░░███  ░███ ░   █ ░███      ░███  ░███  ░███  ░░█████  ░███
 ░░█████████  ██████████ █████     █████ █████ █████  ░░█████ █████
  ░░░░░░░░░  ░░░░░░░░░░ ░░░░░     ░░░░░ ░░░░░ ░░░░░    ░░░░░ ░░░░░
`.replace(/^\n/, ''); // Remove leading newline if present

// Calculate dimensions
const lines = shortAsciiLogo.split('\n');
const CHAR_COLS = Math.max(...lines.map((line) => line.length));
const CHAR_ROWS = lines.length;

// Font settings
const FONT_SIZE_PX = 10;
const LINE_HEIGHT_PX = 10;
// Approx char width for monospace 10px is usually ~6px (0.6 * fontSize)
const CHAR_WIDTH_PX = 6;

const LOGO_WIDTH = CHAR_COLS * CHAR_WIDTH_PX;
const LOGO_HEIGHT = CHAR_ROWS * LINE_HEIGHT_PX;

const ANIMATION_SPEED_MS = 30;

const COLORS = [
  '#ff5555', // Red
  '#50fa7b', // Green
  '#f1fa8c', // Yellow
  '#bd93f9', // Blue
  '#ff79c6', // Magenta
  '#8be9fd', // Cyan
];

export function BouncingLoader() {
  const containerRef = useRef<HTMLDivElement>(null);
  const dimensions = useRef({
    width: window.innerWidth,
    height: window.innerHeight,
  });
  const [position, setPosition] = useState({
    x: Math.floor(Math.random() * (window.innerWidth - LOGO_WIDTH)),
    y: Math.floor(Math.random() * (window.innerHeight - LOGO_HEIGHT)),
  });
  const velocity = useRef({ x: 3, y: 3 });
  const [color, setColor] = useState(COLORS[0]);

  useEffect(() => {
    if (!containerRef.current) return;

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        dimensions.current = {
          width: entry.contentRect.width,
          height: entry.contentRect.height,
        };
      }
    });

    resizeObserver.observe(containerRef.current);

    const intervalId = setInterval(() => {
      setPosition((prev) => {
        let newX = prev.x + velocity.current.x;
        let newY = prev.y + velocity.current.y;
        let collided = false;
        const { width, height } = dimensions.current;

        // Check X bounds
        if (newX <= 0) {
          velocity.current.x = Math.abs(velocity.current.x);
          newX = 0;
          collided = true;
        } else if (newX >= width - LOGO_WIDTH) {
          velocity.current.x = -Math.abs(velocity.current.x);
          newX = width - LOGO_WIDTH;
          collided = true;
        }

        // Check Y bounds
        if (newY <= 0) {
          velocity.current.y = Math.abs(velocity.current.y);
          newY = 0;
          collided = true;
        } else if (newY >= height - LOGO_HEIGHT) {
          velocity.current.y = -Math.abs(velocity.current.y);
          newY = height - LOGO_HEIGHT;
          collided = true;
        }

        if (collided) {
          const nextColor = COLORS[Math.floor(Math.random() * COLORS.length)];
          setColor(nextColor);
        }

        return { x: newX, y: newY };
      });
    }, ANIMATION_SPEED_MS);

    return () => {
      resizeObserver.disconnect();
      clearInterval(intervalId);
    };
  }, []);

  return (
    <div
      ref={containerRef}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        fontFamily:
          'Menlo, "DejaVu Sans Mono", Consolas, "Lucida Console", monospace',
        overflow: 'hidden',
        // Hide cursor to prevent interference
        cursor: 'none',
        backgroundColor: 'transparent',
      }}
    >
      <div
        style={{
          position: 'absolute',
          left: `${position.x}px`,
          top: `${position.y}px`,
          color: color,
          whiteSpace: 'pre',
          fontWeight: 'bold',
          transition: 'color 0.2s ease',
          willChange: 'transform, left, top',
          fontSize: `${FONT_SIZE_PX}px`,
          lineHeight: `${LINE_HEIGHT_PX}px`,
        }}
      >
        {shortAsciiLogo}
      </div>
    </div>
  );
}
