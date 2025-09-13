import { ContextData } from './index'

/**
 * Latest Events, Announcements and Campus Happenings
 * Recent announcements, ongoing events, deadlines, and campus buzz
 */
export const latestEvents: ContextData = {
  section: 'latest-events',
  title: 'Latest Events & Campus Updates',
  lastUpdated: '2025-09-04',
  priority: 'medium',
  content: `
TRENDING NOW AT VIT:

Academic Events:
- CAT-1 examinations concluded (Aug 23, 2025)
- Expo-1 assessments concluded

Upcoming Events:
- GRAVITAS'25: Sept 26–28, 2025 — Registrations live at https://gravitas.vit.ac.in

Placement & Career Events:
- Pre-placement Talks: Ongoing
- Internship Opportunities: Ongoing off campus/on campus
- Industry Mentorship Programs: Applications opening for new academic year

Campus Life Updates:
- Regular classes resumed post CAT-1
- Pre-GRAVITAS activities across clubs and chapters

Special Initiatives:
- Green Campus Drive: Tree plantation and sustainability initiatives
- Digital Learning: New online learning platforms being integrated
- Industry Collaborations: New partnerships with tech companies announced
- Alumni Connect: Enhanced alumni networking programs launching

This Week's Highlights:
- GRAVITAS'25 registrations live
- Expo-1 completed
- Classes resumed; prepare for CAT-2 (Oct 5–11)

Where to Get Updates:
- VTOP Portal: VTOP Spotlight board
- GRAVITAS Website: https://gravitas.vit.ac.in
- Your personal vitstudent.ac.in email address

Action Items for Students:
- Register for GRAVITAS'25 events of interest
- Maintain attendance and start prep for CAT-2
`,
  metadata: {
    trendingEvent: 'GRAVITAS 2025 Registrations Live',
    nextBigEvent: "GRAVITAS'25 (Sep 26–28, 2025)",
    urgentDeadline: "GRAVITAS'25 Registration - Open Now",
    campusLife: 'Pre-GRAVITAS Week',
    lastMajorAnnouncement: "GRAVITAS'25 registrations live",
    updateFrequency: 'Weekly',
  },
}
