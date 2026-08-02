import cors from 'cors';
import express from 'express';
import helmet from 'helmet';

import { env } from './config/env';
import { errorHandler, notFoundHandler } from './middleware/error';
import { apiLimiter, authLimiter } from './middleware/rateLimit';
import { academicYearsRouter } from './routes/academicYears';
import { adminRouter } from './routes/admin';
import { analyticsRouter } from './routes/analytics';
import { authRouter } from './routes/auth';
import { classesRouter } from './routes/classes';
import { gradesRouter } from './routes/grades';
import { gradeScalesRouter } from './routes/gradeScales';
import { notificationsRouter } from './routes/notifications';
import { parentsRouter } from './routes/parents';
import { reportCardsRouter } from './routes/reportCards';
import { reportsRouter } from './routes/reports';
import { schoolRouter } from './routes/school';
import { signaturesRouter } from './routes/signatures';
import { studentsRouter } from './routes/students';
import { subjectsRouter } from './routes/subjects';
import { teachersRouter } from './routes/teachers';
import { usersRouter } from './routes/users';

export function createApp() {
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use(helmet());
  app.use(cors({ origin: env.CLIENT_ORIGINS, credentials: true }));
  app.use(express.json({ limit: '2mb' }));

  app.use('/api', apiLimiter);
  app.get('/api/health', (_req, res) =>
    res.json({ status: 'ok', service: 'school-grading-api', time: new Date().toISOString() }),
  );

  // Friendly index for anyone who opens the API root in a browser.
  app.get('/api', (_req, res) => {
    res.json({
      service: ' School Grading System API',
      status: 'ok',
      hint: 'The web app runs on the Vite dev server (http://localhost:5173 in dev). This URL is the REST API — call it from the frontend or an API client.',
      health: '/api/health',
      documentation: 'docs/API.md',
      endpoints: {
        auth: 'POST /api/auth/login · POST /api/auth/refresh · GET /api/auth/me',
        students: '/api/students',
        teachers: '/api/teachers',
        parents: '/api/parents',
        subjects: '/api/subjects',
        classes: '/api/classes',
        academicYears: '/api/academic-years',
        gradeScales: '/api/grade-scales',
        grades: '/api/grades',
        analytics: '/api/analytics',
        reportCards: '/api/report-cards',
        notifications: '/api/notifications',
        reports: '/api/reports',
        admin: '/api/admin',
      },
    });
  });

  app.use('/api/auth', authLimiter, authRouter);
  app.use('/api/users', usersRouter);
  app.use('/api/students', studentsRouter);
  app.use('/api/teachers', teachersRouter);
  app.use('/api/parents', parentsRouter);
  app.use('/api/subjects', subjectsRouter);
  app.use('/api/classes', classesRouter);
  app.use('/api/academic-years', academicYearsRouter);
  app.use('/api/grade-scales', gradeScalesRouter);
  app.use('/api/grades', gradesRouter);
  app.use('/api/analytics', analyticsRouter);
  app.use('/api/report-cards', reportCardsRouter);
  app.use('/api/notifications', notificationsRouter);
  app.use('/api/reports', reportsRouter);
  app.use('/api/signatures', signaturesRouter);
  app.use('/api/school', schoolRouter);
  app.use('/api/admin', adminRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
