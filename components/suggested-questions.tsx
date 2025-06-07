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
      className="flex flex-wrap gap-2 justify-center w-full max-w-2xl mx-auto px-4"
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
            className="text-sm font-normal text-muted-foreground bg-background border-border hover:bg-muted hover:text-foreground transition-colors rounded-full px-4 py-2 h-auto"
            onClick={() => onQuestionClick(question)}
          >
            {question}
          </Button>
        </motion.div>
      ))}
    </motion.div>
  )
}
