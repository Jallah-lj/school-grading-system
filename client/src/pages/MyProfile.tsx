import { EmptyState } from '../components/ui';
import { useAuth } from '../lib/auth';

import StudentProfile from './StudentProfile';
import TeacherProfile from './TeacherProfile';

/**
 * "My Profile" — a read-only self-view for teachers and students.
 * A teacher/student opens this from the sidebar to see their own profile,
 * assignments and academic history without needing admin access.
 */
export default function MyProfile() {
  const { user } = useAuth();

  if (user?.role === 'TEACHER' && user.teacher?.id) {
    return <TeacherProfile profileId={user.teacher.id} self />;
  }

  if (user?.role === 'STUDENT' && user.student?.id) {
    return <StudentProfile profileId={user.student.id} self />;
  }

  return (
    <EmptyState
      title="No profile"
      hint="Your account is not linked to a teacher or student profile. Contact the school administrator."
      icon="users"
    />
  );
}
