const fs = require('fs')
const path = require('path')

const DEPARTMENT_ACRONYMS: Record<string, string[]> = {
  cse: [
    'computer science and engineering',
    'computer science',
    'school of computer science and engineering',
    'scope',
  ],
  scope: [
    'computer science and engineering',
    'computer science',
    'school of computer science and engineering',
    'cse',
  ],
  smec: [
    'mechanical engineering',
    'school of mechanical engineering',
    'mechanical',
  ],
  mech: [
    'mechanical engineering',
    'school of mechanical engineering',
    'mechanical',
    'smec',
  ],
  ece: [
    'electronics and communication engineering',
    'electronics',
    'school of electronics engineering',
  ],
  ssl: [
    'school of social sciences and languages',
    'social sciences',
    'languages',
  ],
  sas: [
    'school of advanced sciences',
    'advanced sciences',
    'sas',
  ],
  score: [
    'information technology',
    'it',
    'school of information technology and engineering',
    'score',
  ],
  civil: [
    'civil engineering',
    'school of civil engineering',
    'civil',
    'sce',
  ],
  sce: [
    'civil engineering',
    'school of civil engineering',
    'civil',
    'sce',
  ],
}

function normalizeString(str: string): string {
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-z0-9 ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function matchesDepartment(deptName: string, filter: string): boolean {
  const normDept = normalizeString(deptName)
  const normFilter = normalizeString(filter)

  if (normDept.includes(normFilter) || normFilter.includes(normDept)) return true

  if (DEPARTMENT_ACRONYMS[normFilter]) {
    if (DEPARTMENT_ACRONYMS[normFilter].some(full => normDept.includes(normalizeString(full)))) {
      return true
    }
  }
  if (DEPARTMENT_ACRONYMS[normDept]) {
    if (DEPARTMENT_ACRONYMS[normDept].some(full => normFilter.includes(normalizeString(full)))) {
      return true
    }
  }
  for (const [acronym, names] of Object.entries(DEPARTMENT_ACRONYMS)) {
    if (
      names.some(
        n =>
          normDept.includes(normalizeString(n)) &&
          (normFilter === acronym || normFilter.includes(acronym) || acronym.includes(normFilter))
      )
    ) {
      return true
    }
    if (
      names.some(
        n =>
          normFilter.includes(normalizeString(n)) &&
          (normDept === acronym || normDept.includes(acronym) || acronym.includes(normDept))
      )
    ) {
      return true
    }
  }
  const deptTokens = normDept.split(' ')
  const filterTokens = normFilter.split(' ')
  if (filterTokens.every(f => deptTokens.some(d => d.startsWith(f) || d === f))) return true
  if (deptTokens.every(d => filterTokens.some(f => f.startsWith(d) || f === d))) return true
  return false
}

const facultyPath = path.join(__dirname, '../public/faculty.json')
const facultyData = JSON.parse(fs.readFileSync(facultyPath, 'utf-8'))

console.log('All schools found in faculty.json:')
for (const school of facultyData) {
  if (school.school) {
    console.log('-', school.school)
  }
}
console.log('\nAll departments found in faculty.json:')
for (const school of facultyData) {
  for (const dept of school.departments || []) {
    if (dept.department) {
      console.log('-', dept.department, `(School: ${school.school})`)
    }
  }
}
console.log('\n--- Matching Results ---')

const testQueries = [
  'mechanical',
  'smec',
  'school of mechanical engineering',
  'computer science',
  'cse',
  'school of computer science and engineering',
  'civil',
  'school of civil engineering',
]

for (const query of testQueries) {
  const matches: { school: string, department: string }[] = []
  for (const school of facultyData) {
    if (school.school && matchesDepartment(school.school, query)) {
      for (const dept of school.departments || []) {
        if (dept.department) {
          matches.push({ school: school.school, department: dept.department })
        }
      }
      continue
    }
    for (const dept of school.departments || []) {
      if (dept.department && matchesDepartment(dept.department, query)) {
        matches.push({ school: school.school, department: dept.department })
      }
    }
  }
  console.log(`Query: '${query}' => Matched:`, matches)
}
