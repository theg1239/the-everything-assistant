import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import SubjectPageClient from './subject-client'

const subjectData: Record<
  string,
  { name: string; fullName: string; description: string; relatedTopics: string[] }
> = {
  // Core Sciences
  mathematics: {
    name: 'Mathematics',
    fullName: 'Engineering Mathematics',
    description: 'Calculus, Linear Algebra, Differential Equations, Numerical Methods',
    relatedTopics: ['Calculus', 'Linear Algebra', 'Differential Equations', 'Probability'],
  },
  physics: {
    name: 'Physics',
    fullName: 'Engineering Physics',
    description: 'Mechanics, Thermodynamics, Optics, Electromagnetics',
    relatedTopics: ['Mechanics', 'Thermodynamics', 'Optics', 'Quantum Physics'],
  },
  chemistry: {
    name: 'Chemistry',
    fullName: 'Engineering Chemistry',
    description: 'Organic, Inorganic, Physical Chemistry, Materials Science',
    relatedTopics: ['Organic Chemistry', 'Inorganic Chemistry', 'Polymers'],
  },
  calculus: {
    name: 'Calculus',
    fullName: 'Calculus for Engineers',
    description: 'Differentiation, Integration, Series, Multivariable Calculus',
    relatedTopics: ['Differentiation', 'Integration', 'Limits', 'Series'],
  },
  'linear-algebra': {
    name: 'Linear Algebra',
    fullName: 'Linear Algebra and Matrix Theory',
    description: 'Matrices, Vectors, Eigenvalues, Linear Transformations',
    relatedTopics: ['Matrices', 'Eigenvalues', 'Transformations', 'Vector Spaces'],
  },
  'probability-statistics': {
    name: 'Probability & Statistics',
    fullName: 'Probability and Statistics',
    description: 'Random Variables, Distributions, Hypothesis Testing',
    relatedTopics: ['Probability', 'Distributions', 'Regression', 'Hypothesis Testing'],
  },
  'discrete-mathematics': {
    name: 'Discrete Mathematics',
    fullName: 'Discrete Mathematics and Graph Theory',
    description: 'Sets, Relations, Graph Theory, Combinatorics',
    relatedTopics: ['Graph Theory', 'Combinatorics', 'Logic', 'Set Theory'],
  },

  // Computer Science Core
  'computer-science': {
    name: 'Computer Science',
    fullName: 'Computer Science & Engineering',
    description: 'Programming, Algorithms, Data Structures, Architecture',
    relatedTopics: ['Programming', 'Algorithms', 'Data Structures'],
  },
  'data-structures': {
    name: 'Data Structures',
    fullName: 'Data Structures and Algorithms',
    description: 'Arrays, Linked Lists, Trees, Graphs, Sorting',
    relatedTopics: ['Arrays', 'Trees', 'Graphs', 'Sorting', 'Hashing'],
  },
  'database-systems': {
    name: 'DBMS',
    fullName: 'Database Management Systems',
    description: 'SQL, ER Diagrams, Normalization, Transactions',
    relatedTopics: ['SQL', 'Normalization', 'Transactions', 'NoSQL'],
  },
  'operating-systems': {
    name: 'Operating Systems',
    fullName: 'Operating Systems',
    description: 'Process Management, Memory, File Systems, Scheduling',
    relatedTopics: ['Process Management', 'Memory Management', 'Scheduling', 'Deadlocks'],
  },
  'computer-networks': {
    name: 'Computer Networks',
    fullName: 'Computer Networks',
    description: 'OSI Model, TCP/IP, Routing, Network Security',
    relatedTopics: ['TCP/IP', 'Routing', 'Network Security', 'Protocols'],
  },
  'computer-architecture': {
    name: 'Computer Architecture',
    fullName: 'Computer Architecture and Organization',
    description: 'CPU Design, Memory Hierarchy, Pipelining, RISC/CISC',
    relatedTopics: ['CPU Design', 'Pipelining', 'Cache', 'Assembly'],
  },
  'theory-of-computation': {
    name: 'Theory of Computation',
    fullName: 'Theory of Computation',
    description: 'Automata, Regular Languages, Context-Free Grammars, Turing Machines',
    relatedTopics: ['Automata', 'Regular Languages', 'CFG', 'Turing Machines'],
  },
  'compiler-design': {
    name: 'Compiler Design',
    fullName: 'Compiler Design',
    description: 'Lexical Analysis, Parsing, Code Generation, Optimization',
    relatedTopics: ['Lexical Analysis', 'Parsing', 'Syntax Analysis', 'Code Generation'],
  },
  'software-engineering': {
    name: 'Software Engineering',
    fullName: 'Software Engineering',
    description: 'SDLC, Agile, Testing, Design Patterns, UML',
    relatedTopics: ['SDLC', 'Agile', 'Testing', 'Design Patterns'],
  },

  // AI/ML
  'machine-learning': {
    name: 'Machine Learning',
    fullName: 'Machine Learning',
    description: 'Supervised, Unsupervised, Neural Networks, Model Evaluation',
    relatedTopics: ['Regression', 'Classification', 'Clustering', 'Neural Networks'],
  },
  'artificial-intelligence': {
    name: 'AI',
    fullName: 'Artificial Intelligence',
    description: 'Search Algorithms, Knowledge Representation, Expert Systems, NLP',
    relatedTopics: ['Search Algorithms', 'NLP', 'Expert Systems', 'Game Theory'],
  },
  'deep-learning': {
    name: 'Deep Learning',
    fullName: 'Deep Learning',
    description: 'CNNs, RNNs, Transformers, GANs, Neural Network Architectures',
    relatedTopics: ['CNN', 'RNN', 'Transformers', 'GANs'],
  },
  'data-mining': {
    name: 'Data Mining',
    fullName: 'Data Mining',
    description: 'Pattern Recognition, Association Rules, Clustering, Classification',
    relatedTopics: ['Clustering', 'Association Rules', 'Pattern Mining', 'Classification'],
  },

  // Electronics
  'digital-electronics': {
    name: 'Digital Electronics',
    fullName: 'Digital Electronics and Logic Design',
    description: 'Boolean Algebra, Logic Gates, Flip-Flops, Sequential Circuits',
    relatedTopics: ['Logic Gates', 'Flip-Flops', 'Counters', 'Boolean Algebra'],
  },
  'microprocessors': {
    name: 'Microprocessors',
    fullName: 'Microprocessors and Microcontrollers',
    description: '8085, 8086, Assembly Programming, Interfacing',
    relatedTopics: ['8085', '8086', 'Assembly', 'Interfacing'],
  },
  'vlsi-design': {
    name: 'VLSI Design',
    fullName: 'VLSI System Design',
    description: 'CMOS, Layout Design, Verilog, FPGA',
    relatedTopics: ['CMOS', 'Verilog', 'FPGA', 'Layout Design'],
  },
  'signals-systems': {
    name: 'Signals & Systems',
    fullName: 'Signals and Systems',
    description: 'Fourier Transform, Laplace Transform, Z-Transform, Filters',
    relatedTopics: ['Fourier Transform', 'Laplace Transform', 'Z-Transform', 'Filters'],
  },
  'embedded-systems': {
    name: 'Embedded Systems',
    fullName: 'Embedded Systems Design',
    description: 'Microcontrollers, RTOS, IoT, Sensor Interfacing',
    relatedTopics: ['Microcontrollers', 'RTOS', 'Arduino', 'Raspberry Pi'],
  },

  // Web & Security
  'web-technologies': {
    name: 'Web Technologies',
    fullName: 'Web Technologies',
    description: 'HTML, CSS, JavaScript, Backend Development, APIs',
    relatedTopics: ['HTML/CSS', 'JavaScript', 'Backend', 'APIs'],
  },
  'information-security': {
    name: 'Information Security',
    fullName: 'Information Security',
    description: 'Security Principles, Risk Management, Access Control',
    relatedTopics: ['Risk Management', 'Access Control', 'Security Policies', 'Auditing'],
  },
  'cryptography': {
    name: 'Cryptography',
    fullName: 'Cryptography and Network Security',
    description: 'Encryption, Hashing, Digital Signatures, PKI',
    relatedTopics: ['Encryption', 'Hashing', 'RSA', 'Digital Signatures'],
  },

  // Other CS
  'cloud-computing': {
    name: 'Cloud Computing',
    fullName: 'Cloud Computing',
    description: 'AWS, Azure, Virtualization, Containers, Serverless',
    relatedTopics: ['AWS', 'Azure', 'Docker', 'Kubernetes'],
  },
  'internet-of-things': {
    name: 'IoT',
    fullName: 'Internet of Things',
    description: 'Sensors, Protocols, Edge Computing, Smart Systems',
    relatedTopics: ['Sensors', 'MQTT', 'Edge Computing', 'Smart Devices'],
  },
  'big-data': {
    name: 'Big Data',
    fullName: 'Big Data Analytics',
    description: 'Hadoop, Spark, MapReduce, Data Pipelines',
    relatedTopics: ['Hadoop', 'Spark', 'MapReduce', 'Data Lakes'],
  },
}

