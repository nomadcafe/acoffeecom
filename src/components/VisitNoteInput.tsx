import { useState } from 'react';
import styles from './VisitNoteInput.module.css';

interface VisitNoteInputProps {
  initial: string;
  placeholder: string;
  onCommit: (value: string) => void;
  /** Optional: focus on first mount — set true for the post-stamp prompt
   *  on home cards so the user can type immediately. */
  autoFocus?: boolean;
}

/**
 * Local-state textarea that commits on blur. Editing is optimistic — we don't
 * fire onCommit on every keystroke (which would touch updatedAt and re-trigger
 * cloud sync per character). Only the final value when focus leaves the input
 * is what gets persisted, which matches "user is done writing" intent.
 *
 * Cross-device pull adopts a remote note only when the user isn't mid-edit
 * (compare-to-seen-prop pattern: `initial` changing into a new value is only
 * mirrored into the local draft if the local draft still matches whatever
 * we last saw — i.e. they haven't typed something different).
 */
export function VisitNoteInput({ initial, placeholder, onCommit, autoFocus }: VisitNoteInputProps) {
  const [draft, setDraft] = useState(initial);
  const [seenInitial, setSeenInitial] = useState(initial);
  if (seenInitial !== initial) {
    setSeenInitial(initial);
    if (draft === seenInitial) {
      setDraft(initial);
    }
  }

  function commit() {
    if (draft === initial) return;
    onCommit(draft);
  }

  return (
    <textarea
      className={styles.input}
      rows={1}
      maxLength={500}
      placeholder={placeholder}
      value={draft}
      autoFocus={autoFocus}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        // Cmd/Ctrl + Enter commits without losing focus — common note-taking habit.
        if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
          e.preventDefault();
          commit();
          (e.target as HTMLTextAreaElement).blur();
        }
      }}
    />
  );
}
