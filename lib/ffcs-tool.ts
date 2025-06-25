import Papa from 'papaparse';

export interface Course {
    CODE: string;
    TITLE: string;
    TYPE: string;
    CREDITS: string;
    VENUE: string;
    SLOT: string;
    FACULTY: string;
}

export interface FFCSToolData {
    allCourses: Course[];
    uniqueCourses: Course[];
}

/**
 * Fetches and processes FFCS course data for a given campus.
 *
 * This function fetches the raw course data from a publicly accessible CSV file,
 * parses it, and then processes it into two formats:
 * - `allCourses`: The complete list of all available course sections.
 * - `uniqueCourses`: A filtered list of unique courses (by code and title),
 *   suitable for populating a search dropdown.
 *
 * @param campus The campus for which to fetch data ('vellore', 'chennai', or 'ap').
 * @returns A promise that resolves to an object containing both `allCourses` and `uniqueCourses`.
 */
export async function getCourseData(
    campus: 'vellore' | 'chennai' | 'ap',
): Promise<FFCSToolData> {
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL;
    if (!baseUrl) {
        throw new Error('NEXT_PUBLIC_BASE_URL environment variable is not set.');
    }
    const response = await fetch(`${baseUrl}/ffcs/report_${campus}.csv`);
    const csvText = await response.text();

    const parsedData = await new Promise<Papa.ParseResult<Course>>(
        (resolve, reject) => {
            Papa.parse<Course>(csvText, {
                header: true,
                skipEmptyLines: true,
                complete: (results) => resolve(results),
                error: (error: any) => reject(error),
            });
        },
    );

    const allCourses = parsedData.data.filter(
        (course) => course.CODE && course.TITLE,
    );

    const uniqueCourses = allCourses.filter(
        (element, index, self) =>
            self.findIndex(
                (t) => t.CODE === element.CODE && t.TITLE === element.TITLE,
            ) === index,
    );

    return { allCourses, uniqueCourses };
}
