import { ContextData } from './index'

/**
 * Holiday Calendar and Leave Information
 * Upcoming official holidays, semester breaks, and policy reminders
 */
export const holidays: ContextData = {
  section: 'holidays',
  title: 'Holiday Calendar (Nov 2025 – Jul 2026)',
  lastUpdated: '2025-11-16',
  priority: 'medium',
  content: `
Official VIT Vellore Holidays & Breaks (Aligned with Winter Semester 2025-26 circular)

Late Fall 2025
- Nov 17 – Dec 4, 2025: FAT theory window (exam mode; no regular classes).
- Dec 21, 2025 – Jan 4, 2026: Winter vacation (15 days).

Early 2026
- Jan 14 – Jan 18, 2026: Pongal holidays.
- Feb 26 – Mar 1, 2026: Riviera 2026 (major campus festival; academic activities limited to exams/practicals).
- Mar 4, 2026 (Wed): Holi (Holiday).
- Mar 19, 2026 (Thu): Ramzan (Holiday).
- Mar 20, 2026 (Fri): Telugu New Year's Day (Holiday).

Late Semester 2026
- Apr 3, 2026 (Fri): Good Friday (No instructional day).
- Apr 10, 2026 (Fri): Last instructional day for labs (not a holiday but marks shift to FAT mode).
- Apr 14, 2026 (Tue): Tamil New Year's Day & Dr. B. R. Ambedkar Birthday (Holiday).
- Apr 17, 2026 (Fri): Last instructional day for theory classes.
- Apr 20, 2026 onward: Theory FATs (exam schedule from CoE).
- May 11, 2026 (Mon): Summer Term 2025-26 commences (tentative).
- Jul 13, 2026 (Mon): Fall Semester 2026-27 commences (tentative).

Leave & Attendance Notes
- Attendance resets for Winter Semester; minimum 75% needed to sit for CAT/FAT.
- Exam days are not casual leave; absence counts against attendance and may require medical proof.
- Hostel/mess operate on reduced hours during long breaks; plan travel for Dec 20 or after.
- Any government-notified changes will be mirrored on VTOP circulars; check weekly.
`,
  metadata: {
    winterBreak: '2025-12-21 to 2026-01-04',
    pongalBreak: '2026-01-14 to 2026-01-18',
    ramzanDate: '2026-03-19',
    teluguNewYear: '2026-03-20',
    goodFriday: '2026-04-03',
    tamilNewYear: '2026-04-14',
  },
}
