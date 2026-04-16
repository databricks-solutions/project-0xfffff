import React from 'react';

export const MILESTONE_THEMES = [
  { grad: 'from-indigo-500 to-blue-500', lineStart: 'from-indigo-300', lineEnd: 'to-indigo-300', textStart: 'text-indigo-500', textEnd: 'text-blue-500' },
  { grad: 'from-fuchsia-500 to-pink-500', lineStart: 'from-fuchsia-300', lineEnd: 'to-fuchsia-300', textStart: 'text-fuchsia-500', textEnd: 'text-pink-500' },
  { grad: 'from-rose-500 to-orange-500', lineStart: 'from-rose-300', lineEnd: 'to-rose-300', textStart: 'text-rose-500', textEnd: 'text-orange-500' },
  { grad: 'from-amber-500 to-red-500', lineStart: 'from-amber-300', lineEnd: 'to-amber-300', textStart: 'text-amber-500', textEnd: 'text-red-500' },
  { grad: 'from-emerald-500 to-teal-500', lineStart: 'from-emerald-300', lineEnd: 'to-emerald-300', textStart: 'text-emerald-500', textEnd: 'text-teal-500' },
  { grad: 'from-cyan-500 to-blue-500', lineStart: 'from-cyan-300', lineEnd: 'to-cyan-300', textStart: 'text-cyan-500', textEnd: 'text-blue-500' },
  { grad: 'from-violet-500 to-purple-500', lineStart: 'from-violet-300', lineEnd: 'to-violet-300', textStart: 'text-violet-500', textEnd: 'text-purple-500' },
  { grad: 'from-blue-500 to-indigo-500', lineStart: 'from-blue-300', lineEnd: 'to-blue-300', textStart: 'text-blue-500', textEnd: 'text-indigo-500' },
];

export function getHash(str: string, num: number = 0) {
  return str.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) + num;
}

export function GenerativeBlob({ 
  hash, 
  sizeClassName = 'w-8 h-8', 
  centerContent, 
  subtle = false 
}: { 
  hash: number, 
  sizeClassName?: string, 
  centerContent?: React.ReactNode, 
  subtle?: boolean 
}) {
  const theme = MILESTONE_THEMES[hash % MILESTONE_THEMES.length];

  const generateBlobRadius = (seed: number) => {
    const r1 = 40 + (seed % 30);
    const r2 = 40 + ((seed * 2) % 30);
    const r3 = 40 + ((seed * 3) % 30);
    const r4 = 40 + ((seed * 4) % 30);
    const r5 = 40 + ((seed * 5) % 30);
    const r6 = 40 + ((seed * 6) % 30);
    const r7 = 40 + ((seed * 7) % 30);
    const r8 = 40 + ((seed * 8) % 30);
    return `${r1}% ${100 - r1}% ${r2}% ${100 - r2}% / ${r3}% ${r4}% ${100 - r4}% ${100 - r3}%`;
  };

  const borderRadius1 = generateBlobRadius(hash);
  const borderRadius2 = generateBlobRadius(hash + 1);

  const dir1 = hash % 2 === 0 ? 1 : -1;
  const dir2 = hash % 2 === 0 ? -1 : 1;
  const speed1 = 1 + (hash % 3) * 0.5;
  const speed2 = 1 + ((hash + 1) % 3) * 0.5;

  return (
    <div className={`relative flex items-center justify-center ${sizeClassName}`}>
      {/* Layer 1 */}
      <div 
        className={`absolute inset-0 bg-gradient-to-br ${theme.grad} ${subtle ? 'opacity-40' : 'opacity-60 mix-blend-multiply'}`}
        style={{ 
          borderRadius: borderRadius1,
          transform: `rotate(calc(var(--scroll-rot, 0deg) * ${dir1 * speed1}))`
        }}
      />
      {/* Layer 2 */}
      <div 
        className={`absolute inset-0 bg-gradient-to-tr ${theme.grad} ${subtle ? 'opacity-50' : 'opacity-80'}`}
        style={{ 
          borderRadius: borderRadius2,
          transform: `rotate(calc(var(--scroll-rot, 0deg) * ${dir2 * speed2}))`
        }}
      />
      {centerContent && (
        <div className="relative z-10 flex items-center justify-center">
          {centerContent}
        </div>
      )}
    </div>
  );
}