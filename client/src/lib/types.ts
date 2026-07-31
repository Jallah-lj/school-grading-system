export type Role = 'ADMIN' | 'TEACHER' | 'STUDENT' | 'PARENT';
export type GradeStatus = 'EMPTY' | 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'PUBLISHED';

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  phone?: string | null;
  isActive: boolean;
  student?: { id: string; admissionNumber: string; photoUrl?: string | null; classRoom?: { id: string; name: string; stream: string } | null };
  teacher?: { id: string; staffNumber: string };
  parent?: {
    id: string;
    children: { id: string; admissionNumber: string; user: { name: string }; classRoom?: { name: string; stream: string } | null }[];
  };
}

export interface Semester {
  id: string; name: string; number: number; kind: string;
  startDate: string; endDate: string; isCurrent: boolean; academicYearId: string;
}

export interface AcademicYear {
  id: string; name: string; startDate: string; endDate: string; isActive: boolean;
  semesters: Semester[];
  _count?: { classes: number };
}

export interface ClassRoom {
  id: string; name: string; level: number; stream: string; academicYearId: string;
  academicYear?: { id: string; name: string };
  homeroomTeacher?: { id: string; user: { name: string } } | null;
  _count?: { students: number; assignments: number };
}

export interface AssessmentComponent {
  id: string; type: string; name: string; weight: number; maxScore: number;
}

export interface Subject {
  id: string; code: string; name: string; creditUnits: number;
  department?: string | null; description?: string | null;
  components?: AssessmentComponent[];
  _count?: { assignments: number; subjectResults: number };
}

export interface StudentRow {
  id: string; admissionNumber: string; dateOfBirth: string; gender: string; photoUrl?: string | null;
  user: { id: string; name: string; email: string; isActive: boolean };
  classRoom?: { id: string; name: string; stream: string } | null;
  parent?: { id: string; user: { name: string; email: string; phone?: string | null } } | null;
}

export interface TeacherRow {
  id: string; staffNumber: string; qualification?: string | null;
  user: { id: string; name: string; email: string; isActive: boolean; phone?: string | null };
  assignments: {
    id?: string;
    subject: { id: string; code: string; name: string };
    classRoom: { id: string; name: string; stream: string; _count?: { students: number } };
  }[];
}

export interface GradeBand {
  id?: string; minScore: number; maxScore: number; letter: string; gradePoint: number; remark: string;
}

export interface GradeScale {
  id: string; name: string; isActive: boolean; bands: GradeBand[];
}

export interface GradeGrid {
  students: { id: string; name: string; admissionNumber: string }[];
  components: AssessmentComponent[];
  entries: Record<string, Record<string, { score: number; status: string }>>;
  status: GradeStatus;
  editable: boolean;
}

export interface SubjectResultRow {
  id: string; totalScore: number; percentage: number; letterGrade: string;
  gradePoint: number; remark: string; position: number | null; isPublished: boolean;
  subject: { code: string; name: string; creditUnits: number };
}

export interface GpaRecordRow {
  gpa: number; totalCredits: number; totalPoints: number; average: number;
  position: number | null; classSize: number | null;
}

export interface StudentResultsResponse {
  semester: Semester & { academicYear?: AcademicYear };
  results: SubjectResultRow[];
  gpa: GpaRecordRow | null;
}

export interface DashboardStats {
  activeSemester: (Semester & { academicYear: AcademicYear }) | null;
  counts: { students: number; teachers: number; classes: number; subjects: number };
  averagePerformance: number | null;
  pendingSubmissions: number;
  distribution: { letter: string; count: number }[];
  topStudents: { studentId: string; name: string; className: string; gpa: number; average: number; position: number | null }[];
  bottomStudents: { studentId: string; name: string; className: string; gpa: number; average: number; position: number | null }[];
  recentResults: { id: string; student: string; subject: string; percentage: number; letterGrade: string; computedAt: string }[];
  gpaTrend: { semester: string; year: string; average: number }[];
}

export interface ReportCardListItem {
  id: string; status: string; verificationCode: string;
  teacherRemarks?: string | null; principalRemarks?: string | null;
  publishedAt?: string | null;
  student: { id: string; name: string; admissionNumber: string; className: string };
  semesterName: string; gpa: number | null; position: number | null;
}

export interface SignatureSlot { name: string; title: string; dataUrl: string | null; }

export interface SchoolPublicInfo { name: string; motto: string; hasBadge: boolean; }

export interface SchoolSettings extends SchoolPublicInfo { studentIdPrefix: string; updatedAt?: string; }

export interface ReportCardDetail {
  school: SchoolPublicInfo;
  signatures?: { classTeacher: SignatureSlot | null; principal: SignatureSlot | null };
  verificationCode: string; status: string;
  teacherRemarks: string | null; principalRemarks: string | null; publishedAt: string | null;
  student: { name: string; admissionNumber: string; className: string };
  semester: { name: string; academicYear: string };
  results: { code: string; name: string; percentage: number; letterGrade: string; gradePoint: number; remark: string; position: number | null }[];
  gpa: { gpa: number; average: number; position: number | null; classSize: number | null; totalCredits: number } | null;
  qr?: string;
}

export interface AppNotification {
  id: string; type: string; title: string; message: string; link?: string | null; isRead: boolean; createdAt: string;
}

export interface PendingApproval {
  classId: string; className: string; stream: string;
  subjectId: string; subjectName: string; subjectCode: string;
  semesterId: string; semesterName: string; academicYearName: string;
  marks: number; students: number; teachers: string[]; submittedAt: string | null;
}

export interface AuditLogRow {
  id: string; action: string; entity: string; entityId: string | null;
  metadata: unknown; ipAddress: string | null; createdAt: string;
  user: { name: string; email: string; role: Role } | null;
}

export interface ImportRowError { row: number; email: string; reason: string; }
export interface ImportCredential { name: string; email: string; password: string; }
export interface ImportResult {
  created: number; failed: number; file?: string;
  errors: ImportRowError[]; credentials: ImportCredential[];
}

export interface MarksImportError { row: number; admissionNumber: string; component: string; reason: string; }
export interface MarksImportResult {
  applied: number; skipped: number; failed: number; recomputed?: boolean;
  errors: MarksImportError[]; file?: string;
}

export interface Paged<T> { data: T[]; total: number; page: number; pageSize: number; }

export interface ManagedUser {
  id: string; email: string; name: string; role: Role; phone?: string | null;
  isActive: boolean; lastLoginAt?: string | null; createdAt: string;
  signature?: { id: string } | null;
}
