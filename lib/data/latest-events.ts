import { ContextData } from './index'

/**
 * Latest Events, Announcements and Campus Happenings
 * Recent announcements, ongoing events, deadlines, and campus buzz
 */
export const latestEvents: ContextData = {
  section: 'latest-events',
  title: 'Latest Events & Campus Updates',
  lastUpdated: '2025-07-23',
  priority: 'medium',
  content: `
TRENDING NOW AT VIT:

Academic Events:
- Academic prep for CAT-1 ongoing

Upcoming Cultural Events:
- Gravitas'25 Planning: VIT's annual tech fest scheduled for September 26-28, 2025
- Independence Day Celebration: Special programs planned for August 15, 2025
- Freshers' Welcome: AARAMBH cultural fest ongoing

Placement & Career Events:
- Pre-placement Talks: Ongoing
- Internship Opportunities: Ongoing off campus/on campus
- Industry Mentorship Programs: Applications opening for new academic year

Campus Life Updates:
- Freshers are here and campus is VERY crowded
- New shop in front of F block men's hostel, they have a bring your own chips bag thing 

Special Initiatives:
- Green Campus Drive: Tree plantation and sustainability initiatives
- Digital Learning: New online learning platforms being integrated
- Industry Collaborations: New partnerships with tech companies announced
- Alumni Connect: Enhanced alumni networking programs launching

This Week's Highlights:
- AARAMBH cultural fest
- Weekend semester course registration: 25th July 2025, 11am to 6pm

Where to Get Updates:
- VTOP Portal: VTOP Spotlight board
- Your personal vitstudent.ac.in email address

Action Items for Students:
- Keep checking VTOP for course allocation updates
- Prepare course preferences for registration by June 28
- Clear any pending dues before registration
- Update contact information on VTOP portal
`,
  metadata: {
    trendingEvent: 'Course Allocation Week',
    nextBigEvent: "Gravitas'25",
    urgentDeadline: 'Weekend Semester Course Registration - July 25, 2025',
    campusLife: 'Fall Semester ongoinge',
    lastMajorAnnouncement: 'CAT-1 Soon',
    updateFrequency: 'Weekly',
  },
}
