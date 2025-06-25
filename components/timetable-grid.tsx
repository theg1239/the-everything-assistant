import React, { useMemo } from 'react';
import { Course } from '@/lib/ffcs-tool';

export interface TimetableEntry {
    id: string;
    course: Course;
}

interface TimetableSlot {
    start: string;
    end: string;
    days: { [day: string]: string };
    lunch?: boolean;
}

export interface TimetableSchema {
    theory: TimetableSlot[];
    lab: TimetableSlot[];
}

interface TimetableGridProps {
    timetable: TimetableEntry[];
    schema: TimetableSchema;
}

const TimetableGrid: React.FC<TimetableGridProps> = ({ timetable, schema }) => {
    const { days, timeHeaders, slotGridMap, rowCount } = useMemo(() => {
        const allSlots = [...schema.theory, ...schema.lab];

        const dayKeys = [...new Set(allSlots.flatMap(s => s.days ? Object.keys(s.days) : []))];
        const dayOrder = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
        const sortedDayKeys = dayKeys.sort((a, b) => dayOrder.indexOf(a) - dayOrder.indexOf(b));
        const days = sortedDayKeys.map(d => d.charAt(0).toUpperCase() + d.slice(1));

        const timeToMinutes = (timeStr: string) => {
            const [time, period] = timeStr.split(' ');
            let [hours, minutes] = time.split(':').map(Number);
            if (period === 'PM' && hours !== 12) hours += 12;
            if (period === 'AM' && hours === 12) hours = 0;
            return hours * 60 + minutes;
        };

        const timeHeaders = [...new Set(allSlots.filter(s => !s.lunch).map(s => s.start))]
            .sort((a, b) => timeToMinutes(a) - timeToMinutes(b));

        const slotGridMap: { [key: string]: { day: number; start: number; span: number }[] } = {};
        const dayIndexMap = new Map(sortedDayKeys.map((d, i) => [d, i]));
        const timeIndexMap = new Map(timeHeaders.map((t, i) => [t, i]));

        const processSlots = (slots: TimetableSlot[]) => {
            slots.forEach(slotInfo => {
                if (slotInfo.lunch) return;
                const startIdx = timeIndexMap.get(slotInfo.start);
                if (startIdx === undefined) return;

                if (!slotInfo.days) return;
                    for (const [day, slotName] of Object.entries(slotInfo.days)) {
                    const dayIdx = dayIndexMap.get(day);
                    if (dayIdx === undefined) continue;

                    if (!slotGridMap[slotName]) {
                        slotGridMap[slotName] = [];
                    }
                    slotGridMap[slotName].push({ day: dayIdx, start: startIdx, span: 1 });
                }
            });
        };

        processSlots(schema.theory);
        processSlots(schema.lab);

        return { days, timeHeaders, slotGridMap, rowCount: timeHeaders.length };
    }, [schema]);

    const courseColors = [
        'bg-rose-500/80', 'bg-fuchsia-500/80', 'bg-indigo-500/80', 'bg-sky-500/80',
        'bg-teal-500/80', 'bg-amber-500/80', 'bg-orange-500/80', 'bg-lime-500/80'
    ];
    const courseToColorMap = new Map<string, string>();
    let colorIndex = 0;

    const getCourseColor = (courseCode: string) => {
        if (!courseToColorMap.has(courseCode)) {
            courseToColorMap.set(courseCode, courseColors[colorIndex % courseColors.length]);
            colorIndex++;
        }
        return courseToColorMap.get(courseCode);
    };

    const placedSlots = timetable.flatMap(entry => {
        const slots = entry.course.SLOT.split('+');
        const color = getCourseColor(entry.course.CODE);

        return slots.flatMap(slot => {
            const positions = slotGridMap[slot];
            if (!positions) return [];

            return positions.map(pos => ({
                ...pos,
                id: `${entry.id}-${slot}-${pos.day}`,
                course: entry.course,
                color,
            }));
        });
    });

    return (
        <div className="bg-gray-800 p-4 rounded-lg shadow-inner">
            <div
                className="grid relative"
                style={{
                    gridTemplateColumns: `auto repeat(${days.length}, 1fr)`,
                    gridTemplateRows: `auto repeat(${rowCount}, minmax(0, 1fr))`,
                    gap: '1px',
                }}
            >
                <div style={{ gridColumn: 1, gridRow: 1 }} />
                {days.map((day, i) => (
                    <div key={day} className="text-center font-bold text-gray-300 p-2" style={{ gridColumn: i + 2, gridRow: 1 }}>
                        {day}
                    </div>
                ))}

                {timeHeaders.map((time, i) => (
                    <div key={time} className="text-right text-xs text-gray-400 pr-2 pt-1" style={{ gridColumn: 1, gridRow: i + 2 }}>
                        {time.replace(/ (AM|PM)/, '')}
                    </div>
                ))}

                {Array.from({ length: days.length * rowCount }).map((_, i) => (
                    <div key={i} className="bg-gray-900/50" style={{
                        gridColumn: (i % days.length) + 2,
                        gridRow: Math.floor(i / days.length) + 2,
                    }} />
                ))}

                {placedSlots.map(slot => (
                    <div
                        key={slot.id}
                        className={`rounded-lg p-2 text-white flex flex-col justify-center items-center text-center overflow-hidden shadow-lg border border-white/10 ${slot.color}`}
                        style={{
                            gridColumn: slot.day + 2,
                            gridRow: `${slot.start + 2} / span ${slot.span}`,
                        }}
                    >
                        <p className="font-bold text-xs md:text-sm leading-tight">{slot.course.CODE}</p>
                        <p className="text-xs opacity-80 hidden sm:block">{slot.course.TYPE}</p>
                        <p className="text-xs opacity-80 font-mono hidden md:block">{slot.course.SLOT}</p>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default TimetableGrid;
