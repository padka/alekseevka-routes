(() => {
  "use strict";

  function attributes(path, sizes) {
    const size = window.GuideImageSizes[path];
    if (!size) return { src: path };
    const [width, height] = size;
    const stem = path.replace('assets/images/', 'assets/webp/').replace(/\.[^.]+$/, '');
    const widths = [...new Set([384, 768, 1280].map(limit => Math.min(width, limit)))];
    const srcset = widths.map(w => `${stem}-${w}.webp ${w}w`).join(', ');
    return { sizes, srcset, width, height, src: path };
  }

  function escapeAttribute(value) {
    return String(value).replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;');
  }

  window.GuideImages = {
    attrs(path, sizes) {
      return Object.entries(attributes(path, sizes))
        .map(([key, value]) => `${key}="${escapeAttribute(value)}"`).join(' ');
    },
    set(image, path, sizes) {
      const next = attributes(path, sizes);
      for (const key of ['sizes', 'srcset', 'width', 'height']) {
        if (!(key in next)) image.removeAttribute(key);
      }
      for (const [key, value] of Object.entries(next)) image.setAttribute(key, value);
    }
  };
})();
