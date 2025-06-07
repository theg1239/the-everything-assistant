"use client"

import { motion } from "framer-motion"
import { Button } from "@/components/ui/button"
import { getRandomQuestions } from "@/lib/question-generator"
import { useEffect, useState } from "react"

interface SuggestedQuestionsProps {
  isFirstMessage: boolean
  onQuestionClick: (question: string) => void
  sidebarOpen?: boolean
}

export function SuggestedQuestions({ isFirstMessage, onQuestionClick, sidebarOpen = false }: SuggestedQuestionsProps) {
  const [questions, setQuestions] = useState<string[]>([])
  
  useEffect(() => {
    setQuestions(getRandomQuestions(6, isFirstMessage))
  }, [isFirstMessage])

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, delay: 0.4, ease: "easeOut" }}
      className={`flex flex-wrap gap-3 justify-center ${sidebarOpen ? 'md:ml-80' : 'max-w-5xl mx-auto'}`}
    >
      {questions.map((question, index) => (
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
