-- Rewrite previously-stored avatar URLs to the new custom-domain host.
-- Before this migration `user.image` rows that came from /api/account/avatar
-- looked like:
--   https://pub-8047aed0e1084fc3b99f34b3bb637d65.r2.dev/avatars/<userId>.webp?v=<ts>
-- which leaked the raw r2.dev bucket hostname. The wrangler `vars` switch
-- to https://avatars.acoffee.com only affects NEW writes; existing rows
-- still point at the old host, so render-paths would keep emitting it
-- unless we rewrite them in place.
--
-- substr() prefix-compare instead of LIKE: D1 rejects LIKE patterns over
-- a fairly low complexity threshold, and a 52-char literal+wildcard trips
-- it. The substr form is functionally equivalent and lets D1 plan it as
-- a plain string comparison. OAuth avatar URLs (lh3.googleusercontent.com)
-- don't share the prefix and are untouched.
UPDATE user
SET image = REPLACE(
  image,
  'https://pub-8047aed0e1084fc3b99f34b3bb637d65.r2.dev/',
  'https://avatars.acoffee.com/'
)
WHERE substr(image, 1, 52) = 'https://pub-8047aed0e1084fc3b99f34b3bb637d65.r2.dev/';
