import { useCallback, useRef, useState } from 'react';

type Suggestion = google.maps.places.AutocompleteSuggestion;

export interface UseAddressAutocomplete {
  suggestions: Suggestion[];
  query: (input: string) => void;
  pick: (suggestion: Suggestion) => Promise<string | null>;
  clear: () => void;
}

/**
 * Wraps the new Places API `AutocompleteSuggestion.fetchAutocompleteSuggestions`
 * (the replacement for the deprecated `places.Autocomplete`). One hook instance
 * per input field so each maintains its own session token — Google bills
 * autocomplete + fetchFields as a single session when the same token is reused.
 */
export function useAddressAutocomplete(language: string): UseAddressAutocomplete {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const sessionRef = useRef<google.maps.places.AutocompleteSessionToken | null>(null);
  const callIdRef = useRef(0);

  const query = useCallback(
    (input: string) => {
      const myCallId = ++callIdRef.current;
      const trimmed = input.trim();
      if (!trimmed) {
        setSuggestions([]);
        return;
      }
      if (!window.google?.maps?.places?.AutocompleteSuggestion) return;

      if (!sessionRef.current) {
        sessionRef.current = new google.maps.places.AutocompleteSessionToken();
      }

      google.maps.places.AutocompleteSuggestion.fetchAutocompleteSuggestions({
        input: trimmed,
        sessionToken: sessionRef.current,
        language,
      })
        .then((res) => {
          if (myCallId !== callIdRef.current) return;
          setSuggestions(res.suggestions);
        })
        .catch((err) => {
          if (myCallId !== callIdRef.current) return;
          console.error('[autocomplete]', err);
          setSuggestions([]);
        });
    },
    [language]
  );

  const pick = useCallback(async (suggestion: Suggestion): Promise<string | null> => {
    const prediction = suggestion.placePrediction;
    if (!prediction) return null;
    // Reset state *before* the network fetch so the dropdown closes immediately.
    ++callIdRef.current;
    setSuggestions([]);
    const fallback = prediction.text.text;
    try {
      const place = prediction.toPlace();
      await place.fetchFields({ fields: ['formattedAddress'] });
      return place.formattedAddress ?? fallback;
    } catch (err) {
      console.error('[autocomplete/pick]', err);
      return fallback;
    } finally {
      // Completing a pick ends the session per Google's billing model.
      sessionRef.current = null;
    }
  }, []);

  const clear = useCallback(() => {
    ++callIdRef.current;
    setSuggestions([]);
  }, []);

  return { suggestions, query, pick, clear };
}
