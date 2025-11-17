
async function scrapeAllFaculty() {
  console.log('Starting full scraper...')

  const statusDiv = document.createElement('div')
  statusDiv.id = 'scraper-status'
  statusDiv.style.position = 'fixed'
  statusDiv.style.top = '10px'
  statusDiv.style.right = '10px'
  statusDiv.style.padding = '10px 20px'
  statusDiv.style.backgroundColor = '#002147'
  statusDiv.style.color = 'white'
  statusDiv.style.fontFamily = 'monospace'
  statusDiv.style.fontSize = '14px'
  statusDiv.style.zIndex = '9999'
  statusDiv.style.borderRadius = '5px'
  statusDiv.style.boxShadow = '0 0 10px rgba(0,0,0,0.5)'
  document.body.appendChild(statusDiv)

  function updateStatus(message) {
    console.log(message)
    statusDiv.textContent = message
  }

  const universityData = []

  updateStatus('Scraping school directory...')
  const schoolContainers = document.querySelectorAll('.eael-accordion-list')

  if (schoolContainers.length === 0) {
    updateStatus('ERROR: Could not find school containers on this page.')
    return
  }

  let totalDepartments = 0
  schoolContainers.forEach(container => {
    const schoolNameElement = container.querySelector('.eael-accordion-tab-title')
    const departmentLinks = container.querySelectorAll('.eael-accordion-content ul li a')

    if (!schoolNameElement || departmentLinks.length === 0) return

    const school = {
      school: schoolNameElement.textContent.trim(),
      departments: [],
    }

    departmentLinks.forEach(link => {
      totalDepartments++
      school.departments.push({
        department: link.textContent.trim().replace(/\n/g, ' '),
        url: link.href,
        faculty: [],
      })
    })
    universityData.push(school)
  })
  updateStatus(`Found ${universityData.length} schools and ${totalDepartments} departments.`)
  await new Promise(resolve => setTimeout(resolve, 1000))

  let departmentCount = 0
  for (const school of universityData) {
    for (const dept of school.departments) {
      departmentCount++
      updateStatus(`[${departmentCount}/${totalDepartments}] Scraping: ${dept.department}`)

      try {
        const response = await fetch(dept.url)
        if (!response.ok) {
          throw new Error(`HTTP error! Status: ${response.status}`)
        }
        const htmlText = await response.text()

        const parser = new DOMParser()
        const departmentDoc = parser.parseFromString(htmlText, 'text/html')

        dept.faculty = scrapeFacultyFromDeptPage(departmentDoc)
      } catch (error) {
        console.error(
          `Could not scrape department "${dept.department}" from URL ${dept.url}. Error: ${error.message}`
        )
        updateStatus(`Error scraping: ${dept.department}`)
        await new Promise(resolve => setTimeout(resolve, 1500))
      }
    }
  }

  updateStatus('Scraping complete! Check the console.')

  setTimeout(() => {
    if (document.getElementById('scraper-status')) {
      document.body.removeChild(statusDiv)
    }
  }, 5000)

  console.log('--- FINAL JSON OUTPUT ---')
  const finalJson = JSON.stringify(universityData, null, 2)
  console.log(finalJson)

  copyToClipboard(finalJson)
  console.log('Final JSON has been copied to your clipboard!')

  return universityData
}


function scrapeFacultyFromDeptPage(doc) {
  const facultyList = []
  const facultyArticles = doc.querySelectorAll('article.exad-post-grid-three')

  facultyArticles.forEach(article => {
    const nameElement = article.querySelector('h3 a.exad-post-grid-title')
    const designationElement = article.querySelector('.exad-post-grid-category li a')
    const imageElement = article.querySelector('figure.exad-post-grid-thumbnail img')

    let designation = 'N/A'
    if (designationElement) {
      designation = designationElement.textContent.trim()
    } else {
      const fallbackDesignation = article.querySelector('.exad-post-grid-body p')
      if (fallbackDesignation) {
        const pText = fallbackDesignation.textContent.trim()
        if (pText.length < 50) {
          designation = pText
        }
      }
    }

    const facultyMember = {
      name: nameElement ? nameElement.textContent.trim() : 'N/A',
      designation: designation,
      profile_url: nameElement ? nameElement.href : 'N/A',
      image_url: imageElement ? imageElement.src : 'N/A',
    }

    facultyList.push(facultyMember)
  })

  return facultyList
}


function copyToClipboard(text) {
  const dummy = document.createElement('textarea')
  dummy.style.position = 'fixed'
  dummy.style.top = 0
  dummy.style.left = 0
  dummy.style.opacity = 0

  document.body.appendChild(dummy)
  dummy.value = text
  dummy.select()
  document.execCommand('copy')
  document.body.removeChild(dummy)
}

scrapeAllFaculty()
