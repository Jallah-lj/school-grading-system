import { Link, useLocation } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { api, apiUrl } from '../lib/api';
import { useQuery } from '../lib/useQuery';
import type { SchoolPublicInfo } from '../lib/types';

const SECTIONS = {
  terms: {
    title: 'Terms of Service',
    updated: '1 August 2026',
    intro: 'These Terms of Service govern access to and use of the School Grading System. By signing in, you agree to these terms on behalf of yourself and, where applicable, the school that issued your account.',
    blocks: [
      {
        h: '1. Purpose of the platform',
        p: 'The School Grading System is an academic records platform used by schools to manage student enrolment, grade entry, results computation, report cards, transcripts and related analytics. It is provided for legitimate educational administration only.',
      },
      {
        h: '2. Accounts and access',
        p: 'Access is limited to authorised users (administrators, teachers, students and parents) whose accounts are created by the school. You must keep your login credentials confidential, use a strong unique password, and notify an administrator immediately if you suspect unauthorised access. Sharing accounts is not permitted.',
      },
      {
        h: '3. Acceptable use',
        p: 'You agree not to misuse the system — including attempting to access data you are not authorised to see, tampering with grades or audit records, uploading malicious files, reverse-engineering the software, or using the platform for any unlawful purpose. Destructive actions (such as deleting students or teachers) may require step-up password confirmation and are permanently recorded in the audit log.',
      },
      {
        h: '4. Accuracy of academic data',
        p: 'Teachers are responsible for the accuracy of marks they enter. Administrators are responsible for approving, publishing and correcting results according to school policy. Once published, report cards become verifiable via QR code; corrections should follow the school’s established academic appeals process.',
      },
      {
        h: '5. Intellectual property',
        p: 'The School Grading System software, design and documentation remain the property of their respective owners. School-uploaded content (badges, signatures, student data) remains the property of the school. You may not copy, resell or redistribute the platform.',
      },
      {
        h: '6. Availability',
        p: 'We aim for continuous availability but do not guarantee uninterrupted service. Planned maintenance, network outages or force majeure events may temporarily affect access. Schools should keep regular backups of critical academic data.',
      },
      {
        h: '7. Limitation of liability',
        p: 'To the fullest extent permitted by law, the platform operators are not liable for indirect, incidental or consequential damages arising from use of the system, including decisions made on the basis of computed grades, GPA or rankings. Academic decisions remain the responsibility of the school.',
      },
      {
        h: '8. Changes',
        p: 'These terms may be updated periodically. Material changes will be reflected by the “Last updated” date on this page. Continued use after changes constitutes acceptance of the revised terms.',
      },
      {
        h: '9. Contact',
        p: 'Questions about these terms should be directed to your school administrator, who can escalate technical or contractual matters to the platform operators as needed.',
      },
    ],
  },
  privacy: {
    title: 'Privacy Policy',
    updated: '1 August 2026',
    intro: 'This Privacy Policy explains what personal data the School Grading System processes, why it is processed, and the rights of students, parents, teachers and administrators.',
    blocks: [
      {
        h: '1. Who is responsible',
        p: 'Your school is the data controller for student, parent and staff records held in the system. The platform provides the technical infrastructure that processes this data on the school’s instructions.',
      },
      {
        h: '2. Data we process',
        p: 'Depending on your role, the system may store: name, email, phone number, date of birth, gender, admission/staff number, class enrolment, parent/guardian links, assessment marks, computed results (totals, percentages, letter grades, GPA, ranking), report-card remarks, digital signatures, school badge, IP addresses associated with audit events, and login timestamps.',
      },
      {
        h: '3. Why we process it',
        p: 'Data is processed to deliver core educational services: authenticating users, recording and computing grades, generating report cards and transcripts, notifying students and parents of published results, producing analytics for school leadership, and maintaining an audit trail of security-sensitive actions.',
      },
      {
        h: '4. Legal basis',
        p: 'Processing is based on the school’s legitimate educational interests and, where required, contractual necessity or legal obligations related to academic record-keeping. Where consent is required under local law for a specific feature, the school will obtain it separately.',
      },
      {
        h: '5. Who can see your data',
        p: 'Access is role-based. Students and parents see their own (or their children’s) published results. Teachers see classes and subjects they are assigned to. Administrators have broader access needed to run the school. Digital signatures appear only on report cards the signer is responsible for. Public QR verification reveals only the published report-card contents tied to a verification code — not passwords or private contact details.',
      },
      {
        h: '6. Retention',
        p: 'Academic records are retained for as long as the school requires for educational, archival or legal purposes. When a school deletes a student or teacher account, associated login credentials are removed; historical grades may be retained according to school policy. Audit logs of security events are kept to investigate misuse.',
      },
      {
        h: '7. Security measures',
        p: 'Passwords are hashed, sessions use short-lived access tokens with refresh rotation, destructive actions require password re-confirmation, and sensitive operations are written to an immutable audit log. Transport should always use HTTPS in production. No system is perfectly secure — report suspected incidents to your administrator promptly.',
      },
      {
        h: '8. Your rights',
        p: 'Subject to applicable law, you may request access to, correction of, or deletion of your personal data by contacting your school administrator. Students and parents can view published grades and report cards directly in the portal. Some data may be retained where the school has a continuing legal or academic obligation.',
      },
      {
        h: '9. Children',
        p: 'The platform is used in a school context and may process data of minors. Accounts for students are created by the school; parents/guardians may be linked to view published results. Schools are responsible for obtaining any parental notices or consents required by local education and privacy law.',
      },
      {
        h: '10. Changes & contact',
        p: 'This policy may be updated; the “Last updated” date will change accordingly. For privacy requests, contact your school administrator first. Technical privacy questions about the platform can be escalated through the school.',
      },
    ],
  },
} as const;

