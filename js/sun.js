/* חישוב שקיעה אסטרונומית (מישורית) לפי מיקום ותאריך — ללא תלות ברשת */
(function () {
  const rad = Math.PI / 180;
  const norm = (v, m) => ((v % m) + m) % m;

  /** מחזיר Date (UTC) של השקיעה, או null אם אין שקיעה באותו יום */
  function sunset(date, lat, lng) {
    const y = date.getFullYear(), mo = date.getMonth(), d = date.getDate();
    const N = Math.round((Date.UTC(y, mo, d) - Date.UTC(y, 0, 0)) / 864e5);
    const lngHour = lng / 15;
    const t = N + (18 - lngHour) / 24;
    const M = 0.9856 * t - 3.289;
    const L = norm(M + 1.916 * Math.sin(M * rad) + 0.02 * Math.sin(2 * M * rad) + 282.634, 360);
    let RA = norm(Math.atan(0.91764 * Math.tan(L * rad)) / rad, 360);
    RA = (RA + Math.floor(L / 90) * 90 - Math.floor(RA / 90) * 90) / 15;
    const sinDec = 0.39782 * Math.sin(L * rad);
    const cosDec = Math.cos(Math.asin(sinDec));
    const cosH = (Math.cos(90.833 * rad) - sinDec * Math.sin(lat * rad)) / (cosDec * Math.cos(lat * rad));
    if (cosH > 1 || cosH < -1) return null;
    const H = Math.acos(cosH) / rad / 15;
    const UT = norm(H + RA - 0.06571 * t - 6.622 - lngHour, 24);
    return new Date(Date.UTC(y, mo, d) + UT * 36e5);
  }

  window.Sun = { sunset };
  if (typeof module !== 'undefined') module.exports = { sunset };
})();
