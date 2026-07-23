/* ─────────────────────────────────────────────────────────────────────────
   TIMLY PHOTOGRAPHY — CDN IMAGE DELIVERY
   Builds size-variant URLs via Cloudflare Image Resizing (/cdn-cgi/image/)
   on the CDN custom domain. Resizing only works for requests that pass
   through a Cloudflare-proxied zone you control — it does NOT work on the
   raw r2.dev subdomain or on local file paths. Until CDN_SUPPORTS_RESIZING
   is turned on (i.e. a custom domain is connected to the bucket with
   Image Resizing enabled in the dashboard), every size variant just
   resolves to the original file — the pipeline stays fully wired, it
   simply has nothing to resize yet.
───────────────────────────────────────────────────────────────────────── */

/** Set true once a custom domain is connected to the bucket AND
 *  Image Resizing is enabled for that zone (Cloudflare dashboard →
 *  zone → Speed → Optimization → Image Resizing). */
const CDN_SUPPORTS_RESIZING = false;

/** @typedef {"thumbnail"|"medium"|"large"|"original"} ImageSize */

/** @type {Record<ImageSize, number|null>} target width in px, null = no resize */
const SIZE_WIDTHS = {
  thumbnail: 300,
  medium: 800,
  large: 1600,
  original: null,
};

function isCdnUrl(url) {
  return url.startsWith(R2_PUBLIC_BASE_URL) || (typeof CDN_CUSTOM_DOMAIN !== "undefined" && CDN_CUSTOM_DOMAIN && url.startsWith(CDN_CUSTOM_DOMAIN));
}

/**
 * Build a delivery URL for one size variant of an image.
 * @param {string} url - the canonical image URL (as stored in project data)
 * @param {ImageSize} size
 * @returns {string}
 */
function cdnUrl(url, size = "medium") {
  if (!CDN_SUPPORTS_RESIZING || !isCdnUrl(url)) return url;

  const width = SIZE_WIDTHS[size];
  if (!width) return url;

  // https://developers.cloudflare.com/images/transform-images/transform-via-url/
  const origin = new URL(url).origin;
  const path = url.slice(origin.length).replace(/^\//, "");
  return `${origin}/cdn-cgi/image/width=${width},quality=82,format=auto,fit=cover/${path}`;
}

/**
 * @param {string} url
 * @returns {{thumbnail:string, medium:string, large:string, original:string}}
 */
function cdnSizeSet(url) {
  return {
    thumbnail: cdnUrl(url, "thumbnail"),
    medium: cdnUrl(url, "medium"),
    large: cdnUrl(url, "large"),
    original: url,
  };
}

/**
 * Pick the smallest size variant that still covers the element's rendered
 * width, accounting for device pixel ratio — never over-fetch.
 * @param {number} containerWidthPx
 * @returns {ImageSize}
 */
function pickSizeForWidth(containerWidthPx) {
  const target = containerWidthPx * Math.min(window.devicePixelRatio || 1, 2);
  if (target <= SIZE_WIDTHS.thumbnail) return "thumbnail";
  if (target <= SIZE_WIDTHS.medium) return "medium";
  return "large";
}

/**
 * A tiny (~20px wide), heavily compressed placeholder URL for the LQIP
 * blur-up step. Free when resizing is available; when it's not, callers
 * fall back to a CSS gradient placeholder instead (see portfolio-image.js).
 * @param {string} url
 * @returns {string|null}
 */
function cdnPlaceholderUrl(url) {
  if (!CDN_SUPPORTS_RESIZING || !isCdnUrl(url)) return null;
  const origin = new URL(url).origin;
  const path = url.slice(origin.length).replace(/^\//, "");
  return `${origin}/cdn-cgi/image/width=24,quality=30,format=auto,blur=20/${path}`;
}
