// Mock data for the McMaster course platform

export interface Course {
  id: string;
  code: string;
  title: string;
  faculty: string;
  subject: string;
  credits: number;
  description: string;
  prerequisites?: string[];
  corequisites?: string[];
  term: string;
  averageRating: number;
  difficulty: number;
  reviewCount: number;
  professors: string[];
  classAverage: number;
}

export const subjectColors: Record<string, { bg: string; text: string; darkBg: string }> = {
  COMPSCI: { bg: "bg-blue-100", text: "text-blue-700", darkBg: "dark:bg-blue-950 dark:text-blue-300" },
  SFWRENG: { bg: "bg-indigo-100", text: "text-indigo-700", darkBg: "dark:bg-indigo-950 dark:text-indigo-300" },
  MATH: { bg: "bg-emerald-100", text: "text-emerald-700", darkBg: "dark:bg-emerald-950 dark:text-emerald-300" },
  STATS: { bg: "bg-teal-100", text: "text-teal-700", darkBg: "dark:bg-teal-950 dark:text-teal-300" },
  ENGINEER: { bg: "bg-orange-100", text: "text-orange-700", darkBg: "dark:bg-orange-950 dark:text-orange-300" },
  BIOLOGY: { bg: "bg-green-100", text: "text-green-700", darkBg: "dark:bg-green-950 dark:text-green-300" },
  PHYSICS: { bg: "bg-violet-100", text: "text-violet-700", darkBg: "dark:bg-violet-950 dark:text-violet-300" },
  CHEM: { bg: "bg-red-100", text: "text-red-700", darkBg: "dark:bg-red-950 dark:text-red-300" },
  ECON: { bg: "bg-amber-100", text: "text-amber-700", darkBg: "dark:bg-amber-950 dark:text-amber-300" },
};

// Palette used for subjects not in the static map above.
// Colors are cycled deterministically based on the subject string so the same
// subject always gets the same color across all pages.
const _colorPalette = [
  { bg: "bg-blue-100",    text: "text-blue-700",    darkBg: "dark:bg-blue-950 dark:text-blue-300" },
  { bg: "bg-indigo-100",  text: "text-indigo-700",  darkBg: "dark:bg-indigo-950 dark:text-indigo-300" },
  { bg: "bg-violet-100",  text: "text-violet-700",  darkBg: "dark:bg-violet-950 dark:text-violet-300" },
  { bg: "bg-purple-100",  text: "text-purple-700",  darkBg: "dark:bg-purple-950 dark:text-purple-300" },
  { bg: "bg-pink-100",    text: "text-pink-700",    darkBg: "dark:bg-pink-950 dark:text-pink-300" },
  { bg: "bg-rose-100",    text: "text-rose-700",    darkBg: "dark:bg-rose-950 dark:text-rose-300" },
  { bg: "bg-red-100",     text: "text-red-700",     darkBg: "dark:bg-red-950 dark:text-red-300" },
  { bg: "bg-orange-100",  text: "text-orange-700",  darkBg: "dark:bg-orange-950 dark:text-orange-300" },
  { bg: "bg-amber-100",   text: "text-amber-700",   darkBg: "dark:bg-amber-950 dark:text-amber-300" },
  { bg: "bg-yellow-100",  text: "text-yellow-700",  darkBg: "dark:bg-yellow-950 dark:text-yellow-300" },
  { bg: "bg-lime-100",    text: "text-lime-700",    darkBg: "dark:bg-lime-950 dark:text-lime-300" },
  { bg: "bg-green-100",   text: "text-green-700",   darkBg: "dark:bg-green-950 dark:text-green-300" },
  { bg: "bg-emerald-100", text: "text-emerald-700", darkBg: "dark:bg-emerald-950 dark:text-emerald-300" },
  { bg: "bg-teal-100",    text: "text-teal-700",    darkBg: "dark:bg-teal-950 dark:text-teal-300" },
  { bg: "bg-cyan-100",    text: "text-cyan-700",    darkBg: "dark:bg-cyan-950 dark:text-cyan-300" },
  { bg: "bg-sky-100",     text: "text-sky-700",     darkBg: "dark:bg-sky-950 dark:text-sky-300" },
];

/** Returns a color object for any subject string — uses the static map when
 *  available, otherwise deterministically picks from the palette by hashing. */
export function getSubjectColor(subject: string): { bg: string; text: string; darkBg: string } {
  if (subjectColors[subject]) return subjectColors[subject];
  // Simple djb2-style hash over the subject characters
  let hash = 5381;
  for (let i = 0; i < subject.length; i++) {
    hash = (hash * 33) ^ subject.charCodeAt(i);
  }
  return _colorPalette[Math.abs(hash) % _colorPalette.length];
}

