import React from 'react';
import { GenerativeBlob, getHash } from '@/components/GenerativeBlob';

export interface CommentPillUser {
  id: string;
  user_name: string;
  author_type?: string;
}

interface CommentPillProps {
  /** Ordered list of users participating in the discussion. Deduplicated by name; first occurrences win. */
  users: CommentPillUser[];
  /** Total number of comments (may exceed unique user count). */
  count: number;
  /** Number of avatar slots to render before collapsing into "+N". */
  maxAvatars?: number;
  /** Accessible label describing what this pill refers to (e.g. "Milestone 3 comments"). */
  ariaLabel?: string;
  onActivate?: () => void;
}

/**
 * Margin annotation pill for a milestone's discussion.
 *
 * Designed to live inside a sticky container in the card's right gutter so it
 * stays in the reader's sight line while scrolling through a long milestone,
 * and swaps naturally at section boundaries.
 */
export function CommentPill({
  users,
  count,
  maxAvatars = 3,
  ariaLabel,
  onActivate,
}: CommentPillProps) {
  if (count <= 0) return null;

  const uniqueUsers = Array.from(
    new Map(users.map((u) => [u.user_name, u])).values(),
  );
  const shown = uniqueUsers.slice(0, maxAvatars);
  const extra = uniqueUsers.length - shown.length;

  return (
    <button
      type="button"
      aria-label={ariaLabel ?? `${count} ${count === 1 ? 'comment' : 'comments'}`}
      onClick={(e) => {
        e.stopPropagation();
        onActivate?.();
      }}
      className="group flex flex-col items-center gap-1.5 rounded-full bg-white/90 backdrop-blur-md border border-slate-200/70 shadow-sm px-1 py-1.5 hover:shadow-md hover:border-indigo-200 hover:bg-white transition-all cursor-pointer"
    >
      <span
        className="flex items-center justify-center min-w-[1.5rem] h-6 px-1.5 rounded-full bg-indigo-100 text-indigo-700 text-[11px] font-bold tabular-nums leading-none group-hover:bg-indigo-200 transition-colors"
      >
        {count}
      </span>
      {shown.length > 0 && (
        <div className="flex flex-col items-center gap-1">
          {shown.map((u) => (
            <GenerativeBlob
              key={u.id}
              hash={getHash(u.user_name)}
              sizeClassName="w-5 h-5"
              subtle={u.author_type === 'agent'}
              centerContent={
                <span className="text-[7px] font-bold text-white drop-shadow-sm">
                  {u.user_name.substring(0, 1).toUpperCase()}
                </span>
              }
            />
          ))}
          {extra > 0 && (
            <span className="text-[9px] font-bold text-slate-500 leading-none mt-0.5">
              +{extra}
            </span>
          )}
        </div>
      )}
    </button>
  );
}
