"use client"

import { motion } from "framer-motion"
import { Button } from "@/components/ui/button"

interface SuggestedQuestionsProps {
  isFirstMessage: boolean
  onQuestionClick: (question: string) => void
}

export function SuggestedQuestions({ isFirstMessage, onQuestionClick }: SuggestedQuestionsProps) {
  const initialQuestions = isFirstMessage
    ? [
        "what are the admission requirements?",
        "tell me about vit's placement statistics",
        "how does the ffcs system work?",
        "what research opportunities are available?",
        "explain the grading system",
        "what are the hostel facilities?",
      ]
    : [
        "show me faculty information",
        "what are the fee structures?",
        "find internship opportunities",
        "explain the semester structure",
        "what are the library facilities?",
      ]

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, delay: 0.4, ease: "easeOut" }}
      className="flex flex-wrap gap-3 justify-center max-w-5xl mx-auto"
    >
      {initialQuestions.map((question, index) => (
        <motion.div
          key={question}
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.3, delay: 0.1 * index }}
        >
          <Button
            variant="outline"
            size="sm"
            className="bg-slate-800/20 backdrop-blur-xl border-slate-700/40 text-slate-300 hover:bg-slate-700/40 hover:text-white hover:border-slate-600 transition-all duration-200 rounded-2xl px-5 py-3 text-sm font-normal"
            onClick={() => onQuestionClick(question)}
          >
            {question}
          </Button>
        </motion.div>
      ))}
    </motion.div>
  )
}
