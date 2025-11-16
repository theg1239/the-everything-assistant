import { ContextData } from './index'

/**
 * Latest Events, Announcements and Campus Happenings
 * FAT status, Winter Semester prep, and campus buzz
 */
export const latestEvents: ContextData = {
  section: 'latest-events',
  title: 'Latest Events & Campus Updates',
  lastUpdated: '2025-11-16',
  priority: 'medium',
  content: `
WHAT'S HAPPENING NOW (Nov 16, 2025)
- FAT examinations have begun: laboratories wrapped up this week and theory slots start Nov 17.
- Hostel quiet hours enforced; movement requires hall ticket/ID.
- Winter Semester 2025-26 timetable dry-run underway; classrooms will be reassigned by Dec 4 night.

UPCOMING HIGHLIGHTS
- Dec 5: Winter Semester commencement immediately after FAT.
- Dec 5-7: Add/drop portal for timetable corrections.
- Dec 13: Re-registration payment deadline.
- Feb 26 – Mar 1: Riviera 2026 (plan travel + stage rehearsals well ahead).

REMINDERS
- Upload any pending projects before vacating campus.
- Wish list submissions from Oct 13-14 remain locked; only add/drop edits allowed Dec 5-7.
- Watch out for holiday stretches (Winter Vacation Dec 21-Jan 4, Pongal Jan 14-18).

CAMPUS LIFE
- Clubs operating in low-power mode until FAT ends; Riviera core teams recruiting volunteers post exams.
- Library and labs open extra hours 7 AM–10 PM for FAT; from Dec 5 they revert to semester schedule.

WHERE TO CHECK UPDATES
- VTOP > Announcements > “Winter Semester 2025-26” board for slotting + hall tickets.
- CoE circulars emailed nightly for any FAT timetable tweaks.
- Hostel notice boards for checkout/vacation logistics.
`,
  metadata: {
    trendingEvent: 'FAT exams in progress',
    nextBigEvent: 'Winter Semester 2025-26 Opening on 2025-12-05',
    urgentDeadline: 'Re-registration fee by 2025-12-13',
    campusLife: 'Exam mode + Riviera planning',
    updateFrequency: 'Daily during FAT',
  },
}
