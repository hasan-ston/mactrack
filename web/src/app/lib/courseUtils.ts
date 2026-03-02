/**
 * Shared utility functions for course data processing.
 */

/**
 * Parse units from a McMaster course number.
 * McMaster encodes unit count in the last 2 digits of the course number.
 * 
 * Examples:
 *   "2C03" → 3 units
 *   "1P13" → 13 units
 *   "1ZA3" → 3 units
 *   "4ZZ6" → 6 units
 *
 * Falls back to defaultUnits (default 3) if parsing fails.
 */
export function unitsFromCourseNumber(courseNumber: string, defaultUnits = 3): number {
  if (!courseNumber || courseNumber.length < 2) return defaultUnits;
  const suffix = courseNumber.slice(-2);
  const n = parseInt(suffix, 10);
  return isNaN(n) || n === 0 ? defaultUnits : n;
}

/**
 * Split a McMaster course code like "COMPSCI 2C03" into subject + number.
 */
export function parseCourseCode(code: string): { subject: string; courseNumber: string } {
  const spaceIdx = code.indexOf(" ");
  if (spaceIdx === -1) return { subject: code, courseNumber: "" };
  return { subject: code.slice(0, spaceIdx), courseNumber: code.slice(spaceIdx + 1) };
}