export interface Professor {
  id: string;
  name: string;
  faculty: string;
  rating: number;
  reviewCount: number;
  courses: string[];
  imageUrl?: string;
}

export interface Review {
  id: string;
  courseId: string;
  professorId?: string;
  userId: string;
  userName: string;
  rating: number;
  difficulty: number;
  comment: string;
  date: string;
  helpful: number;
}

export interface User {
  id: string;
  name: string;
  email: string;
  program: string;
  year: number;
  completedCourses: string[];
  plannedCourses: {
    courseId: string;
    term: string;
    year: number;
  }[];
}

export const courses: Course[] = [
  {
    id: "1",
    code: "COMPSCI 1MD3",
    title: "Introduction to Programming",
    faculty: "Faculty of Engineering",
    subject: "COMPSCI",
    credits: 3,
    description: "This course introduces students to problem solving and programming using an object-oriented language. Topics include basic data types and control structures, functions, arrays, file I/O, objects, and classes.",
    prerequisites: [],
    term: "Fall, Winter, Spring/Summer",
    averageRating: 4.2,
    difficulty: 3.5,
    reviewCount: 156,
    professors: ["1", "2"],
    classAverage: 72,
  },
  {
    id: "2",
    code: "COMPSCI 2C03",
    title: "Data Structures and Algorithms",
    faculty: "Faculty of Engineering",
    subject: "COMPSCI",
    credits: 3,
    description: "This course covers basic data structures and their implementations including arrays, stacks, queues, linked lists, binary trees, and graphs. Analysis of algorithms, searching and sorting algorithms, and introduction to algorithm design techniques.",
    prerequisites: ["COMPSCI 1MD3"],
    term: "Fall, Winter",
    averageRating: 3.8,
    difficulty: 4.2,
    reviewCount: 142,
    professors: ["2", "3"],
    classAverage: 68,
  },
  {
    id: "3",
    code: "COMPSCI 2DB3",
    title: "Databases",
    faculty: "Faculty of Engineering",
    subject: "COMPSCI",
    credits: 3,
    description: "Introduction to database systems and database management. Topics include data models, database design, relational algebra, SQL, normalization, and transaction management.",
    prerequisites: ["COMPSCI 1MD3"],
    term: "Fall, Winter",
    averageRating: 4.0,
    difficulty: 3.8,
    reviewCount: 98,
    professors: ["3"],
    classAverage: 70,
  },
  {
    id: "4",
    code: "COMPSCI 3AC3",
    title: "Algorithms and Complexity",
    faculty: "Faculty of Engineering",
    subject: "COMPSCI",
    credits: 3,
    description: "Advanced study of algorithm design and analysis techniques. Topics include divide and conquer, dynamic programming, greedy algorithms, graph algorithms, and NP-completeness.",
    prerequisites: ["COMPSCI 2C03"],
    term: "Fall",
    averageRating: 3.5,
    difficulty: 4.5,
    reviewCount: 87,
    professors: ["2"],
    classAverage: 65,
  },
  {
    id: "5",
    code: "MATH 1B03",
    title: "Linear Algebra I",
    faculty: "Faculty of Science",
    subject: "MATH",
    credits: 3,
    description: "Systems of linear equations, matrix algebra, determinants, vector geometry, introduction to vector spaces, eigenvalues and eigenvectors, and applications.",
    prerequisites: [],
    term: "Fall, Winter, Spring/Summer",
    averageRating: 3.9,
    difficulty: 3.9,
    reviewCount: 234,
    professors: ["4", "5"],
    classAverage: 69,
  },
  {
    id: "6",
    code: "MATH 1ZC3",
    title: "Engineering Mathematics I",
    faculty: "Faculty of Science",
    subject: "MATH",
    credits: 3,
    description: "Review of high school mathematics, limits and continuity, derivatives, curve sketching, optimization, antiderivatives, definite integrals, and applications.",
    prerequisites: [],
    term: "Fall, Winter",
    averageRating: 4.1,
    difficulty: 3.2,
    reviewCount: 198,
    professors: ["4"],
    classAverage: 73,
  },
  {
    id: "7",
    code: "STATS 2D03",
    title: "Introduction to Probability",
    faculty: "Faculty of Science",
    subject: "STATS",
    credits: 3,
    description: "Sample spaces, probability axioms, conditional probability, independence, random variables, expectation, variance, moment generating functions, and limit theorems.",
    prerequisites: ["MATH 1ZC3"],
    term: "Fall, Winter",
    averageRating: 3.6,
    difficulty: 4.0,
    reviewCount: 112,
    professors: ["5"],
    classAverage: 67,
  },
  {
    id: "8",
    code: "ENGINEER 1D04",
    title: "Introduction to Engineering Practice",
    faculty: "Faculty of Engineering",
    subject: "ENGINEER",
    credits: 4,
    description: "Introduction to engineering design, teamwork, communication, and professional practice. Students work in teams on design projects.",
    prerequisites: [],
    term: "Fall, Winter",
    averageRating: 4.3,
    difficulty: 2.5,
    reviewCount: 267,
    professors: ["6"],
    classAverage: 78,
  },
  {
    id: "9",
    code: "COMPSCI 3SD3",
    title: "Concurrent Systems",
    faculty: "Faculty of Engineering",
    subject: "COMPSCI",
    credits: 3,
    description: "Introduction to concurrent programming and systems. Topics include processes and threads, synchronization, deadlock, concurrent data structures, and parallel algorithms.",
    prerequisites: ["COMPSCI 2C03"],
    term: "Winter",
    averageRating: 3.7,
    difficulty: 4.3,
    reviewCount: 76,
    professors: ["1"],
    classAverage: 66,
  },
  {
    id: "10",
    code: "COMPSCI 4TB3",
    title: "Syntax-Based Tools and Compilers",
    faculty: "Faculty of Engineering",
    subject: "COMPSCI",
    credits: 3,
    description: "Formal languages, grammars, parsing techniques, lexical analysis, semantic analysis, code generation, and optimization.",
    prerequisites: ["COMPSCI 2C03"],
    term: "Fall",
    averageRating: 3.9,
    difficulty: 4.4,
    reviewCount: 54,
    professors: ["3"],
    classAverage: 71,
  },
];