interface SubjectPageProps {
  params: Promise<{ subject: string }>
}

export async function generateMetadata({ params }: SubjectPageProps): Promise<Metadata> {
  const { subject } = await params
  const data = subjectData[subject]

  if (!data) {
    return { title: 'Subject Not Found' }
  }

  return {
    title: `${data.name} Past Papers - VIT FAT, CAT Papers | The Everything Assistant`,
    description: `Download ${data.fullName} past papers for VIT Vellore. FAT, CAT 1, CAT 2, quiz papers for ${data.description.toLowerCase()}.`,
    keywords: [
      `VIT ${data.name} papers`,
      `VIT ${data.name} FAT papers`,
      `VIT ${data.name} CAT papers`,
      ...data.relatedTopics.map(topic => `VIT ${topic} papers`),
    ],
    openGraph: {
      title: `${data.name} Past Papers - VIT FAT, CAT Papers`,
      description: `Download ${data.fullName} past papers for VIT Vellore.`,
      url: `https://everything-assistant.com/features/past-papers/subject/${subject}`,
    },
    alternates: {
      canonical: `https://everything-assistant.com/features/past-papers/subject/${subject}`,
    },
  }
}

export async function generateStaticParams() {
  return Object.keys(subjectData).map(subject => ({ subject }))
}

export default async function SubjectPapersPage({ params }: SubjectPageProps) {
  const { subject } = await params
  const data = subjectData[subject]

  if (!data) {
    notFound()
  }

  return <SubjectPageClient subject={subject} data={data} />
}
