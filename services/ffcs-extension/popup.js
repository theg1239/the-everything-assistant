document.addEventListener('DOMContentLoaded', function () {
  const scrapeButton = document.getElementById('scrapeButton')
  const statusElement = document.getElementById('status')

  scrapeButton.addEventListener('click', function () {
    statusElement.textContent = 'Scraping... please wait.'
    scrapeButton.disabled = true

    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
      if (tabs[0] && tabs[0].url && tabs[0].url.includes('vtop.vit.ac.in')) {
        chrome.scripting.executeScript(
          {
            target: { tabId: tabs[0].id },
            files: ['content.js'],
          },
          () => {
            if (chrome.runtime.lastError) {
              statusElement.textContent = 'Error: ' + chrome.runtime.lastError.message
              scrapeButton.disabled = false
            } else {
            }
          }
        )
      } else {
        statusElement.textContent = 'Not on a VTOP page.'
        scrapeButton.disabled = false
      }
    })
  })

  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'scraping_done') {
      statusElement.textContent = `Scraping complete! ${request.count} records found.`
      scrapeButton.disabled = false
    } else if (request.action === 'scraping_error') {
      statusElement.textContent = 'Error: ' + request.message
      scrapeButton.disabled = false
    } else if (request.action === 'update_status') {
      statusElement.textContent = request.message
    }
  })
})
