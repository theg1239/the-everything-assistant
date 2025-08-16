import { ContextData } from './index'

/**
 * Latest Events, Announcements and Campus Happenings
 * Recent announcements, ongoing events, deadlines, and campus buzz
 */
export const latestEvents: ContextData = {
  section: 'latest-events',
  title: 'Latest Events & Campus Updates',
  lastUpdated: '2025-08-16',
  priority: 'medium',
  content: `
TRENDING NOW AT VIT:

Academic Events:
- CAT-1 examinations ongoing (Aug 17-23, 2025)

Upcoming Events:
- Vinayaka Chathurthi: Holiday on August 27, 2025
- Gravitas'25: Tech fest planning continues for September 26-28, 2025

Placement & Career Events:
- Pre-placement Talks: Ongoing
- Internship Opportunities: Ongoing off campus/on campus
- Industry Mentorship Programs: Applications opening for new academic year

Campus Life Updates:
- Campus movement adjusted due to exam schedules

Special Initiatives:
- Green Campus Drive: Tree plantation and sustainability initiatives
- Digital Learning: New online learning platforms being integrated
- Industry Collaborations: New partnerships with tech companies announced
- Alumni Connect: Enhanced alumni networking programs launching

This Week's Highlights:
- CAT-1 examinations in progress (Aug 17-23)
- Hall tickets and seating published on VTOP

Where to Get Updates:
- VTOP Portal: VTOP Spotlight board
- Your personal vitstudent.ac.in email address

Action Items for Students:
- Verify exam schedule, carry hall ticket and ID
`,
  metadata: {
    trendingEvent: 'CAT-1 Examinations',
    nextBigEvent: 'Vinayaka Chathurthi (Aug 27, 2025)',
    urgentDeadline: 'CAT-1 Ends - Aug 23, 2025',
    campusLife: 'CAT-1 Week',
    lastMajorAnnouncement: 'CAT-1 timetable/hall tickets on VTOP',
    updateFrequency: 'Weekly',
  },
}
