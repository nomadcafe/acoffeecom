import { useCallback, useRef, useState } from 'react';
import {
  isLikelyNetworkError,
  reportGoogleNetworkError,
  reportGoogleNetworkOk,
} from '../utils/networkStatus';

type Suggestion = google.maps.places.AutocompleteSuggestion;

export interface PickedCafe {
  placeId: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  /** Cafe website from Places, when available. Sent to /api/account so
   *  the server can auto-verify owner relation by comparing host to the
   *  user's account email domain. Null when Google has no listed site. */
  websiteUri: string | null;
}

export interface UseCafeAutocomplete {
  suggestions: Suggestion[];
  query: (input: string) => void;
  pick: (suggestion: Suggestion) => Promise<PickedCafe | null>;
  clear: () => void;
}

/**
 * Cafe-restricted Places autocomplete for the AccountPage "Featured cafe"
 * picker. Sibling to `useAddressAutocomplete` but:
 *  - Filters predictions to cafe-ish primary types so the dropdown isn't
 *    polluted with offices / streets / geocode rows.
 *  - `pick()` resolves to the full Place details (id + name + address +
 *    coords) so the caller can ship one PATCH body without a follow-up
 *    server-side Place lookup.
 *
 * One session token per hook instance, same billing model as the address
 * variant — autocomplete + fetchFields counts as a single session when
 * the picker is used end-to-end.
 */
const CAFE_PRIMARY_TYPES = ['cafe', 'coffee_shop', 'restaurant'];

export function useCafeAutocomplete(language: string): UseCafeAutocomplete {
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
        includedPrimaryTypes: CAFE_PRIMARY_TYPES,
      })
        .then((res) => {
          if (myCallId !== callIdRef.current) return;
          setSuggestions(res.suggestions);
          reportGoogleNetworkOk();
        })
        .catch((err) => {
          if (myCallId !== callIdRef.current) return;
          console.error('[cafe-autocomplete]', err);
          setSuggestions([]);
          if (isLikelyNetworkError(err)) reportGoogleNetworkError();
        });
    },
    [language],
  );

  const pick = useCallback(async (suggestion: Suggestion): Promise<PickedCafe | null> => {
    const prediction = suggestion.placePrediction;
    if (!prediction) return null;
    ++callIdRef.current;
    setSuggestions([]);
    try {
      const place = prediction.toPlace();
      await place.fetchFields({
        fields: ['id', 'displayName', 'formattedAddress', 'location', 'websiteURI'],
      });
      const lat = place.location?.lat();
      const lng = place.location?.lng();
      if (!place.id || !place.displayName || !place.formattedAddress || lat == null || lng == null) {
        return null;
      }
      return {
        placeId: place.id,
        name: place.displayName,
        address: place.formattedAddress,
        lat,
        lng,
        websiteUri: place.websiteURI ?? null,
      };
    } catch (err) {
      console.error('[cafe-autocomplete/pick]', err);
      return null;
    } finally {
      sessionRef.current = null;
    }
  }, []);

  const clear = useCallback(() => {
    ++callIdRef.current;
    setSuggestions([]);
  }, []);

  return { suggestions, query, pick, clear };
}
