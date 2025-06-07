import puppeteer from "puppeteer-core"
import chromium from "@sparticuz/chromium"

interface Paper {
  title: string
  url: string
  source: string
  metadata: string
  examType: string
  year: string
}

interface ApiPaper {
  title?: string
  name?: string
  paperName?: string
  url?: string
  downloadUrl?: string
  link?: string
  paperUrl?: string
  metadata?: string
  description?: string
  examType?: string
  year?: string
  academicYear?: string
}

interface ScraperResult {
  success: boolean
  papers: Paper[]
  error?: string
  source: string
  searchUrl?: string
}

export async function scrapePapersCodeChef(courseCode: string, examType?: string, year?: string): Promise<ScraperResult> {
  try {
    const apiResult = await tryAPIApproach(courseCode, examType, year)
    if (apiResult.success && apiResult.papers.length > 0) {
      return apiResult
    }

    return await tryBrowserScraping(courseCode, examType, year)
  } catch (error) {
    console.error("Error in scrapePapersCodeChef:", error)
    const errorMessage = error instanceof Error ? error.message : String(error)
    return {
      success: false,
      papers: [],
      error: errorMessage,
      source: "papers.codechefvit.com",
    }
  }
}

async function tryAPIApproach(courseCode: string, examType?: string, year?: string): Promise<ScraperResult> {
  try {
    const fullCourseName = findFullCourseName(courseCode)

    const searchUrl = `https://papers.codechefvit.com/api/papers?subject=${encodeURIComponent(fullCourseName)}`

    const response = await fetch(searchUrl, {
      headers: {
        accept: "application/json, text/plain, */*",
        "accept-language": "en-US,en;q=0.9",
        "sec-ch-ua": '"Brave";v="137", "Chromium";v="137", "Not/A)Brand";v="24"',
        "sec-ch-ua-mobile": "?0",
        "sec-ch-ua-platform": '"Windows"',
        "sec-fetch-dest": "empty",
        "sec-fetch-mode": "cors",
        "sec-fetch-site": "same-origin",
        "sec-gpc": "1",
        Referer: `https://papers.codechefvit.com/catalogue?subject=${encodeURIComponent(fullCourseName)}`,
        "Referrer-Policy": "strict-origin-when-cross-origin",
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
      },
    })

    if (response.ok) {
      const data = await response.json()
      // After getting the data from API, add proper filtering
      if (data && Array.isArray(data) && data.length > 0) {
        let papers: Paper[] = data.map((paper: ApiPaper) => ({
          title: paper.title || paper.name || paper.paperName || "Question Paper",
          url: paper.url || paper.downloadUrl || paper.link || paper.paperUrl || "",
          source: "papers.codechefvit.com",
          metadata: paper.metadata || paper.description || paper.examType || "",
          examType: paper.examType || examType || "unknown",
          year: paper.year || paper.academicYear || year || "unknown",
        }))

        // Filter by examType if specified
        if (examType) {
          papers = papers.filter((paper) => {
            const paperTitle = paper.title.toLowerCase()
            const paperMeta = paper.metadata.toLowerCase()
            const examTypeLower = examType.toLowerCase()

            return (
              paperTitle.includes(examTypeLower) ||
              paperMeta.includes(examTypeLower) ||
              (paper.examType && paper.examType.toLowerCase().includes(examTypeLower))
            )
          })
        }

        // Filter by year if specified
        if (year) {
          papers = papers.filter((paper) => {
            const paperTitle = paper.title.toLowerCase()
            const paperMeta = paper.metadata.toLowerCase()

            return paperTitle.includes(year) || paperMeta.includes(year) || (paper.year && paper.year.includes(year))
          })
        }

        return {
          success: true,
          papers: papers.slice(0, 10),
          source: "papers.codechefvit.com",
          searchUrl,
        }
      }
    }

    const codeOnlyUrl = `https://papers.codechefvit.com/api/papers?subject=${encodeURIComponent(courseCode)}`
    const codeResponse = await fetch(codeOnlyUrl, {
      headers: {
        accept: "application/json, text/plain, */*",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
    })

    if (codeResponse.ok) {
      const codeData = await codeResponse.json()
      if (codeData && Array.isArray(codeData) && codeData.length > 0) {
        const papers = codeData.map((paper: any) => ({
          title: paper.title || paper.name || paper.paperName || "Question Paper",
          url: paper.url || paper.downloadUrl || paper.link || paper.paperUrl,
          source: "papers.codechefvit.com",
          metadata: paper.metadata || paper.description || paper.examType || "",
          examType: paper.examType || examType || "unknown",
          year: paper.year || paper.academicYear || year || "unknown",
        }))

        return {
          success: true,
          papers: papers.slice(0, 10),
          source: "papers.codechefvit.com",
          searchUrl: codeOnlyUrl,
        }
      }
    }

    return { success: false, papers: [], source: "papers.codechefvit.com" }
  } catch (error) {
    console.error("API approach error:", error)
    return { success: false, papers: [], source: "papers.codechefvit.com" }
  }
}

function findFullCourseName(courseCode: string): string {
  // VIT course mappings based on the actual data you provided
  const courseMap: { [key: string]: string } = {
    // Mathematics courses
    BMAT101L: "Calculus [BMAT101L]",
    BMAT102L: "Differential Equations and Transforms [BMAT102L]",
    BMAT201L: "Complex Variables and Linear Algebra [BMAT201L]",
    BMAT202L: "Probability and Statistics [BMAT202L]",
    BMAT202P: "Probability and Statistics Lab [BMAT202P]",
    BMAT203L: "Linear Algebra and Differential Equations [BMAT203L]",
    BMAT205L: "Discrete Mathematics and Graph Theory [BMAT205L]",
    MAT1014: "Discrete Mathematics and Graph Theory [MAT1014]",
    MAT2001: "Statistics for Engineers [MAT2001]",
    UMAT201L: "Linear Algebra [UMAT201L]",
    IMAT101L: "Calculus [IMAT101L]",
    IMAT102L: "Differential Equations and Transforms [IMAT102L]",
    IMAT201L: "Complex Variables and Linear Algebra [IMAT201L]",
    TMAT201L: "Probability and Statistics [TMAT201L]",
    BMAT100L: "Mathematics [BMAT100L]",

    // Computer Science courses
    BCSE101E: "Computer Programming: Python [BCSE101E]",
    BCSE102L: "Structured and Object-Oriented Programming [BCSE102L]",
    BCSE102P: "Structured and Object-Oriented Programming Lab [BCSE102P]",
    BCSE103E: "Computer Programming: Java [BCSE103E]",
    BCSE202L: "Data Structures and Algorithms [BCSE202L]",
    BCSE204L: "Design and Analysis of Algorithms [BCSE204L]",
    BCSE205L: "Computer Architecture and Organization [BCSE205L]",
    BCSE206L: "Foundations of Data Science [BCSE206L]",
    BCSE207L: "Programming for Data Science [BCSE207L]",
    BCSE208L: "Data Mining [BCSE208L]",
    BCSE209L: "Machine Learning [BCSE209L]",
    BCSE301L: "Software Engineering [BCSE301L]",
    BCSE302L: "Database Systems [BCSE302L]",
    BCSE303L: "Operating Systems [BCSE303L]",
    BCSE304L: "Theory of Computation [BCSE304L]",
    BCSE305L: "Embedded Systems Design [BCSE305L]",
    BCSE306L: "Artificial Intelligence [BCSE306L]",
    BCSE307L: "Compiler Design [BCSE307L]",
    BCSE308L: "Computer Networks [BCSE308L]",
    BCSE309L: "Cryptography and Network Security [BCSE309L]",
    BCSE310L: "IoT Architectures and Protocols [BCSE310L]",
    BCSE311L: "Sensors and Actuator Devices [BCSE311L]",
    BCSE313L: "Fundamentals of Fog and Edge Computing [BCSE313L]",
    BCSE317L: "Information Security [BCSE317L]",
    BCSE318L: "Data Privacy [BCSE318L]",
    BCSE319L: "Penetration Testing and Vulnerability Assessment [BCSE319L]",
    BCSE320L: "Web Application Security [BCSE320L]",
    BCSE321L: "Malware Analysis [BCSE321L]",
    BCSE322L: "Digital Forensics [BCSE322L]",
    BCSE323L: "Digital Watermarking and Steganography [BCSE323L]",
    BCSE324L: "Foundations of Blockchain Technology [BCSE324L]",
    BCSE325L: "Introduction to Bitcoin [BCSE325L]",
    BCSE332L: "Deep Learning [BCSE332L]",
    BCSE334L: "Predictive Analytics [BCSE334L]",
    BCSE351E: "Foundations of Data Analytics [BCSE351E]",
    BCSE352E: "Essentials Of Data Analytics [BCSE352E]",
    BCSE355L: "AWS Solutions Architect [BCSE355L]",
    BCSE401L: "Internet of Things [BCSE401L]",
    BCSE402L: "Big Data Analytics [BCSE402L]",
    BCSE409L: "Natural Language Processing [BCSE409L]",
    BCSE410L: "Cyber Security [BCSE410L]",
    CSE1007: "Java Programming [CSE1007]",
    CSE4020: "Machine Learning [CSE4020]",
    CBS1004: "Computer Architecture and Organization [CBS1004]",
    CBS3002: "Information Security [CBS3002]",
    CBS3004: "Artficial Intelligence [CBS3004]",
    CSI2002: "Data Structures and Algorithm Analysis [CSI2002]",
    CSI2003: "Advanced Algorithms [CSI2003]",
    CSI2005: "Principles of Compiler Design [CSI2005]",
    CSI2007: "Data Communication and Networks [CSI2007]",
    SWE4002: "Cloud Computing [SWE4002]",
    CSE3501: "Information Security Analysis and Audit [CSE3501]",
    UCSC203L: "Computer Networks [UCSC203L]",
    ICSE102L: "Structured and Object-Oriented Programming [ICSE102L]",
    ISWE101L: "Software Engineering [ISWE101L]",
    ISWE102L: "Data Structures and Algorithms [ISWE102L]",
    ISWE103L: "Database Systems [ISWE103L]",
    ISWE201L: "Digital Logic and Microprocessor [ISWE201L]",
    ISWE202L: "Requirements Engineering and Management [ISWE202L]",
    ISWE203L: "Theory of Computation [ISWE203L]",
    ISWE204L: "Operating Systems [ISWE204L]",
    ISWE206L: "Web Technologies [ISWE206L]",
    ISWE301L: "Computer Architecture and Organization [ISWE301L]",
    TCSE207L: "Computer Programming: Python [TCSE207L]",

    // Information Technology courses
    BITE101N: "Introduction to Engineering [BITE101N]",
    BITE201L: "Data Structures and Algorithms [BITE201L]",
    BITE201P: "Data Structures and Algorithms Lab [BITE201P]",
    BITE202L: "Digital Logic and Microprocessors [BITE202L]",
    BITE202P: "Digital Logic and Microprocessors Lab [BITE202P]",
    BITE203L: "Principles of Communication Systems [BITE203L]",
    BITE301L: "Computer Architecture and Organization [BITE301L]",
    BITE302L: "Database Systems [BITE302L]",
    BITE302P: "Database Systems Lab [BITE302P]",
    BITE303L: "Operating Systems [BITE303L]",
    BITE303P: "Operating Systems Lab [BITE303P]",
    BITE304L: "Web Technologies [BITE304L]",
    BITE304P: "Web Technologies Lab [BITE304P]",
    BITE305L: "Computer Networks [BITE305L]",
    BITE305P: "Computer Networks Lab [BITE305P]",
    BITE306L: "Theory of Computation [BITE306L]",
    BITE307L: "Software Engineering [BITE307L]",
    BITE308L: "Artificial Intelligence [BITE308L]",
    BITE308P: "Artificial Intelligence Lab [BITE308P]",
    BITE311L: "Human Computer Interaction [BITE311L]",
    BITE312E: "Data Mining [BITE312E]",
    BITE313L: "Computer Graphics [BITE313L]",
    BITE314L: "Multimedia Systems [BITE314L]",
    BITE391J: "Technical Answers to Real Problems Project [BITE391J]",
    BITE392J: "Design Project [BITE392J]",
    BITE394J: "Product Development Project [BITE394J]",
    BITE396J: "Reading Course [BITE396J]",
    BITE397J: "Special Project [BITE397J]",
    BITE398J: "Simulation Project [BITE398J]",
    BITE401L: "Network and Information Security [BITE401L]",
    BITE402L: "Distributed Computing [BITE402L]",
    BITE403L: "Embedded Systems and IoT [BITE403L]",
    BITE403P: "Embedded Systems and IoT Lab [BITE403P]",
    BITE404E: "Object Oriented Analysis and Design [BITE404E]",
    BITE405L: "Soft Computing [BITE405L]",
    BITE406L: "Parallel Computing [BITE406L]",
    BITE407L: "Quantum Computing [BITE407L]",
    BITE408L: "Network Management [BITE408L]",
    BITE409L: "Mobile Application Development [BITE409L]",
    BITE410L: "Machine Learning [BITE410L]",
    BITE411L: "Big Data Analytics [BITE411L]",
    BITE412L: "Cloud Computing [BITE412L]",
    BITE413L: "Cyber Security [BITE413L]",
    BITE414L: "Blockchain Technology [BITE414L]",
    BITE415L: "Engineering Optimization [BITE415L]",

    // Physics courses
    BPHY101L: "Engineering Physics [BPHY101L]",
    BPHY101P: "Engineering Physics Lab [BPHY101P]",
    BPHY201L: "Optics [BPHY201L]",
    BPHY202L: "Classical Mechanics [BPHY202L]",
    BPHY203L: "Quantum Mechanics [BPHY203L]",
    BPHY301E: "Computational Physics [BPHY301E]",
    BPHY401L: "Solid State Physics [BPHY401L]",
    BPHY402L: "Electromagnetic Theory [BPHY402L]",
    BPHY403L: "Atomic and Nuclear Physics [BPHY403L]",
    BPHY404L: "Statistical Mechanics [BPHY404L]",
    IPHY101L: "Engineering Physics [IPHY101L]",

    // Chemistry courses
    BCHY101L: "Engineering Chemistry [BCHY101L]",
    BCHY101P: "Engineering Chemistry Lab [BCHY101P]",
    BCHY102N: "Environmental Sciences [BCHY102N]",
    ICHY101L: "Engineering Chemistry [ICHY101L]",

    // English courses
    BENG101L: "Technical English Communication [BENG101L]",
    BENG101P: "Technical English Communication Lab [BENG101P]",
    BENG101N: "Effective English Communication [BENG101N]",
    BENG102P: "Technical Report Writing [BENG102P]",
    IENG101L: "Technical English Communication [IENG101L]",

    // Electrical and Electronics courses
    BEEE102L: "Basic Electrical and Electronics Engineering [BEEE102L]",
    BEEE102P: "Basic Electrical and Electronics Engineering Lab [BEEE102P]",
    BEEE202L: "Electromagnetic Theory [BEEE202L]",
    BEEE204L: "Signals and Systems [BEEE204L]",
    BEEE206L: "Digital Electronics [BEEE206L]",
    BEEE215L: "DC Machines and Transformers [BEEE215L]",
    BEEE309P: "Microprocessors and Microcontrollers Lab [BEEE309P]",
    IEEE102L: "Basic Electrical and Electronics Engineering [IEEE102L]",
    EEE1024: "Fundamentals of Electrical and Electronics Engineering [EEE1024]",

    // Electronics and Communication courses
    BECE102L: "Digital System Design [BECE102L]",
    BECE201L: "Electronic Materials and Devices [BECE201L]",
    BECE202L: "Signals and Systems [BECE202L]",
    BECE203L: "Circuit Theory [BECE203L]",
    BECE204L: "Microprocessors and Microcontrollers [BECE204L]",
    BECE205L: "Electronic Devices and Circuits [BECE205L]",
    BECE206L: "Analog Circuits [BECE206L]",
    BECE207L: "Random Processes [BECE207L]",
    BECE208E: "Data Structures and Algorithms [ BECE208E]",
    BECE301L: "Digital Signal Processing [BECE301L]",
    BECE302L: "Control Systems [BECE302L]",
    BECE303L: "VLSI System Design [BECE303L]",
    BECE304L: "Analog Communication Systems [BECE304L]",
    BECE305L: "Antenna and Microwave Engineering [BECE305L]",
    BECE306L: "Digital Communication System [BECE306L]",
    BECE309L: "Artificial Intelligence and Machine Learning [BECE309L]",
    BECE310L: "Satellite Communication[BECE310L]",
    BECE312L: "Robotics and Automation [BECE312L]",
    BECE313L: "Information Theory and Coding [BECE313L]",
    BECE317L: "Wireless and Mobile Communications [BECE317L]",
    BECE320E: "Embedded C Programming [BECE320E]",
    BECE355L: "AWS for Cloud Computing [BECE355L]",
    BECE401L: "Computer Communication and Networking [BECE401L]",
    BECE403E: "Embedded Systems Design [BECE403E]",
    BECE406E: "FPGA Based System Design [BECE406E]",
    BECE409E: "Sensors technology [BECE409E]",
    BECE411L: "Cryptography and Network Security [BECE411L]",

    // Electronics and VLSI Design courses
    BEVD101L: "Electronic Materials [BEVD101L]",
    BEVD201L: "Physics of Semiconductor Devices [BEVD201L]",
    BEVD202L: "Electromagnetic Field Theory [BEVD202L]",
    BEVD203L: "Signal Processing [BEVD203L]",
    BEVD204L: "Electronic Circuits [BEVD204L]",
    BEVD207L: "Computer Architecture [BEVD207L]",

    // Biotechnology courses
    BBIT100L: "Biology [BBIT100L]",
    BBIT201L: "Principles of Chemical Engineering [BBIT201L]",
    BBIT202L: "Biochemistry [BBIT202L]",
    BBIT203L: "Microbiology [BBIT203L]",
    BBIT204L: "Cell Biology and Genetics [BBIT204L]",
    BBIT205L: "Bioinformatics [BBIT205L]",
    BBIT209L: "Molecular Biology [BBIT209L]",
    BBIT301L: "Principles of Bioprocess Engineering [BBIT301L]",
    BBIT302L: "Genetic Engineering [BBIT302L]",
    BBIT303L: "Genomics and Proteomics [BBIT303L]",
    BBIT305L: "Immunology [BBIT305L]",
    BBIT307L: "Plant Biotechnology [BBIT307L]",
    BBIT311L: "Biobusiness [BBIT311L]",
    TBIT201L: "Genetics [TBIT201L]",
    TBIT202L: "Microbiology [TBIT202L]",
    TBIT203L: "Genetic Engineering [TBIT203L]",
    TBIT204L: "Food Nutrition and Health [TBIT204L]",
    TBIT205L: "Human Anatomy and Physiology [TBIT205L]",
    TBIT206L: "Fundamentals of Chemical Engineering [TBIT206L]",
    TBIT207L: "Immunology [TBIT207L]",
    TBIT208L: "Industry Standards and Guidelines [TBIT208L]",
    TBIT209L: "Developmental Biology [TBIT209L]",
    TBIT309L: "Medical Biotechnology [TBIT309L]",

    // Chemical Engineering courses
    BCHE202L: "Chemical Engineering Thermodynamics [BCHE202L]",
    BCHE203L: "Chemical Process Calculations [BCHE203L]",
    BCHE204L: "Transport Phenomena[BCHE204L]",
    BCHE205L: "Momentum Transfer [BCHE205L]",
    BCHE206L: "Materials Science and Engineering [BCHE206L]",
    BCHE301L: "Mechanical Operations [BCHE301L]",
    BCHE314L: "Fuels and Combustion [BCHE314L]",

    // Mechanical Engineering courses
    BMEE102P: "Engineering Design Visualisation Lab [BMEE102P]",
    BMEE201L: "Engineering Mechanics [BMEE201L]",
    BMEE202L: "Mechanics of Solids [BMEE202L]",
    BMEE203L: "Engineering Thermodynamics [BMEE203L]",
    BMEE204L: "Fluid Mechanics and Machines [BMEE204L]",
    BMEE207L: "Kinematics and Dynamics of Machines [BMEE207L]",
    BMEE209L: "Materials Science and Engineering [BMEE209L]",
    BMEE210L: "Mechatronics and Measurement Systems [BMEE210L]",
    BMEE212L: "Quality Control and Improvement [BMEE212L]",
    BMEE215L: "Engineering Optimization [BMEE215L]",
    BMEE301L: "Design of Machine Elements [BMEE301L]",
    BMEE302L: "Metal Casting and Welding [BMEE302L]",
    BMEE303L: "Thermal Engineering Systems [BMEE303L]",
    BMEE304L: "Metal Forming and Machining [BMEE304L]",
    BMEE305L: "Manufacturing Planning and Control [BMEE305L]",
    BMEE306L: "Computer Aided Design & Finite Element Analysis [BMEE306L]",
    BMEE308L: "Control System [BMEE308L]",
    BMEE352E: "Product Design Engineering - II [BMEE352E]",
    BMEE355L: "Cloud Computing using Salesforce [BMEE355L]",
    BMEE401L: "Computer Integrated Manufacturing [BMEE401L]",
    BMEE407L: "Artificial Intelligence [BMEE407L]",
    BMEE411L: "Society 5.0 [BMEE411L]",

    // Civil and Environmental Engineering courses
    BCLE212L: "Natural Disaster Mitigation and Management [BCLE212L]",
    BCLE214L: "Global Warming [BCLE214L]",
    BCLE215L: "Waste Management [BCLE215L]",
    BCLE216L: "Water Resource Management [BCLE216L]",

    // Electrical and Computer Systems courses
    BECS403L: "Big Data Analytic Applications to Electrical Systems [BECS403L]",
    BECS403P: "Big Data Analytic Applications to Electrical Systems Lab [BECS403P]",

    // Humanities and Social Sciences courses
    BHUM101N: "Ethics and Values [BHUM101N]",
    BHUM102E: "Indian Classical Music [BHUM102E]",
    BHUM103L: "Micro Economics [BHUM103L]",
    BHUM104L: "Macro Economics [BHUM104L]",
    BHUM105L: "Public Policy and Administration [BHUM105L]",
    BHUM106L: "Principles of Sociology [BHUM106L]",
    BHUM107L: "Sustainability and Society [BHUM107L]",
    BHUM108L: "Urban Community Development [BHUM108L]",
    BHUM109L: "Social Work and Sustainability [BHUM109L]",
    BHUM110: "Cognitive Psychology [BHUM110]",
    BHUM201L: "Mass Communication [BHUM201L]",
    BHUM202L: "Rural Development [BHUM202L]",
    BHUM203L: "Introduction to Psychology [BHUM203L]",
    BHUM204L: "Industrial Psychology [BHUM204L]",
    BHUM205L: "Development Economics [BHUM205L]",
    BHUM206L: "International Economics [BHUM206L]",
    BHUM207L: "Engineering Economics [BHUM207L]",
    BHUM208L: "Economics of Strategy [BHUM208L]",
    BHUM209L: "Game Theory [BHUM209L]",
    BHUM210E: "Econometrics [BHUM210E]",
    BHUM211L: "Behavioral Economics [BHUM211L]",
    BHUM212L: "Mathematics for Economic Analysis [BHUM212L]",
    BHUM213L: "Corporate Social Responsibility [BHUM213L]",
    BHUM214L: "Political Science [BHUM214L]",
    BHUM215L: "International Relations [BHUM215L]",
    BHUM216L: "Indian Culture and Heritage [BHUM216L]",
    BHUM217L: "Contemporary India [BHUM217L]",
    BHUM218L: "Financial Management [BHUM218L]",
    BHUM219L: "Principles of Accounting [BHUM219L]",
    BHUM220L: "Financial Markets and Institutions [BHUM220L]",
    BHUM221L: "Economics of Money, Banking and Financial Markets [BHUM221L]",
    BHUM222L: "Security Analysis and Portfolio Management [BHUM222L]",
    BHUM223L: "Options , Futures and other Derivatives [BHUM223L]",
    BHUM224L: "Fixed Income Securities [BHUM224L]",
    BHUM225L: "Personal Finance [BHUM225L]",
    BHUM226L: "Corporate Finance [BHUM226L]",
    BHUM227L: "Financial Statement Analysis [BHUM227L]",
    BHUM228L: "Cost and Management Accounting [BHUM228L]",
    BHUM229L: "Mind, Embodiment and Technology [BHUM229L]",
    BHUM230L: "Health Humanities in Biotechnological Era [BHUM230L]",
    BHUM231L: "Reproductive Choices for a Sustainable Society [BHUM231L]",
    BHUM232L: "Introduction to Sustainable Aging [BHUM232L]",
    BHUM233L: "Environmental Psychology [BHUM233L]",
    BHUM234L: "Indian Psychology [BHUM234L]",
    BHUM235E: "Psychology of Wellness [BHUM235E]",
    BHUM236L: "Taxation [BHUM236L]",
    HUM1046: "Behavioral Economics [HUM1046]",
    IHUM107L: "Sustainability and Society [IHUM107L]",

    // Management courses
    BMGT101L: "Principles of Management [BMGT101L]",
    BMGT103L: "Organizational Behavior [BMGT103L]",
    BMGT108L: "Entrepreneurship [BMGT108L]",
    BMGT109L: "Introduction to Intellectual Property [BMGT109L]",

    // Health Sciences and Technology courses
    BHST201L: "Artificial Intelligence and Machine Learning in Healthcare [BHST201L]",
    BHST205L: "Applied Human Anatomy and Physiology [BHST205L]",

    // Biomedical courses
    BBMD101L: "Anatomy and Physiology [BBMD101L]",

    // Social Sciences courses
    BSSC101N: "Essence of Traditional Knowledge [BSSC101N]",
    BSSC102N: "Indian Constitution [BSSC102N]",
    USSC101L: "Indian Constitution [USSC101L]",

    // Language courses
    BARB101L: "Arabic [BARB101L]",
    BCHI101L: "Chinese I [BCHI101L]",
    BESP101L: "Spanish I [BESP101L]",
    BFRE101L: "French I [BFRE101L]",
    BGER101L: "German I [BGER101L]",
    BGRE101L: "Modern Greek [BGRE101L]",
    BITL101L: "Italian [BITL101L]",
    BJAP101L: "Japanese I [BJAP101L]",
    BKOR101L: "Basic Korean - Level 1 [BKOR101L]",
    BKOR102L: "Basic Korean - Level 2 [BKOR102L]",

    // Skills Practice courses
    BSTS101P: "Quantitative Skills Practice I [BSTS101P]",
    BSTS102P: "Quantitative Skills Practice II [BSTS102P]",
    BSTS201P: "Qualitative Skills Practice I [BSTS201P]",
    BSTS202P: "Qualitative Skills Practice II [BSTS202P]",
    BSTS301P: "Advanced Competitive Coding - I [BSTS301P]",
    BSTS302P: "Advanced Competitive Coding - II [BSTS302P]",

    // Commerce and Accounting courses
    UCCA131L: "Principles and Practices of Insurance [UCCA131L]",
    UCCA202L: "Corporate Law [UCCA202L]",
    UCCA209L: "Banking Theory and Practice [UCCA209L]",
    UCCA212L: "Strategic Business Leader [UCCA212L]",
    UCCA231L: "Digital Marketing for Financial Services [UCCA231L]",
    UCCA316E: "Stock Market Operations [UCCA316E]",

    // Special courses
    CRY2024: "Introduction to The Art of Hunting Cryptically [CRY2024]",
    MCSE502L: "Design and Analysis of Algorithms [MCSE502L]",

    // CFOC courses (Certificate courses)
    CFOC105M: "Emotional Intelligence [CFOC105M]",
    CFOC119M: "Training of Trainers [CFOC119M]",
    CFOC133M: "E-Business [CFOC133M]",
    CFOC188M: "Ethical Hacking [CFOC188M]",
    CFOC191M: "Forests and their Management [CFOC191M]",
    CFOC203M: "Natural Hazards [CFOC203M]",
    CFOC235M: "Rocket Propulsion [CFOC235M]",
    CFOC384M: "Entrepreneurship Essentials [CFOC384M]",
    CFOC395M: "Speaking Effectively [CFOC395M]",
    CFOC498M: "Business Statistics [CFOC498M]",
    CFOC508M: "Entrepreneurship [CFOC508M]",
    CFOC543M: "International Business [CFOC543M]",
    CFOC570M: "Public Speaking [CFOC570M]",
    CFOC575M: "Wildlife Ecology [CFOC575M]",
    CFOC587M: "Economics of Banking and Finance Markets [CFOC587M]",
    CFOC599M: "Leadership and Team Effectiveness [CFOC599M]",
  }

  // Return the full course name if found, otherwise return the course code
  return courseMap[courseCode.toUpperCase()] || courseCode
}

async function tryBrowserScraping(courseCode: string, examType?: string, year?: string): Promise<ScraperResult> {
  let browser
  try {
    // Simplified Chromium setup - let @sparticuz/chromium handle the paths
    browser = await puppeteer.launch({
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath: await chromium.executablePath(),
      headless: chromium.headless,
    })

    const page = await browser.newPage()
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
    )

    const fullCourseName = findFullCourseName(courseCode)
    const searchUrl = `https://papers.codechefvit.com/catalogue?subject=${encodeURIComponent(fullCourseName)}`
    await page.goto(searchUrl, { waitUntil: "networkidle2", timeout: 15000 })

    // Wait for content to load
    await new Promise((res) => setTimeout(res, 3000))

    const papers = await page.evaluate(
      (courseCode, examType, year) => {
        const paperElements = Array.from(
          document.querySelectorAll(
            'a[href*="/paper/"], .paper-card, .paper-item, [data-testid*="paper"], .card, .grid > div, .paper-link',
          ),
        )

        const results: { 
          title: string; 
          url: string; 
          source: string; 
          metadata: string; 
          examType: string; 
          year: string; 
        }[] = []

        paperElements.forEach((element) => {
          const titleElement = element.querySelector("h3, h2, .title, .paper-title, .card-title")
          const linkElement = element.tagName === "A" ? element : element.querySelector("a")
          const metaElement = element.querySelector(".meta, .details, .paper-meta, .subtitle")

          const title = titleElement?.textContent?.trim() || element.textContent?.trim()
          const href = linkElement?.getAttribute("href")
          const meta = metaElement?.textContent?.trim()

          if (title && href && title.length > 5) {
            const titleLower = title.toLowerCase()
            const courseLower = courseCode.toLowerCase()
            const metaLower = (meta || "").toLowerCase()

            // Course code matching
            const matchesCourse =
              titleLower.includes(courseLower) ||
              titleLower.includes(courseLower.replace(/(\d+)/, " $1")) ||
              titleLower.includes(courseLower.replace(/([a-z]+)(\d+)/, "$1 $2")) ||
              titleLower.includes(courseLower.replace(/([a-z]+)(\d+)([a-z])/, "$1 $2 $3"))

            // Exam type matching - more specific
            const matchesExam =
              !examType ||
              titleLower.includes(examType.toLowerCase()) ||
              metaLower.includes(examType.toLowerCase()) ||
              (examType.toLowerCase() === "cat1" && (titleLower.includes("cat 1") || titleLower.includes("cat-1"))) ||
              (examType.toLowerCase() === "cat2" && (titleLower.includes("cat 2") || titleLower.includes("cat-2"))) ||
              (examType.toLowerCase() === "fat" && titleLower.includes("final"))

            // Year matching
            const matchesYear = !year || titleLower.includes(year) || metaLower.includes(year)

            if (matchesCourse && matchesExam && matchesYear) {
              results.push({
                title: title.substring(0, 100),
                url: href.startsWith("http") ? href : `https://papers.codechefvit.com${href}`,
                source: "papers.codechefvit.com",
                metadata: meta || "",
                examType: examType || "unknown",
                year: year || "unknown",
              })
            }
          }
        })

        return results
      },
      courseCode,
      examType,
      year,
    )

    // Add browser scraping results
    return {
      success: true,
      papers: papers as Paper[], // Convert the evaluated result to Paper[]
      source: "papers.codechefvit.com",
    }
  } catch (error) {
    console.error("Error in browser scraping:", error)
    const errorMessage = error instanceof Error ? error.message : String(error)
    return {
      success: false,
      papers: [],
      error: errorMessage,
      source: "papers.codechefvit.com",
    }
  } finally {
    if (browser) {
      await browser.close()
    }
  }
}
