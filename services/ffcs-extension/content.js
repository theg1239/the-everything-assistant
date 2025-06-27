;(async () => {
  console.log('VTOP Scraper: Content script injected.')

  function updateStatus(message) {
    chrome.runtime.sendMessage({ action: 'update_status', message: message })
  }

  function getCsrfAndAuthId() {
    const scripts = Array.from(document.querySelectorAll('script:not([src])'))
    let csrfToken = null
    let authorizedId = null

    const csrfRegex = /var csrfValue = "([^"]+)"/
    const authIdRegex = /var id="([^"]+)"/

    for (const script of scripts) {
      const scriptContent = script.innerHTML
      if (!csrfToken) {
        const csrfMatch = scriptContent.match(csrfRegex)
        if (csrfMatch && csrfMatch[1]) {
          csrfToken = csrfMatch[1]
        }
      }
      if (!authorizedId) {
        if (
          scriptContent.includes('getCoursesListForCurriculmCategory') ||
          scriptContent.includes('getCoursesDetail')
        ) {
          const authIdMatch = scriptContent.match(authIdRegex)
          if (authIdMatch && authIdMatch[1]) {
            authorizedId = authIdMatch[1]
          }
        }
      }
      if (csrfToken && authorizedId) break
    }

    if (!csrfToken) {
      const csrfInput = document.querySelector('input[name="_csrf"]')
      if (csrfInput) csrfToken = csrfInput.value
    }

    if (!csrfToken || !authorizedId) {
      console.error('VTOP Scraper: Could not find CSRF token or Authorized ID.')
      throw new Error(
        "CSRF token or Authorized ID not found. Ensure you are on the correct page and it's fully loaded."
      )
    }
    console.log('VTOP Scraper: CSRF:', csrfToken, 'AuthID:', authorizedId)
    return { csrfToken, authorizedId }
  }

  async function makePostRequest(url, data) {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        },
        body: new URLSearchParams(data).toString(),
      })
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status} for ${url}`)
      }
      return await response.text()
    } catch (error) {
      console.error(`VTOP Scraper: Error in POST request to ${url}:`, error)
      throw error
    }
  }

  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  async function scrapeData() {
    const allCourseDetails = []
    const csvHeader = 'CODE,TITLE,TYPE,VENUE,SLOT,FACULTY\n'

    try {
      updateStatus('Extracting credentials...')
      const { csrfToken, authorizedId } = getCsrfAndAuthId()
      const baseUrl = window.location.origin + '/vtop/'

      const curriculumCategorySelect = document.getElementById('curriculumCategory')
      if (!curriculumCategorySelect) {
        throw new Error('Curriculum category dropdown not found.')
      }

      const categories = Array.from(curriculumCategorySelect.options)
        .filter(option => option.value !== '')
        .map(option => ({ value: option.value, text: option.text }))

      updateStatus(`Found ${categories.length} categories. Starting...`)
      console.log('VTOP Scraper: Categories to process:', categories)

      for (let i = 0; i < categories.length; i++) {
        const category = categories[i]
        updateStatus(`Processing category ${i + 1}/${categories.length}: ${category.text}`)
        console.log(`VTOP Scraper: Processing Category: ${category.value} (${category.text})`)

        const courseListParams = {
          _csrf: csrfToken,
          cccategory: category.value,
          authorizedID: authorizedId,
          x: new Date().toUTCString(),
        }

        const courseListHtml = await makePostRequest(
          baseUrl + 'academics/common/getCoursesListForCurriculmCategory',
          courseListParams
        )

        await sleep(1000 + Math.random() * 1000)

        const tempDivCourses = document.createElement('div')
        tempDivCourses.innerHTML = courseListHtml
        const courseSelect = tempDivCourses.querySelector('#courseId')

        if (!courseSelect) {
          console.warn(
            `VTOP Scraper: No course list found for category ${category.value}. Skipping.`
          )
          continue
        }

        const courses = Array.from(courseSelect.options)
          .filter(option => option.value !== '')
          .map(option => {
            const parts = option.text.split(' - ')
            return {
              code: option.value,
              title: parts.length > 1 ? parts.slice(1).join(' - ') : parts[0],
            }
          })

        console.log(`VTOP Scraper: Found ${courses.length} courses in category ${category.value}`)

        for (let j = 0; j < courses.length; j++) {
          const course = courses[j]
          updateStatus(
            `Category ${i + 1}/${categories.length}, Course ${j + 1}/${courses.length}: ${course.code}`
          )
          console.log(`VTOP Scraper: Processing Course: ${course.code} - ${course.title}`)

          const courseDetailParams = {
            _csrf: csrfToken,
            courseCode: course.code,
            authorizedID: authorizedId,
            x: new Date().toUTCString(),
          }

          const courseDetailHtml = await makePostRequest(
            baseUrl + 'academics/common/getCoursesDetailForRegistration',
            courseDetailParams
          )

          await sleep(1000 + Math.random() * 1000)

          const tempDivDetails = document.createElement('div')
          tempDivDetails.innerHTML = courseDetailHtml
          const detailTable = tempDivDetails.querySelector('table.table-bordered')

          if (detailTable) {
            const rows = detailTable.querySelectorAll('tbody tr')
            rows.forEach(row => {
              const cells = row.querySelectorAll('td')
              if (cells.length === 4) {
                const slot = cells[0].textContent.trim()
                const venue = cells[1].textContent.trim()
                const faculty = cells[2].textContent.trim()
                const type = cells[3].textContent.trim()

                allCourseDetails.push({
                  CODE: course.code,
                  TITLE: course.title,
                  TYPE: type,
                  VENUE: venue,
                  SLOT: slot,
                  FACULTY: faculty,
                })
              }
            })
          } else {
            console.warn(`VTOP Scraper: No details table found for course ${course.code}`)
          }
        }
      }

      console.log('VTOP Scraper: Scraping finished. Total records:', allCourseDetails.length)
      if (allCourseDetails.length > 0) {
        generateAndDownloadCsv(csvHeader, allCourseDetails)
        chrome.runtime.sendMessage({ action: 'scraping_done', count: allCourseDetails.length })
      } else {
        updateStatus('No data found.')
        chrome.runtime.sendMessage({ action: 'scraping_done', count: 0 })
      }
    } catch (error) {
      console.error('VTOP Scraper: CRITICAL ERROR in scrapeData:', error)
      chrome.runtime.sendMessage({ action: 'scraping_error', message: error.message })
    }
  }

  function generateAndDownloadCsv(header, data) {
    let csvContent = header

    data.forEach(row => {
      const csvRow = [
        `"${row.CODE.replace(/"/g, '""')}"`,
        `"${row.TITLE.replace(/"/g, '""')}"`,
        `"${row.TYPE.replace(/"/g, '""')}"`,
        `"${row.VENUE.replace(/"/g, '""')}"`,
        `"${row.SLOT.replace(/"/g, '""')}"`,
        `"${row.FACULTY.replace(/"/g, '""')}"`,
      ].join(',')
      csvContent += csvRow + '\n'
    })

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    if (link.download !== undefined) {
      const url = URL.createObjectURL(blob)
      link.setAttribute('href', url)
      link.setAttribute('download', 'vtop_course_details.csv')
      link.style.visibility = 'hidden'
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)
    }
    console.log('VTOP Scraper: CSV download initiated.')
  }

  scrapeData()
})()
