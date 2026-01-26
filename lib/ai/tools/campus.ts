import { tool } from 'ai'
import * as z from 'zod/v3';

export function campusTools() {
  const getCampusInfo = tool({
    description: `Get information about VIT-Vellore campus blocks (SJT, TT, SMV, MB, etc.).
Use it to answer: “where is TT?”, “what is GDN used for?”, “which departments sit in Gandhi Block?”.
The tool returns a concise description, typical usage, and a quick location cue.`,
    inputSchema: z.object({
      block: z.string().describe('Block / building code: e.g. SJT, TT, SMV, MB'),
    }),
    execute: async ({ block }) => {
      const maps = (q: string) =>
        `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${q} VIT Vellore`)}`

      const info = {
        sjt: {
          name: 'SJT (Silver Jubilee Tower)',
          description: "13-storey landmark built for VIT's silver jubilee, filled with high-end computing labs and project spaces.",
          usage: 'Senior-year Computer Science (SCSE/SITE) lectures, research labs, Exam Cell and the busy SJT food court.',
          location: 'Along Jimmy Carter Road, just east of Technology Tower, near to the SJT Foodys and a little food court, also has Dominos',
          note: 'Top floors give an unbeatable panoramic view of the campus.',
          mapsUrl: maps('SJT'),
        },
        tt: {
          name: 'Technology Tower (TT)',
          description: 'Nine-floor tower built for tech-heavy departments; houses CS/IT labs and classrooms.',
          usage: 'SITE/SCSE classes, coding labs, and many morning hours are spent here.',
          location: 'Beside SJT on Jimmy Carter Road, opposite the playground.',
          note: 'The elevators get crowded before 9am—plan to walk if you can.',
          mapsUrl: maps('Technology Tower VIT'),
        },
        smv: {
          name: 'SMV (M Block)',
          description: 'Main academic block for first-year foundation courses and core engineering labs.',
          usage: 'Freshman lectures, labs, and common service courses.',
          location: 'Central academic axis, close to the main food court (Foodys).',
          note: 'Expect heavy footfall between class changes.',
          mapsUrl: maps('SMV VIT'),
        },
        mb: {
          name: 'Main Building (MB)',
          description: 'Administrative heart of VIT with offices, admission desks, and meeting halls.',
          usage: 'Admin visits, payments, certificates, official paperwork.',
          location: 'Near the main entrance; faces the central lawn.',
          note: 'Carry your ID; some counters require it.',
          mapsUrl: maps('Main Building VIT'),
        },
        gdn: {
          name: 'Gandhi Block (GDN)',
          description: 'Classic classroom block with wide verandas and greenery around.',
          usage: 'Lectures for several engineering departments, tutorial rooms.',
          location: 'South of the main campus spine, close to the playground.',
          note: 'Good cross-breeze; classrooms can still be warm in afternoons.',
          mapsUrl: maps('Gandhi Block VIT'),
        },
      } as Record<string, any>

      const key = block.toLowerCase().trim()
      const match = info[key as keyof typeof info]
      if (!match) {
        return {
          success: false,
          message: `No campus info found for block "${block}". Try codes like SJT, TT, SMV, MB, GDN.`,
        }
      }

      return {
        success: true,
        block: key.toUpperCase(),
        ...match,
        message: `${match.name}: ${match.description}`,
      }
    },
  })

  return { getCampusInfo }
}

export type CampusTools = ReturnType<typeof campusTools>

