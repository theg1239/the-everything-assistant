'use client'

import { motion } from 'framer-motion'
import { memo, useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'

const getTimeOfDayGreeting = () => {
  const hour = new Date().getHours();
  const now = new Date();
  const dayOfWeek = now.getDay();
  const season = getSeason();

  const seasonalGreetings = {
    spring: ['spring in your step', 'fresh beginnings'],
    summer: ['sunny vibes', 'summer breeze'],
    autumn: ['cozy season', 'autumn leaves'],
    winter: ['winter wonderland', 'stay warm'],
  };

  if (hour >= 5 && hour < 12) {
    const morningGreetings = [
      'hey',
      'rise and grind',
      'wakey wakey',
      'good morning',
      'early bird',
      'bright and early',
      'dawn patrol',
      "sun's up",
      'coffee time',
      'morning magic',
      'breakfast time',
      'sunrise vibes',
      'fresh start',
      "let's go",
      'new day energy',
      'morning champion',
      hour < 7 ? 'wow, early riser' : 'perfect timing',
      dayOfWeek === 1 ? 'monday warrior' : 'morning superstar',
      ...seasonalGreetings[season],
    ];
    return morningGreetings[Math.floor(Math.random() * morningGreetings.length)];
  } else if (hour >= 12 && hour < 17) {
    const afternoonGreetings = [
      'hey',
      'good afternoon',
      'midday magic',
      'lunch break',
      'sunny vibes',
      'peak mode',
      'post-lunch energy',
      'afternoon excellence',
      'halfway there',
      'sunshine time',
      'afternoon adventure',
      'crushing it',
      'siesta time',
      'energy surge',
      'prime time',
      'golden hours',
      hour === 12 ? "lunch o'clock" : 'afternoon momentum',
      dayOfWeek >= 1 && dayOfWeek <= 5 ? 'weekday warrior' : 'weekend bliss',
      ...seasonalGreetings[season],
    ];
    return afternoonGreetings[Math.floor(Math.random() * afternoonGreetings.length)];
  } else if (hour >= 17 && hour < 22) {
    const eveningGreetings = [
      'hey',
      'golden hour',
      'winding down',
      'sunset vibes',
      'evening mode',
      'dinner time',
      'twilight hours',
      'end of day',
      'relaxation time',
      'evening adventure',
      'prime time',
      'after work',
      'golden vibes',
      'evening energy',
      'night is young',
      'twilight magic',
      hour >= 19 ? 'late evening' : 'early evening',
      dayOfWeek === 5 ? 'friday freedom' : 'evening momentum',
      ...seasonalGreetings[season],
    ];
    return eveningGreetings[Math.floor(Math.random() * eveningGreetings.length)];
  } else {
    if (dayOfWeek === 5 || dayOfWeek === 6) {
      const weekendNightGreetings = [
        'hey',
        'weekend warrior',
        'party mode',
        'friday night',
        'weekend vibes',
        'night life',
        'midnight magic',
        'weekend energy',
        'living it up',
        'freedom feels',
        'saturday night',
        'weekend mode',
        'night owl hours',
      ];
      return weekendNightGreetings[Math.floor(Math.random() * weekendNightGreetings.length)];
    }

    const nightGreetings = [
      'hey',
      'night owl',
      'midnight warrior',
      'burning midnight oil',
      'late night legend',
      'vampire hours',
      'moon child',
      'nocturnal genius',
      'after hours',
      'team no sleep',
      'night shift',
      'darkness mode',
      'midnight productivity',
      'insomniac life',
      'night time',
      'owl hours',
      hour >= 2 && hour < 5 ? 'seriously, sleep maybe' : 'night excellence',
      hour >= 3 ? 'dedication level: max' : 'night owl extraordinaire',
    ];
    return nightGreetings[Math.floor(Math.random() * nightGreetings.length)];
  }
};

const PureChatHeader = () => {
  const { data: session } = useSession()
  const [greeting, setGreeting] = useState('')
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth <= 768)
    }

    checkMobile()
    window.addEventListener('resize', checkMobile)

    return () => {
      window.removeEventListener('resize', checkMobile)
    }
  }, [])

  useEffect(() => {
    setGreeting(getTimeOfDayGreeting())

    const interval = setInterval(() => {
      setGreeting(getTimeOfDayGreeting())
    }, 60000)

    return () => clearInterval(interval)
  }, [])

  const firstName = session?.user?.name?.split(' ')[0]?.toLowerCase()

  const shouldShowName = firstName && (!isMobile || greeting === 'hey')

  const formatGreeting = () => {
    if (!shouldShowName) return `${greeting}!`
    if (greeting === 'hey') return `${greeting} ${firstName}!`
    return `${greeting}, ${firstName}!`
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: 'easeOut' }}
      className="sticky top-0 z-50 w-full"
    >
      <div className="flex flex-col items-center justify-center h-[8.5rem] px-4">
        <h1 className="text-4xl md:text-5xl font-light tracking-tight mb-2">{formatGreeting()}</h1>
        {/* <p className="text-sm text-muted-foreground text-center max-w-[40rem] leading-normal">
          comprehensive knowledge base for vit vellore - courses, exams, mess details...anything!
        </p> */}
      </div>
    </motion.div>
  )
}

export const ChatHeader = memo(PureChatHeader)
