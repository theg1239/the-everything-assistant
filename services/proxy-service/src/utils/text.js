function cleanVTOPOutput(output, command) {
  if (!output || typeof output !== 'string') return output

  let cleaned = output

  cleaned = cleaned.replace(/\x1b\[[0-9;]*[mGKH]/g, '')
  cleaned = cleaned.replace(/^Proxy command:.*$/gm, '')
  cleaned = cleaned.replace(/^Proxy executing command:.*$/gm, '')
  cleaned = cleaned.replace(/^username: \w+.*$/gm, '')
  cleaned = cleaned.replace(/^args: \[.*\]$/gm, '')
  cleaned = cleaned.replace(/^Attempting login for user:.*$/gm, '')
  cleaned = cleaned.replace(/^\(Helper - .*?\):.*$/gm, '')
  cleaned = cleaned.replace(/^No captcha image found.*$/gm, '')
  cleaned = cleaned.replace(/^Login successful for user:.*$/gm, '')
  cleaned = cleaned.replace(/^\{"command":".*","success":true\}$/gm, '')
  cleaned = cleaned.replace(/^Your selected semester:.*$/gm, '')
  cleaned = cleaned.replace(/^Your selected Course:.*$/gm, '')
  cleaned = cleaned.replace(/^Your selected Faculty:.*$/gm, '')
  cleaned = cleaned.replace(/^Choose a semester \(enter a number\):.*$/gm, '')
  cleaned = cleaned.replace(/^Choose a Course \(enter a number\):.*$/gm, '')
  cleaned = cleaned.replace(/^Enter a search term.*$/gm, '')
  cleaned = cleaned.replace(/\n\s*\n\s*\n+/g, '\n\n')
  cleaned = cleaned.replace(/^\s+|\s+$/g, '')

  if (command === 'marks') {
    const lines = cleaned.split('\n')
    const meaningfulLines = []

    for (const line of lines) {
      const trimmedLine = line.trim()

      if (
        !trimmedLine ||
        trimmedLine.startsWith('Proxy') ||
        trimmedLine.startsWith('Helper') ||
        trimmedLine.startsWith('Login') ||
        trimmedLine.startsWith('Attempting') ||
        trimmedLine.startsWith('captcha') ||
        trimmedLine.startsWith('Choose') ||
        trimmedLine.startsWith('Your selected') ||
        trimmedLine.match(/^{"command"/)
      ) {
        continue
      }

      if (
        trimmedLine.includes(' - ') ||
        trimmedLine.includes('TITLE') ||
        trimmedLine.includes('/') ||
        trimmedLine.includes('Quiz') ||
        trimmedLine.includes('Mid Term') ||
        trimmedLine.includes('Assignment') ||
        trimmedLine.match(/^\d+$/) ||
        trimmedLine.match(/[0-9]+\.[0-9]+/) ||
        trimmedLine.length > 5
      ) {
        meaningfulLines.push(trimmedLine)
      }
    }

    cleaned = meaningfulLines.join('\n')
  }

  return cleaned
}

module.exports = {
  cleanVTOPOutput,
}
