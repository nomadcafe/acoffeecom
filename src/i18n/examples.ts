import type { Locale } from './messages';

export interface ExamplePair {
  a: string;
  b: string;
}

/**
 * Per-locale demo address pairs for the first-run empty state. One click
 * fills both inputs and triggers a full search so new users can see the
 * flow end-to-end without thinking up two addresses.
 *
 * Each pair should be two recognisable landmarks or neighbourhoods in a
 * single city so the midpoint + nearby café search returns something real.
 */
export const examplePairsByLocale: Record<Locale, ExamplePair[]> = {
  en: [
    { a: 'Times Square, New York', b: 'Central Park, New York' },
    { a: 'Ferry Building, San Francisco', b: 'Golden Gate Park, San Francisco' },
  ],
  ja: [
    { a: '新宿駅', b: '渋谷駅' },
    { a: '東京駅', b: '上野駅' },
  ],
  zh: [
    { a: '国贸, 北京', b: '三里屯, 北京' },
    { a: '人民广场, 上海', b: '陆家嘴, 上海' },
  ],
};
