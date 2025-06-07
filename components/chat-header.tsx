"use client"

import { motion } from "framer-motion"

export function ChatHeader() {
  return (
    <motion.div
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: "easeOut" }}
      className="text-center py-6"
    >
      <div className="flex items-center justify-center mb-2">
        <h1 className="text-3xl font-extralight text-white tracking-wider"></h1>
      </div>
    </motion.div>
  )
}