export default function Legal() {
  const { pathname } = useLocation();
  const kind = pathname.includes('privacy') ? 'privacy' : 'terms';
  const doc = SECTIONS[kind];
  const { data: school } = useQuery(() => api.get<SchoolPublicInfo>('/school/public').then((r) => r.data), []);
  const year = new Date().getFullYear();

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <header className="border-b border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-6 py-4">
          <Link to="/login" className="flex items-center gap-2.5 text-slate-900 dark:text-white">
            {school?.hasBadge
              ? <img src={apiUrl('/school/badge')} alt="" className="h-8 w-8 object-contain" />
              : <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 text-sm font-bold text-white">{(school?.name ?? 'S')[0]}</div>}
            <span className="font-semibold">{school?.name ?? 'School Grading System'}</span>
          </Link>
          <Link to="/login" className="btn-secondary px-3 py-1.5 text-xs">
            <Icon name="arrow-left" size={13} /> Back to sign in
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-10">
        <div className="mb-6 flex gap-2">
          <Link
            to="/terms"
            className={`rounded-full px-3 py-1 text-xs font-semibold transition ${kind === 'terms' ? 'bg-indigo-600 text-white' : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50 dark:bg-slate-900 dark:text-slate-300 dark:ring-slate-700'}`}
          >
            Terms of Service
          </Link>
          <Link
            to="/privacy"
            className={`rounded-full px-3 py-1 text-xs font-semibold transition ${kind === 'privacy' ? 'bg-indigo-600 text-white' : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50 dark:bg-slate-900 dark:text-slate-300 dark:ring-slate-700'}`}
          >
            Privacy Policy
          </Link>
        </div>

        <article className="card p-8 sm:p-10">
          <p className="text-xs font-semibold uppercase tracking-widest text-indigo-500">Legal</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-900 dark:text-white">{doc.title}</h1>
          <p className="mt-2 text-sm text-slate-400">Last updated {doc.updated}</p>
          <p className="mt-6 text-sm leading-relaxed text-slate-600 dark:text-slate-300">{doc.intro}</p>

          <div className="mt-8 space-y-7">
            {doc.blocks.map((b) => (
              <section key={b.h}>
                <h2 className="text-base font-semibold text-slate-900 dark:text-white">{b.h}</h2>
                <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-300">{b.p}</p>
              </section>
            ))}
          </div>
        </article>

        <footer className="mt-8 text-center text-xs text-slate-400">
          © {year} {school?.name ?? 'School Grading System'}. All rights reserved.
          {' · '}
          <Link to="/terms" className="hover:text-indigo-500 hover:underline">Terms</Link>
          {' · '}
          <Link to="/privacy" className="hover:text-indigo-500 hover:underline">Privacy</Link>
        </footer>
      </main>
    </div>
  );
}
