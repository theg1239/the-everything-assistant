import { ContextData } from './index'

export const academicCalendar: ContextData = {
  section: 'academic-calendar',
  title: 'Academic Calendar: Fall 2026-27 and Winter 2026-27',
  lastUpdated: '2026-11-02',
  priority: 'high',
  content: `
VIT Vellore. Dates are in local time (Asia/Kolkata); ranges are inclusive.

## Winter Semester 2026-27
Source: Dean of Academics circular VIT/VLR/Acad/2026/011, dated September 7, 2026. Applicable to all programmes except BSc (Agri). No later calendar revision was identified as of November 2, 2026.

- October 5–6, 2026: Course wish list registration, mandatory for course registration eligibility.
- October 28: Mock course registration for freshers (see registration notes below).
- November 1: Course registration.
- December 2: Winter semester commences.
- December 2–4: Course add/drop.
- December 11: Last date to pay re-registration fees.
- December 20, 2026–January 3, 2027: Winter vacation (15 days).
- January 15–17, 2027: Pongal holidays.
- January 24–31: CAT-I. January 26 is Republic Day (holiday).
- February 11–14: Riviera 2027 (event; the circular does not explicitly designate these dates as holidays).
- February 22–24: Course withdrawal.
- March 7–14: CAT-II. The calendar lists Ramzan on March 10 without explicitly designating it a holiday or non-instructional day.
- March 22: Holi (holiday).
- March 26: Good Friday (no instructional day).
- April 8: Telugu New Year (no instructional day).
- April 14: Tamil New Year / Dr. B. R. Ambedkar Birthday (holiday).
- April 16: Last theory instructional day; deadline to upload assignments and project reports.
- April 19: Theory FAT commences; the Controller of Examinations will announce the detailed schedule. No theory FAT end date, lab FAT window, or last lab instructional day is specified in the circular.
- May 10: Summer Term 2026-27 commencement (tentative).
- July 5: Fall Semester 2027-28 commencement (tentative).

Minimum 75% attendance is required to appear for CATs and FATs. Check subsequent official notices for changes and individual exam schedules.

## Registration notes
The October 26 mock-registration notice sets the October 28 window at 09:00–19:00 and says the course/slot/faculty allocation report will be in VTOP on October 27. Its stated exclusions are HOTS, V-SPARC, V-Sign, VAIAL, MSW and BBS (seniors); the calendar itself labels the mock as for freshers.

The October 30 course-registration guidelines confirm November 1 and December 2–4. Their registration scope covers current and timed-out students, except BSc Agri, BSc Hospitality and Hotel Administration, BDes, MArch, BArch, BSc Multimedia, BSc Visual Communication, MDes, MSW, and BTech Computer Science and Business System (2023 and 2024). These are registration exclusions, not replacements for the calendar's programme scope. Personal registration slots are available through VTOP/VITian; individual slots are not specified here. Add/drop permits Audit, Grade Improvement, Additional and Honour courses, and guide change is enabled.

The guidelines require BXXX498J Project II for 2023–24 BTech. Eligible MTech/MCA/MSc students admitted in 2025–26 may register six-month Internship II/Dissertation II; integrated MIC/MID/MIY students admitted in 2022–23 may register six-month Capstone/Master Thesis. Consult the guidelines for programme-specific details.


## Fall WEI Semester 2026-27 (separate calendar)
Dean of Academics circular VIT/VLR/Acad/2026/010, dated July 22, covers re-registration of N grades only, with no fresh registration, substitution, grade improvement or audit. It covers BTech timed-out students and 2023 and 2024 cohorts; three-year UG and five-year integrated MSc timed-out students and all seniors; and five-year integrated MTech timed-out students and 2022, 2023 and 2024 cohorts.

- July 25: Wish list registration; July 27–29: course allocation and scheduling by Schools; July 30, 11:00–18:00: course registration.
- August 1: Fall WEI commencement and first instructional day. August 9, 23:59 IST: fee payment deadline (July 31 fee notice).
- September 12–13: Midterm test.
- November 1: Last theory instructional day and assignment/project report upload deadline.


## Fall Semester 2026-27
Source: Dean of Academics circular VIT/VLR/Acad/2026/004, dated March 9, 2026, with later notices noted below.

- June 3: Wish list registration. June 8–19: Schools allocate and schedule courses. June 28: Course registration.
- July 6: Fall commencement; July 6–8: add/drop. July 17, 23:59 IST: re-registration fee deadline (July 10 fee notice).
- August 9–16: CAT-I; August 15 is Independence Day (holiday), with no CAT-I exam row that day.
- August 26: Meelad-un-Nabi / Onam (no instructional day). August 31–September 2: course withdrawal.
- September 4: Festivity Day (event; not explicitly designated a holiday). September 14: Vinayakar Chathurthi (holiday). September 18–20: Gravitas'26 (event).
- September 26–October 4: CAT-II, expanded from September 27–October 4 in the original calendar by the September 2 and September 25 notices. October 2 is Gandhi Jayanti (holiday), with no CAT-II exam row that day.
- October 7 and 8: Service Award Day (event). October 19: Ayutha Pooja (holiday).
- October 24: Last laboratory instructional day, with Monday order. October 26–30: laboratory FAT. October 31 follows Wednesday order, per the October 30 notice.
- November 3: Last theory instructional day and assignment/project report upload deadline. November 4–11: Deepavali holiday for students.
- November 12–December 5: Theory FAT across listed slots under the latest CoE schedule VIT/CoE/2026/26017, dated October 8. The March calendar’s November 12–December 1 window was refined by the August 28 CoE schedule, which already included slots through December 5; the October revision moved five exam dates. Some slots overlap the December 2 Winter commencement. See the exam schedule and VTOP for individual slots.

The June 24 Fall registration guidelines specify senior and timed-out students, with programme exclusions including BSc Agri, BSc Catering & Hotel Management, BDes, BArch, BSc Multimedia, BSc Visual Communication, MDes, MArch, MSW and BTech Computer Science & Business Systems (2023 and 2024). Schedules were available June 25 and offerings June 26 on VTOP/VITian. The calendar says converted Saturday orders are governed by VTOP; later notices specify the October 24 and 31 orders above.
`,
  metadata: {
    semester: 'Winter 2026-27',
    semesterStart: '2026-12-02',
    cat1Window: '2027-01-24 to 2027-01-31',
    cat2Window: '2027-03-07 to 2027-03-14',
    theoryFatStart: '2027-04-19',
    assignmentDeadline: '2027-04-16',
  },
}
