import { ContextData } from './index'

/**
 * Latest Events, Announcements and Campus Happenings
 * Recent announcements, ongoing events, deadlines, and campus buzz
 */
export const latestEvents: ContextData = {
  section: 'latest-events',
  title: 'Latest Events & Campus Updates',
  lastUpdated: '2025-06-20',
  priority: 'medium',
  content: `
TRENDING NOW AT VIT:

Academic Events:
- Course Allocation Week: Schools are currently allocating courses to students (June 9-20, 2025)
- Registration Prep: Students preparing for course registration on June 28, 2025
- Academic Counseling: Available for course selection guidance
- VTOP Updates: Regular notifications being sent for allocation status

Upcoming Cultural Events:
- Gravitas'25 Planning: VIT's annual tech fest scheduled for September 26-28, 2025
- Independence Day Celebration: Special programs planned for August 15, 2025
- Freshers' Welcome: Planning underway for new Fall 2025 batch

Placement & Career Events:
- Summer Placement Results: Companies still conducting final rounds
- Pre-placement Talks: Planning for Fall 2025 campus recruitment
- Internship Opportunities: Summer 2025 internships in progress
- Industry Mentorship Programs: Applications opening for new academic year

Sports & Recreation:
- Inter-hostel Sports: Summer sports tournaments ongoing
- Gym Facilities: All fitness centers operating with extended hours
- Swimming Pool: Open with summer timings (6 AM - 10 PM)
- Sports Club Recruitment: Preparing for new academic year

Research & Innovation:
- Research Project Submissions: Summer project presentations ongoing
- Innovation Labs: New equipment installations in progress
- Conference Participation: Students presenting at international conferences
- Patent Applications: Several student innovations under review

Campus Life Updates:
- Hostel Facilities: Summer maintenance and upgrades in progress
- Transportation: Campus shuttle services running on summer schedule

Recent Announcements:
- Fee Structure 2025-26: Fee details available on VTOP, last day without fine is June 25, 2025

Special Initiatives:
- Green Campus Drive: Tree plantation and sustainability initiatives
- Digital Learning: New online learning platforms being integrated
- Industry Collaborations: New partnerships with tech companies announced
- Alumni Connect: Enhanced alumni networking programs launching

This Week's Highlights:
- Monday-Friday (June 9-20): Course allocation by Schools (ongoing)
- Weekend (June 28): Course registration (FFCS)

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
    nextBigEvent: 'Gravitas\'25',
    urgentDeadline: 'Course Registration - June 28, 2025',
    campusLife: 'Summer Session Active',
    lastMajorAnnouncement: 'Fall 2025-26 Academic Calendar Released',
    updateFrequency: 'Weekly'
  }
}
