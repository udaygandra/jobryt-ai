/**
 * tests/ui/light-theme-sweep.js
 * Automated relative luminance auditor for light theme surfaces.
 * Evaluates visible elements and flags unexpected dark backgrounds (luminance < 0.2).
 */

function parseRgb(colorStr) {
  if (!colorStr) return null;
  const match = colorStr.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
  if (!match) return null;
  const a = match[4] !== undefined ? parseFloat(match[4]) : 1;
  return { r: parseInt(match[1], 10), g: parseInt(match[2], 10), b: parseInt(match[3], 10), a };
}

function calculateRelativeLuminance(r, g, b) {
  const sR = r / 255;
  const sG = g / 255;
  const sB = b / 255;

  const R = sR <= 0.03928 ? sR / 12.92 : Math.pow((sR + 0.055) / 1.055, 2.4);
  const G = sG <= 0.03928 ? sG / 12.92 : Math.pow((sG + 0.055) / 1.055, 2.4);
  const B = sB <= 0.03928 ? sB / 12.92 : Math.pow((sB + 0.055) / 1.055, 2.4);

  return 0.2126 * R + 0.7152 * G + 0.0722 * B;
}

function runLuminanceSweep(root = document.body) {
  const darkElements = [];
  const allElements = root.querySelectorAll('*');

  allElements.forEach((el) => {
    // Skip hidden or unrendered elements
    if (el.offsetParent === null && el.tagName !== 'BODY' && !el.classList.contains('fixed')) {
      return;
    }
    const tag = el.tagName.toLowerCase();
    if (['script', 'style', 'svg', 'path', 'img', 'video', 'canvas', 'noscript'].includes(tag)) {
      return;
    }

    // Skip intentional terminal or code logs
    if (el.id === 'scan-logs' || el.closest('#scan-logs')) {
      return;
    }

    // Skip intentional brand buttons (e.g. primary amber button)
    if (el.classList.contains('bg-[#D9A441]') || el.closest('.bg-[#D9A441]')) {
      return;
    }

    const style = window.getComputedStyle(el);
    const bg = style.backgroundColor;
    const parsed = parseRgb(bg);

    if (!parsed || parsed.a === 0) return; // transparent

    // If semi-transparent, blend with parent or skip if alpha < 0.25
    if (parsed.a < 0.25) return;

    const luminance = calculateRelativeLuminance(parsed.r, parsed.g, parsed.b);

    if (luminance < 0.2) {
      darkElements.push({
        tag,
        id: el.id || null,
        classes: el.className || '',
        bg,
        luminance: Math.round(luminance * 1000) / 1000
      });
    }
  });

  return {
    totalChecked: allElements.length,
    darkElementsFound: darkElements.length,
    darkElements
  };
}

if (typeof window !== 'undefined') {
  window.runLuminanceSweep = runLuminanceSweep;
}

if (typeof module !== 'undefined') {
  module.exports = { parseRgb, calculateRelativeLuminance, runLuminanceSweep };
}