export const professors: Professor[] = [
  {
    id: "1",
    name: "Dr. Sarah Johnson",
    faculty: "Faculty of Engineering",
    rating: 4.5,
    reviewCount: 89,
    courses: ["1", "9"],
  },
  {
    id: "2",
    name: "Dr. Michael Chen",
    faculty: "Faculty of Engineering",
    rating: 4.1,
    reviewCount: 124,
    courses: ["1", "2", "4"],
  },
  {
    id: "3",
    name: "Dr. Emily Rodriguez",
    faculty: "Faculty of Engineering",
    rating: 4.3,
    reviewCount: 78,
    courses: ["2", "3", "10"],
  },
  {
    id: "4",
    name: "Dr. James Patterson",
    faculty: "Faculty of Science",
    rating: 3.9,
    reviewCount: 156,
    courses: ["5", "6"],
  },
  {
    id: "5",
    name: "Dr. Amanda Liu",
    faculty: "Faculty of Science",
    rating: 4.2,
    reviewCount: 92,
    courses: ["5", "7"],
  },
  {
    id: "6",
    name: "Dr. Robert Williams",
    faculty: "Faculty of Engineering",
    rating: 4.6,
    reviewCount: 201,
    courses: ["8"],
  },
];

export const reviews: Review[] = [
  {
    id: "1",
    courseId: "1",
    professorId: "1",
    userId: "user1",
    userName: "John D.",
    rating: 5,
    difficulty: 3,
    comment: "Great introduction to programming! Dr. Johnson explains concepts clearly and the assignments are challenging but fair.",
    date: "2026-01-15",
    helpful: 23,
  },
  {
    id: "2",
    courseId: "1",
    professorId: "2",
    userId: "user2",
    userName: "Maria S.",
    rating: 4,
    difficulty: 4,
    comment: "Good course overall. Dr. Chen is knowledgeable but goes through material quickly. Make sure to keep up with lectures.",
    date: "2026-01-10",
    helpful: 15,
  },
  {
    id: "3",
    courseId: "2",
    professorId: "2",
    userId: "user3",
    userName: "Alex K.",
    rating: 3,
    difficulty: 5,
    comment: "Very challenging course. The content is interesting but the workload is heavy. Start assignments early!",
    date: "2025-12-20",
    helpful: 31,
  },
];

export const mockUser: User = {
  id: "user1",
  name: "John Doe",
  email: "john.doe@mcmaster.ca",
  program: "Computer Science",
  year: 2,
  completedCourses: ["1", "5", "6", "8"],
  plannedCourses: [
    { courseId: "2", term: "Fall", year: 2026 },
    { courseId: "3", term: "Fall", year: 2026 },
    { courseId: "7", term: "Winter", year: 2027 },
  ],
};

// Helper functions
export function getCourseById(id: string): Course | undefined {
  return courses.find(course => course.id === id);
}

export function getCourseByCode(code: string): Course | undefined {
  return courses.find(course => course.code === code);
}

export function getProfessorById(id: string): Professor | undefined {
  return professors.find(prof => prof.id === id);
}

export function getReviewsByCourseId(courseId: string): Review[] {
  return reviews.filter(review => review.courseId === courseId);
}

export function getReviewsByProfessorId(professorId: string): Review[] {
  return reviews.filter(review => review.professorId === professorId);
}

export const featuredCourses = courses.slice(0, 3);
export const trendingCourses = courses.slice(3, 6);
