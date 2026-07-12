// Tipe data mengikuti docs/schema.sql
export type RoleName = 'admin' | 'guru' | 'ketua';
export type Semester = 'ganjil' | 'genap';
export type StudentStatus = 'aktif' | 'nonaktif';
export type AttendanceStatus = 'hadir' | 'izin' | 'sakit' | 'alpa';

export interface Role {
  id: string;
  name: RoleName;
}

export interface Profile {
  id: string;
  role_id: string;
  full_name: string;
  phone: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  roles?: Role | null; // hasil join roles(name)
}

export interface AcademicTerm {
  id: string;
  year_label: string;
  semester: Semester;
  start_date: string | null;
  end_date: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface School {
  id: string;
  name: string;
  address: string | null;
  contact_person: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Class {
  id: string;
  school_id: string;
  name: string;
  grade_level: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  schools?: School | null;
}

export interface TeacherAssignment {
  id: string;
  teacher_id: string;
  school_id: string;
  class_id: string;
  term_id: string;
  is_active: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
  profiles?: Profile | null;
  schools?: School | null;
  classes?: Class | null;
  academic_terms?: AcademicTerm | null;
}

export interface Student {
  id: string;
  full_name: string;
  nis: string | null;
  gender: string | null;
  status: StudentStatus;
  created_at: string;
  updated_at: string;
}

export interface Enrollment {
  id: string;
  student_id: string;
  class_id: string;
  term_id: string;
  start_date: string;
  end_date: string | null;
  is_active: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
  students?: Student | null;
  classes?: Class | null;
  academic_terms?: AcademicTerm | null;
}

export interface Meeting {
  id: string;
  school_id: string;
  class_id: string;
  term_id: string;
  scheduled_teacher_id: string | null;
  actual_teacher_id: string;
  meeting_date: string;
  meeting_number: number | null;
  material: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  schools?: School | null;
  classes?: Class | null;
  academic_terms?: AcademicTerm | null;
  scheduled_teacher?: Profile | null;
  actual_teacher?: Profile | null;
  meeting_photos?: MeetingPhoto[];
}

export interface MeetingPhoto {
  id: string;
  meeting_id: string;
  file_path: string;
  sort_order: number;
  uploaded_at: string;
}

export interface Attendance {
  id: string;
  meeting_id: string;
  student_id: string;
  student_name_snapshot: string;
  status: AttendanceStatus;
  remarks: string | null;
  created_at: string;
  updated_at: string;
}

export interface ExportLog {
  id: string;
  period: string;
  sheet_url: string | null;
  status: string;
  exported_by: string | null;
  exported_at: string;
  notes: string | null;
}

export const ATTENDANCE_STATUSES: AttendanceStatus[] = ['hadir', 'izin', 'sakit', 'alpa'];

export const STORAGE_BUCKET = 'meeting-documentation';
