/**
 * OpenAPI 3.0.3 specification for the School Grading System API.
 *
 * The spec is built programmatically so we can share schema fragments,
 * keep tags / descriptions in one place, and attach request / response
 * examples without duplicating JSON across dozens of route definitions.
 */

import { env } from '../config/env';

// ─── Shared schema fragments ──────────────────────────────────────────────────

const securitySchemes = {
  bearerAuth: {
    type: 'http' as const,
    scheme: 'bearer',
    bearerFormat: 'JWT',
    description:
      'Access token obtained from `POST /api/auth/login`. Send as `Authorization: Bearer <token>`.',
  },
};

const errorSchema = {
  type: 'object',
  properties: {
    error: {
      type: 'object',
      properties: {
        code: { type: 'string', example: 'BAD_REQUEST' },
        message: { type: 'string', example: 'Validation failed' },
        details: {},
      },
      required: ['code', 'message'],
    },
  },
  required: ['error'],
} as const;

const paginationMeta = {
  type: 'object',
  properties: {
    page: { type: 'integer', example: 1 },
    pageSize: { type: 'integer', example: 10 },
    total: { type: 'integer', example: 42 },
  },
} as const;

const userSchema = {
  type: 'object',
  properties: {
    id: { type: 'string', example: 'clx1abc2def3g' },
    email: { type: 'string', format: 'email', example: 'j.k@school.rw' },
    name: { type: 'string', example: 'Jean Kwizera' },
    role: { type: 'string', enum: ['ADMIN', 'TEACHER', 'STUDENT', 'PARENT'] },
    phone: { type: 'string', nullable: true, example: '+250780000000' },
    isActive: { type: 'boolean', example: true },
    lastLoginAt: { type: 'string', format: 'date-time', nullable: true },
    createdAt: { type: 'string', format: 'date-time' },
  },
  required: ['id', 'email', 'name', 'role', 'isActive', 'createdAt'],
} as const;

const studentProfileSchema = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    admissionNumber: { type: 'string', example: 'SGS-2024-0001' },
    dateOfBirth: { type: 'string', format: 'date' },
    gender: { type: 'string', enum: ['MALE', 'FEMALE', 'OTHER'] },
    photoUrl: { type: 'string', nullable: true },
    classRoom: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        name: { type: 'string', example: 'S5' },
        stream: { type: 'string', example: 'A' },
      },
    },
  },
} as const;

const teacherProfileSchema = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    staffNumber: { type: 'string', example: 'SGS-STF-001' },
    qualification: { type: 'string', nullable: true },
    photoUrl: { type: 'string', nullable: true },
  },
} as const;

const sessionUserSchema = {
  type: 'object',
  allOf: [
    { $ref: '#/components/schemas/User' },
    {
      type: 'object',
      properties: {
        student: { $ref: '#/components/schemas/StudentProfile' },
        teacher: { $ref: '#/components/schemas/TeacherProfile' },
        parent: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            children: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  admissionNumber: { type: 'string' },
                  name: { type: 'string' },
                  classRoom: {
                    type: 'object',
                    properties: { name: { type: 'string' }, stream: { type: 'string' } },
                  },
                },
              },
            },
          },
        },
      },
    },
  ],
} as const;

const subjectResultSchema = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    percentage: { type: 'number', example: 77.5 },
    letterGrade: { type: 'string', example: 'B+' },
    gradePoint: { type: 'number', example: 3.3 },
    remark: { type: 'string', example: 'Good' },
    position: { type: 'integer', nullable: true },
    isPublished: { type: 'boolean' },
    subject: {
      type: 'object',
      properties: {
        code: { type: 'string', example: 'MATH' },
        name: { type: 'string', example: 'Mathematics' },
        creditUnits: { type: 'number', example: 4 },
      },
    },
  },
} as const;

// ─── Tag descriptions (endpoint grouping by module) ───────────────────────────

const tags = [
  {
    name: 'Health & Info',
    description: 'Public endpoints: health check, API metadata.',
  },
  {
    name: 'Auth',
    description:
      'Authentication & session management. All login / refresh / logout endpoints are rate-limited (30 req / 15 min).',
  },
  {
    name: 'Users',
    description:
      'ADMIN-only user management: listing, activation/deactivation, password reset.',
  },
  {
    name: 'School',
    description:
      'School branding & settings. Public endpoints expose the school name / motto / badge for the login page.',
  },
  {
    name: 'Students',
    description:
      'Student profiles, enrollment, bulk import, and per-student results. Admission numbers are auto-generated.',
  },
  {
    name: 'Teachers',
    description: 'Teacher profiles, class assignments, and staff number generation.',
  },
  {
    name: 'Parents',
    description: 'Parent accounts and their linked children.',
  },
  {
    name: 'Subjects',
    description: 'Subject catalog and assessment component definitions.',
  },
  {
    name: 'Classes',
    description: 'Class / form-group management per academic year.',
  },
  {
    name: 'Academic Years',
    description: 'Academic years, semesters / terms, and activation.',
  },
  {
    name: 'Grade Scales',
    description: 'Configurable grading scales with bands (letter, grade point, remark).',
  },
  {
    name: 'Grades',
    description:
      'Core grading workflow: mark entry grid → submit → approve (auto-compute results & GPA) → publish (notify students & parents). Supports bulk Excel import.',
  },
  {
    name: 'Analytics',
    description: 'Dashboard stats, subject performance, GPA trends, class comparison.',
  },
  {
    name: 'Report Cards',
    description:
      'Report card generation, PDF download, transcript, QR-code verification, and digital signature stamping.',
  },
  {
    name: 'Signatures',
    description:
      'Digital signature capture (drawn or photographed). Signatures are stamped onto published report card PDFs.',
  },
  {
    name: 'Reports',
    description: 'CSV exports: grade sheets, class GPA reports.',
  },
  {
    name: 'Notifications',
    description: 'In-app notifications for the signed-in user (grades published, report cards ready, etc.).',
  },
  {
    name: 'Admin',
    description: 'Audit logs viewer, database backup export — ADMIN only.',
  },
];

// ─── Endpoint definitions ─────────────────────────────────────────────────────

function authed(responses: Record<string, unknown>): Record<string, unknown> {
  return {
    security: [{ bearerAuth: [] }],
    responses,
  };
}

const paths: Record<string, Record<string, unknown>> = {
  // ── Health & Info ────────────────────────────────────────────────────────
  '/api/health': {
    get: {
      tags: ['Health & Info'],
      summary: 'Health check',
      description: 'Returns service status and current server time. No authentication required.',
      responses: {
        200: {
          description: 'Service is healthy',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  status: { type: 'string', example: 'ok' },
                  service: { type: 'string', example: 'school-grading-api' },
                  time: { type: 'string', format: 'date-time' },
                },
              },
              example: { status: 'ok', service: 'school-grading-api', time: '2025-01-15T08:30:00.000Z' },
            },
          },
        },
      },
    },
  },
  '/api': {
    get: {
      tags: ['Health & Info'],
      summary: 'API metadata',
      description: 'Friendly index listing all top-level endpoint groups.',
      responses: {
        200: {
          description: 'API metadata',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  service: { type: 'string' },
                  status: { type: 'string' },
                  hint: { type: 'string' },
                  health: { type: 'string' },
                  endpoints: { type: 'object' },
                },
              },
            },
          },
        },
      },
    },
  },

  // ── Auth ─────────────────────────────────────────────────────────────────
  '/api/auth/login': {
    post: {
      tags: ['Auth'],
      summary: 'Log in',
      description:
        'Authenticate with email + password. Returns an access token (short-lived JWT), a refresh token, and the full user payload (including role-specific profile data).',
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['email', 'password'],
              properties: {
                email: { type: 'string', format: 'email', example: 'admin@school.rw' },
                password: { type: 'string', format: 'password', example: 'Admin@1234' },
              },
            },
            example: { email: 'admin@school.rw', password: 'Admin@1234' },
          },
        },
      },
      responses: {
        200: {
          description: 'Successful login',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  user: { $ref: '#/components/schemas/SessionUser' },
                  accessToken: { type: 'string', example: 'eyJhbGciOiJIUzI1NiIs...' },
                  refreshToken: { type: 'string', example: 'eyJhbGciOiJIUzI1NiIs...' },
                },
              },
              example: {
                user: {
                  id: 'clx1abc2def3g',
                  email: 'admin@school.rw',
                  name: 'Admin User',
                  role: 'ADMIN',
                  isActive: true,
                },
                accessToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
                refreshToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
              },
            },
          },
        },
        401: {
          description: 'Invalid credentials',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' }, example: { error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' } } } },
        },
        403: {
          description: 'Account deactivated',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' }, example: { error: { code: 'ACCOUNT_DISABLED', message: 'This account has been deactivated' } } } },
        },
        429: { description: 'Rate limited', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
      },
    },
  },

  '/api/auth/refresh': {
    post: {
      tags: ['Auth'],
      summary: 'Refresh tokens',
      description:
        'Rotate an active refresh token. Returns a fresh access + refresh pair. Reusing an already-rotated token invalidates the entire session family (security feature).',
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['refreshToken'],
              properties: { refreshToken: { type: 'string' } },
            },
            example: { refreshToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' },
          },
        },
      },
      responses: {
        200: {
          description: 'Tokens rotated',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  user: { $ref: '#/components/schemas/SessionUser' },
                  accessToken: { type: 'string' },
                  refreshToken: { type: 'string' },
                },
              },
            },
          },
        },
        401: { description: 'Invalid / expired / reused refresh token', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
      },
    },
  },

  '/api/auth/logout': {
    post: {
      tags: ['Auth'],
      summary: 'Log out',
      description: 'Revoke the supplied refresh token.',
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['refreshToken'],
              properties: { refreshToken: { type: 'string' } },
            },
          },
        },
      },
      responses: {
        200: {
          description: 'Logged out',
          content: { 'application/json': { schema: { type: 'object', properties: { success: { type: 'boolean' } } } } },
        },
      },
    },
  },

  '/api/auth/me': {
    get: {
      tags: ['Auth'],
      summary: 'Current session user',
      description: 'Returns the authenticated user with role-specific profile data.',
      ...authed({
        200: {
          description: 'Current user payload',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: { user: { $ref: '#/components/schemas/SessionUser' } },
              },
            },
          },
        },
        401: { description: 'Not authenticated' },
      }),
    },
  },

  '/api/auth/change-password': {
    post: {
      tags: ['Auth'],
      summary: 'Change password',
      description:
        'Change the signed-in user\'s password. Invalidates all active sessions (forces re-login on all devices).',
      ...authed({
        200: { description: 'Password changed', content: { 'application/json': { schema: { type: 'object', properties: { success: { type: 'boolean' } } } } } },
        400: { description: 'Wrong current password', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
      }),
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['currentPassword', 'newPassword'],
              properties: {
                currentPassword: { type: 'string', example: 'OldPass@123' },
                newPassword: { type: 'string', example: 'NewPass@456', description: '≥8 chars, ≥1 letter, ≥1 digit' },
              },
            },
          },
        },
      },
    },
  },

  // ── Users (ADMIN) ────────────────────────────────────────────────────────
  '/api/users': {
    get: {
      tags: ['Users'],
      summary: 'List users',
      description: 'Paginated user list with optional role / search filters. ADMIN only.',
      ...authed({
        200: {
          description: 'Paginated user list',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  data: { type: 'array', items: { $ref: '#/components/schemas/User' } },
                  ...paginationMeta.properties,
                },
              },
            },
          },
        },
      }),
      parameters: [
        { name: 'role', in: 'query', schema: { type: 'string', enum: ['ADMIN', 'TEACHER', 'STUDENT', 'PARENT'] } },
        { name: 'search', in: 'query', schema: { type: 'string' }, description: 'Match on name or email' },
        { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
        { name: 'pageSize', in: 'query', schema: { type: 'integer', default: 10, maximum: 100 } },
      ],
    },
  },

  '/api/users/{id}': {
    patch: {
      tags: ['Users'],
      summary: 'Update user',
      description: 'Activate / deactivate a user or change their role. ADMIN only.',
      ...authed({
        200: { description: 'Updated user', content: { 'application/json': { schema: { $ref: '#/components/schemas/User' } } } },
      }),
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      requestBody: {
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                isActive: { type: 'boolean' },
                role: { type: 'string', enum: ['ADMIN', 'TEACHER', 'STUDENT', 'PARENT'] },
              },
            },
            example: { isActive: false },
          },
        },
      },
    },
  },

  '/api/users/{id}/reset-password': {
    post: {
      tags: ['Users'],
      summary: 'Reset user password',
      description: 'Admin sets a new password for a user. Revokes all active sessions.',
      ...authed({
        200: { description: 'Password reset', content: { 'application/json': { schema: { type: 'object', properties: { success: { type: 'boolean' } } } } } },
      }),
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['password'],
              properties: { password: { type: 'string', example: 'TempPass@123' } },
            },
          },
        },
      },
    },
  },

  // ── School ───────────────────────────────────────────────────────────────
  '/api/school/public': {
    get: {
      tags: ['School'],
      summary: 'Public school info',
      description: 'School name, motto, badge presence — used by the login page.',
      responses: {
        200: {
          description: 'Public school data',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  name: { type: 'string', example: 'Excellence Model School' },
                  motto: { type: 'string', example: 'Knowledge. Integrity. Excellence.' },
                  hasBadge: { type: 'boolean', example: true },
                  academicYear: { type: 'string', nullable: true, example: '2024-2025' },
                },
              },
              example: { name: 'Excellence Model School', motto: 'Knowledge. Integrity. Excellence.', hasBadge: true, academicYear: '2024-2025' },
            },
          },
        },
      },
    },
  },

  '/api/school/badge': {
    get: {
      tags: ['School'],
      summary: 'Get school badge',
      description: 'Returns the badge image (PNG). Cacheable for 10 minutes.',
      responses: {
        200: { description: 'Badge image', content: { 'image/png': { schema: { type: 'string', format: 'binary' } } } },
        404: { description: 'No badge uploaded' },
      },
    },
    post: {
      tags: ['School'],
      summary: 'Upload school badge',
      description: 'Upload a badge image (PNG/JPG/WebP ≤5 MB). Auto-resized to ≤512px. ADMIN only.',
      ...authed({
        200: { description: 'Badge uploaded', content: { 'application/json': { schema: { type: 'object', properties: { success: { type: 'boolean' } } } } } },
      }),
      requestBody: {
        required: true,
        content: {
          'multipart/form-data': {
            schema: {
              type: 'object',
              properties: { file: { type: 'string', format: 'binary' } },
              required: ['file'],
            },
          },
        },
      },
    },
    delete: {
      tags: ['School'],
      summary: 'Remove badge',
      ...authed({
        200: { description: 'Badge removed', content: { 'application/json': { schema: { type: 'object', properties: { success: { type: 'boolean' } } } } } },
      }),
    },
  },

  '/api/school/settings': {
    get: {
      tags: ['School'],
      summary: 'Get school settings',
      description: 'Full settings including student ID prefix. ADMIN only.',
      ...authed({
        200: {
          description: 'School settings',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                  motto: { type: 'string' },
                  studentIdPrefix: { type: 'string', example: 'SGS' },
                  hasBadge: { type: 'boolean' },
                  updatedAt: { type: 'string', format: 'date-time' },
                },
              },
              example: { name: 'Excellence Model School', motto: 'Knowledge. Integrity. Excellence.', studentIdPrefix: 'SGS', hasBadge: true, updatedAt: '2025-01-10T12:00:00Z' },
            },
          },
        },
      }),
    },
    patch: {
      tags: ['School'],
      summary: 'Update school settings',
      ...authed({
        200: { description: 'Settings updated', content: { 'application/json': { schema: { type: 'object', properties: { success: { type: 'boolean' } } } } } },
      }),
      requestBody: {
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                name: { type: 'string', minLength: 2, maxLength: 120 },
                motto: { type: 'string', maxLength: 160 },
                studentIdPrefix: { type: 'string', pattern: '^[A-Z]{2,6}$', description: '2–6 uppercase letters' },
              },
            },
            example: { name: 'New School Name', studentIdPrefix: 'NSS' },
          },
        },
      },
    },
  },

  // ── Students ─────────────────────────────────────────────────────────────
  '/api/students': {
    get: {
      tags: ['Students'],
      summary: 'List students',
      description: 'Searchable, sortable, paginated list. ADMIN and TEACHER.',
      ...authed({
        200: {
          description: 'Paginated student list',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  data: { type: 'array', items: { $ref: '#/components/schemas/Student' } },
                  ...paginationMeta.properties,
                },
              },
            },
          },
        },
      }),
      parameters: [
        { name: 'search', in: 'query', schema: { type: 'string' } },
        { name: 'classId', in: 'query', schema: { type: 'string' } },
        { name: 'gender', in: 'query', schema: { type: 'string', enum: ['MALE', 'FEMALE', 'OTHER'] } },
        { name: 'parentStatus', in: 'query', schema: { type: 'string', enum: ['linked', 'unlinked'] } },
        { name: 'sortBy', in: 'query', schema: { type: 'string', default: 'name' } },
        { name: 'sortDir', in: 'query', schema: { type: 'string', enum: ['asc', 'desc'] } },
        { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
        { name: 'pageSize', in: 'query', schema: { type: 'integer', default: 10, maximum: 100 } },
      ],
    },
    post: {
      tags: ['Students'],
      summary: 'Create student',
      description:
        'Create a new student account. Admission number is auto-assigned if omitted. Optionally links to an existing parent via `parentEmail`. ADMIN only.',
      ...authed({
        201: { description: 'Student created', content: { 'application/json': { schema: { $ref: '#/components/schemas/Student' } } } },
      }),
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['name', 'email', 'password', 'dateOfBirth', 'gender'],
              properties: {
                name: { type: 'string', example: 'Alice Ishimwe' },
                email: { type: 'string', format: 'email', example: 'alice@student.rw' },
                password: { type: 'string', example: 'Student@123' },
                dateOfBirth: { type: 'string', format: 'date', example: '2007-03-15' },
                gender: { type: 'string', enum: ['MALE', 'FEMALE', 'OTHER'] },
                classId: { type: 'string', description: 'Enroll in this class for the active semester' },
                parentEmail: { type: 'string', format: 'email', description: 'Link to existing parent account' },
                admissionNumber: { type: 'string', description: 'Optional override (auto-generated if omitted)' },
                phone: { type: 'string' },
                address: { type: 'string' },
                guardianPhone: { type: 'string' },
              },
            },
            example: {
              name: 'Alice Ishimwe',
              email: 'alice@student.rw',
              password: 'Student@123',
              dateOfBirth: '2007-03-15',
              gender: 'FEMALE',
              classId: 'clx1cls001',
            },
          },
        },
      },
    },
  },

  '/api/students/{id}': {
    get: {
      tags: ['Students'],
      summary: 'Get student profile',
      description: 'Full profile with enrollments, GPA history, report cards.',
      ...authed({
        200: { description: 'Student detail', content: { 'application/json': { schema: { $ref: '#/components/schemas/StudentDetail' } } } },
        404: { description: 'Not found' },
      }),
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
    },
    put: {
      tags: ['Students'],
      summary: 'Update student',
      description:
        'Partial update. Changing `classId` re-enrolls the student for the active semester. Setting `parentEmail` to `null` unlinks the parent. ADMIN only.',
      ...authed({
        200: { description: 'Updated student' },
      }),
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      requestBody: {
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                email: { type: 'string', format: 'email' },
                dateOfBirth: { type: 'string', format: 'date' },
                gender: { type: 'string', enum: ['MALE', 'FEMALE', 'OTHER'] },
                classId: { type: 'string' },
                parentEmail: { type: 'string', format: 'email', nullable: true, description: 'null to unlink' },
                phone: { type: 'string' },
                address: { type: 'string' },
                guardianPhone: { type: 'string' },
              },
            },
          },
        },
      },
    },
    delete: {
      tags: ['Students'],
      summary: 'Delete student',
      description:
        'Requires step-up password confirmation: the admin must send `{ password }` (their own password). Wrong/missing password → 403/400. ADMIN only.',
      ...authed({
        200: { description: 'Deleted' },
        400: { description: 'Password confirmation missing' },
        403: { description: 'Incorrect password' },
      }),
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['password'],
              properties: { password: { type: 'string', example: 'AdminPass@123' } },
            },
          },
        },
      },
    },
  },

  '/api/students/import/template': {
    get: {
      tags: ['Students'],
      summary: 'Download student import template',
      description: 'Returns an `.xlsx` template with headers and a valid-class reference sheet. ADMIN only.',
      ...authed({
        200: { description: 'Excel template', content: { 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': { schema: { type: 'string', format: 'binary' } } } },
      }),
    },
  },

  '/api/students/import': {
    post: {
      tags: ['Students'],
      summary: 'Bulk import students',
      description:
        'Upload an `.xlsx` or `.csv` file (≤5 MB, ≤500 rows). Valid rows are created (auto admission numbers, active-term enrollment, blank passwords auto-generated); invalid rows are reported. Returns per-row errors and generated credentials. ADMIN only.',
      ...authed({
        200: {
          description: 'Import result',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  created: { type: 'integer', example: 28 },
                  failed: { type: 'integer', example: 2 },
                  errors: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        row: { type: 'integer' },
                        email: { type: 'string' },
                        reason: { type: 'string' },
                      },
                    },
                  },
                  credentials: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        email: { type: 'string' },
                        password: { type: 'string' },
                        admissionNumber: { type: 'string' },
                      },
                    },
                  },
                },
              },
              example: {
                created: 28,
                failed: 2,
                errors: [{ row: 15, email: 'bad@email', reason: 'invalid email' }],
                credentials: [{ email: 'alice@student.rw', password: 'xK9mP2qL', admissionNumber: 'SGS-2024-0029' }],
              },
            },
          },
        },
      }),
      requestBody: {
        required: true,
        content: {
          'multipart/form-data': {
            schema: {
              type: 'object',
              properties: { file: { type: 'string', format: 'binary', description: '.xlsx or .csv' } },
              required: ['file'],
            },
          },
        },
      },
    },
  },

  '/api/students/{id}/results': {
    get: {
      tags: ['Students'],
      summary: 'Student results',
      description:
        'Published subject results and GPA for a semester. Students and parents see only published data; staff can pass `all=true` to preview unpublished results.',
      ...authed({
        200: {
          description: 'Results payload',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  semester: { type: 'object', properties: { id: { type: 'string' }, name: { type: 'string' } } },
                  results: { type: 'array', items: { $ref: '#/components/schemas/SubjectResult' } },
                  gpa: {
                    type: 'object',
                    properties: {
                      gpa: { type: 'number', example: 3.45 },
                      average: { type: 'number', example: 72.8 },
                      position: { type: 'integer', nullable: true },
                      classSize: { type: 'integer', nullable: true },
                      totalCredits: { type: 'number' },
                    },
                  },
                },
              },
            },
          },
        },
      }),
      parameters: [
        { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
        { name: 'semesterId', in: 'query', required: true, schema: { type: 'string' } },
        { name: 'all', in: 'query', schema: { type: 'boolean' }, description: 'Include unpublished results (staff only)' },
      ],
    },
  },

  // ── Teachers ─────────────────────────────────────────────────────────────
  '/api/teachers': {
    get: {
      tags: ['Teachers'],
      summary: 'List teachers',
      ...authed({
        200: { description: 'Paginated teacher list', content: { 'application/json': { schema: { type: 'object', properties: { data: { type: 'array', items: { $ref: '#/components/schemas/Teacher' } }, ...paginationMeta.properties } } } } },
      }),
      parameters: [
        { name: 'search', in: 'query', schema: { type: 'string' } },
        { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
        { name: 'pageSize', in: 'query', schema: { type: 'integer', default: 10, maximum: 100 } },
      ],
    },
    post: {
      tags: ['Teachers'],
      summary: 'Create teacher',
      description: 'Staff number is auto-generated if omitted. ADMIN only.',
      ...authed({
        201: { description: 'Teacher created', content: { 'application/json': { schema: { $ref: '#/components/schemas/Teacher' } } } },
      }),
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['name', 'email', 'password'],
              properties: {
                name: { type: 'string', example: 'Marie Habimana' },
                email: { type: 'string', format: 'email', example: 'm.habimana@school.rw' },
                password: { type: 'string', example: 'Teacher@123' },
                staffNumber: { type: 'string', description: 'Auto-generated if omitted' },
                qualification: { type: 'string' },
              },
            },
            example: { name: 'Marie Habimana', email: 'm.habimana@school.rw', password: 'Teacher@123', qualification: 'BSc Mathematics' },
          },
        },
      },
    },
  },

  '/api/teachers/me': {
    get: {
      tags: ['Teachers'],
      summary: 'Own teacher profile',
      description: 'Returns the signed-in teacher\'s profile with class assignments and homeroom classes.',
      ...authed({
        200: { description: 'Teacher profile', content: { 'application/json': { schema: { $ref: '#/components/schemas/TeacherDetail' } } } },
      }),
    },
  },

  '/api/teachers/{id}': {
    get: {
      tags: ['Teachers'],
      summary: 'Get teacher',
      ...authed({
        200: { description: 'Teacher detail' },
        404: { description: 'Not found' },
      }),
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
    },
    put: {
      tags: ['Teachers'],
      summary: 'Update teacher',
      ...authed({ 200: { description: 'Updated' } }),
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      requestBody: {
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                email: { type: 'string', format: 'email' },
                qualification: { type: 'string' },
              },
            },
          },
        },
      },
    },
    delete: {
      tags: ['Teachers'],
      summary: 'Delete teacher',
      description: 'Requires step-up password confirmation (same pattern as student deletion). ADMIN only.',
      ...authed({
        200: { description: 'Deleted' },
        403: { description: 'Incorrect password' },
      }),
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      requestBody: {
        required: true,
        content: { 'application/json': { schema: { type: 'object', required: ['password'], properties: { password: { type: 'string' } } } } },
      },
    },
  },

  '/api/teachers/{id}/assignments': {
    post: {
      tags: ['Teachers'],
      summary: 'Assign teacher to class + subject',
      ...authed({ 201: { description: 'Assignment created' } }),
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['subjectId', 'classId'],
              properties: {
                subjectId: { type: 'string' },
                classId: { type: 'string' },
              },
            },
            example: { subjectId: 'clx1sub001', classId: 'clx1cls001' },
          },
        },
      },
    },
    delete: {
      tags: ['Teachers'],
      summary: 'Remove assignment',
      ...authed({ 200: { description: 'Removed' } }),
      parameters: [
        { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
        { name: 'assignmentId', in: 'query', required: true, schema: { type: 'string' } },
      ],
    },
  },

  // ── Parents ──────────────────────────────────────────────────────────────
  '/api/parents': {
    get: {
      tags: ['Parents'],
      summary: 'List parents',
      description: 'Paginated parent list with linked children. ADMIN only.',
      ...authed({
        200: { description: 'Paginated parent list', content: { 'application/json': { schema: { type: 'object', properties: { data: { type: 'array', items: { $ref: '#/components/schemas/Parent' } }, ...paginationMeta.properties } } } } },
      }),
      parameters: [
        { name: 'search', in: 'query', schema: { type: 'string' } },
        { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
        { name: 'pageSize', in: 'query', schema: { type: 'integer', default: 10, maximum: 100 } },
      ],
    },
    post: {
      tags: ['Parents'],
      summary: 'Create parent',
      ...authed({ 201: { description: 'Parent created' } }),
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['name', 'email', 'password'],
              properties: {
                name: { type: 'string', example: 'Parent User' },
                email: { type: 'string', format: 'email' },
                password: { type: 'string' },
                phone: { type: 'string' },
              },
            },
          },
        },
      },
    },
  },

  '/api/parents/{id}': {
    get: {
      tags: ['Parents'],
      summary: 'Get parent',
      ...authed({ 200: { description: 'Parent detail' } }),
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
    },
    put: {
      tags: ['Parents'],
      summary: 'Update parent',
      ...authed({ 200: { description: 'Updated' } }),
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      requestBody: {
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: { name: { type: 'string' }, email: { type: 'string', format: 'email' }, phone: { type: 'string' } },
            },
          },
        },
      },
    },
    delete: {
      tags: ['Parents'],
      summary: 'Delete parent',
      description: 'Requires step-up password confirmation.',
      ...authed({ 200: { description: 'Deleted' }, 403: { description: 'Incorrect password' } }),
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      requestBody: {
        required: true,
        content: { 'application/json': { schema: { type: 'object', required: ['password'], properties: { password: { type: 'string' } } } } },
      },
    },
  },

  // ── Subjects ─────────────────────────────────────────────────────────────
  '/api/subjects': {
    get: {
      tags: ['Subjects'],
      summary: 'List subjects',
      description: 'All subjects with their assessment components.',
      ...authed({
        200: {
          description: 'Subject list',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  data: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        id: { type: 'string' },
                        code: { type: 'string', example: 'MATH' },
                        name: { type: 'string', example: 'Mathematics' },
                        creditUnits: { type: 'number', example: 4 },
                        department: { type: 'string', nullable: true },
                        components: {
                          type: 'array',
                          items: {
                            type: 'object',
                            properties: {
                              id: { type: 'string' },
                              type: { type: 'string', enum: ['ASSIGNMENT', 'QUIZ', 'CAT', 'PRACTICAL', 'MIDTERM', 'FINAL', 'PROJECT'] },
                              name: { type: 'string' },
                              weight: { type: 'number', example: 20 },
                              maxScore: { type: 'number', example: 100 },
                            },
                          },
                        },
                      },
                    },
                  },
                },
              },
              example: {
                data: [
                  {
                    id: 'sub001',
                    code: 'MATH',
                    name: 'Mathematics',
                    creditUnits: 4,
                    components: [
                      { id: 'c1', type: 'CAT', name: 'CAT 1', weight: 20, maxScore: 100 },
                      { id: 'c2', type: 'MIDTERM', name: 'Midterm', weight: 30, maxScore: 100 },
                      { id: 'c3', type: 'FINAL', name: 'Final Exam', weight: 50, maxScore: 100 },
                    ],
                  },
                ],
              },
            },
          },
        },
      }),
    },
    post: {
      tags: ['Subjects'],
      summary: 'Create subject',
      ...authed({ 201: { description: 'Subject created' } }),
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['code', 'name', 'creditUnits'],
              properties: {
                code: { type: 'string', example: 'PHY' },
                name: { type: 'string', example: 'Physics' },
                creditUnits: { type: 'number', example: 3 },
                department: { type: 'string' },
                description: { type: 'string' },
              },
            },
          },
        },
      },
    },
  },

  '/api/subjects/{id}': {
    put: {
      tags: ['Subjects'],
      summary: 'Update subject',
      ...authed({ 200: { description: 'Updated' } }),
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      requestBody: {
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                code: { type: 'string' },
                name: { type: 'string' },
                creditUnits: { type: 'number' },
                department: { type: 'string' },
                description: { type: 'string' },
              },
            },
          },
        },
      },
    },
    delete: {
      tags: ['Subjects'],
      summary: 'Delete subject',
      ...authed({ 200: { description: 'Deleted' } }),
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
    },
  },

  // ── Classes ──────────────────────────────────────────────────────────────
  '/api/classes': {
    get: {
      tags: ['Classes'],
      summary: 'List classes',
      ...authed({
        200: {
          description: 'Class list',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  data: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        id: { type: 'string' },
                        name: { type: 'string', example: 'S5' },
                        level: { type: 'integer', example: 11 },
                        stream: { type: 'string', example: 'A' },
                        academicYear: { type: 'object', properties: { id: { type: 'string' }, name: { type: 'string' } } },
                        homeroomTeacher: { type: 'object', nullable: true, properties: { id: { type: 'string' }, name: { type: 'string' } } },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      }),
      parameters: [
        { name: 'academicYearId', in: 'query', schema: { type: 'string' } },
      ],
    },
    post: {
      tags: ['Classes'],
      summary: 'Create class',
      ...authed({ 201: { description: 'Class created' } }),
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['name', 'level', 'academicYearId'],
              properties: {
                name: { type: 'string', example: 'S5' },
                level: { type: 'integer', example: 11 },
                stream: { type: 'string', default: 'A', example: 'A' },
                academicYearId: { type: 'string' },
                homeroomTeacherId: { type: 'string', nullable: true },
              },
            },
            example: { name: 'S5', level: 11, stream: 'A', academicYearId: 'clx1year01' },
          },
        },
      },
    },
  },

  '/api/classes/{id}': {
    put: {
      tags: ['Classes'],
      summary: 'Update class',
      ...authed({ 200: { description: 'Updated' } }),
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      requestBody: {
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                level: { type: 'integer' },
                stream: { type: 'string' },
                academicYearId: { type: 'string' },
                homeroomTeacherId: { type: 'string', nullable: true },
              },
            },
          },
        },
      },
    },
    delete: {
      tags: ['Classes'],
      summary: 'Delete class',
      ...authed({ 200: { description: 'Deleted' } }),
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
    },
  },

  // ── Academic Years ───────────────────────────────────────────────────────
  '/api/academic-years': {
    get: {
      tags: ['Academic Years'],
      summary: 'List academic years',
      ...authed({
        200: { description: 'Year list with semesters', content: { 'application/json': { schema: { type: 'object', properties: { data: { type: 'array', items: { type: 'object' } } } } } } },
      }),
    },
    post: {
      tags: ['Academic Years'],
      summary: 'Create academic year',
      description: 'Create a year with semesters / terms. ADMIN only.',
      ...authed({ 201: { description: 'Year created' } }),
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['name', 'startDate', 'endDate', 'semesters'],
              properties: {
                name: { type: 'string', example: '2024-2025' },
                startDate: { type: 'string', format: 'date' },
                endDate: { type: 'string', format: 'date' },
                activate: { type: 'boolean', default: false },
                semesters: {
                  type: 'array',
                  items: {
                    type: 'object',
                    required: ['name', 'number', 'startDate', 'endDate'],
                    properties: {
                      name: { type: 'string', example: 'Term 1' },
                      number: { type: 'integer', minimum: 1, maximum: 6 },
                      kind: { type: 'string', enum: ['TERM', 'SEMESTER'], default: 'TERM' },
                      startDate: { type: 'string', format: 'date' },
                      endDate: { type: 'string', format: 'date' },
                    },
                  },
                  minItems: 1,
                },
              },
            },
            example: {
              name: '2024-2025',
              startDate: '2024-09-01',
              endDate: '2025-07-15',
              activate: true,
              semesters: [
                { name: 'Term 1', number: 1, startDate: '2024-09-01', endDate: '2024-12-20' },
                { name: 'Term 2', number: 2, startDate: '2025-01-10', endDate: '2025-04-15' },
                { name: 'Term 3', number: 3, startDate: '2025-05-01', endDate: '2025-07-15' },
              ],
            },
          },
        },
      },
    },
  },

  '/api/academic-years/active': {
    get: {
      tags: ['Academic Years'],
      summary: 'Get active year',
      description: 'Returns the currently active academic year with all its terms.',
      ...authed({
        200: { description: 'Active year' },
        409: { description: 'No active year configured', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' }, example: { error: { code: 'NO_ACTIVE_YEAR', message: 'No active academic year configured' } } } } },
      }),
    },
  },

  // ── Grade Scales ─────────────────────────────────────────────────────────
  '/api/grade-scales': {
    get: {
      tags: ['Grade Scales'],
      summary: 'List grade scales',
      ...authed({
        200: {
          description: 'Scale list',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  data: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        id: { type: 'string' },
                        name: { type: 'string', example: 'Standard 4.0 Scale' },
                        isActive: { type: 'boolean' },
                        bands: {
                          type: 'array',
                          items: {
                            type: 'object',
                            properties: {
                              minScore: { type: 'number' },
                              maxScore: { type: 'number' },
                              letter: { type: 'string', example: 'A+' },
                              gradePoint: { type: 'number', example: 4.0 },
                              remark: { type: 'string', example: 'Excellent' },
                            },
                          },
                        },
                      },
                    },
                  },
                },
              },
              example: {
                data: [
                  {
                    id: 'scale001',
                    name: 'Standard 4.0 Scale',
                    isActive: true,
                    bands: [
                      { minScore: 90, maxScore: 100, letter: 'A+', gradePoint: 4.0, remark: 'Excellent' },
                      { minScore: 80, maxScore: 89.99, letter: 'A', gradePoint: 3.7, remark: 'Very Good' },
                      { minScore: 70, maxScore: 79.99, letter: 'B+', gradePoint: 3.3, remark: 'Good' },
                      { minScore: 60, maxScore: 69.99, letter: 'B', gradePoint: 3.0, remark: 'Credit' },
                      { minScore: 50, maxScore: 59.99, letter: 'C', gradePoint: 2.0, remark: 'Pass' },
                      { minScore: 0, maxScore: 49.99, letter: 'F', gradePoint: 0.0, remark: 'Fail' },
                    ],
                  },
                ],
              },
            },
          },
        },
      }),
    },
    post: {
      tags: ['Grade Scales'],
      summary: 'Create grade scale',
      ...authed({ 201: { description: 'Scale created' } }),
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['name', 'bands'],
              properties: {
                name: { type: 'string' },
                bands: {
                  type: 'array',
                  minItems: 2,
                  items: {
                    type: 'object',
                    required: ['minScore', 'maxScore', 'letter', 'gradePoint', 'remark'],
                    properties: {
                      minScore: { type: 'number', minimum: 0, maximum: 100 },
                      maxScore: { type: 'number', minimum: 0, maximum: 100 },
                      letter: { type: 'string' },
                      gradePoint: { type: 'number', minimum: 0, maximum: 5 },
                      remark: { type: 'string' },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  },

  '/api/grade-scales/{id}': {
    put: {
      tags: ['Grade Scales'],
      summary: 'Update grade scale',
      ...authed({ 200: { description: 'Updated' } }),
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      requestBody: {
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                bands: { type: 'array', minItems: 2, items: { type: 'object' } },
              },
            },
          },
        },
      },
    },
    delete: {
      tags: ['Grade Scales'],
      summary: 'Delete grade scale',
      description: 'Scale must be deactivated first.',
      ...authed({ 200: { description: 'Deleted' }, 409: { description: 'Scale is still active' } }),
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
    },
  },

  '/api/grade-scales/{id}/activate': {
    post: {
      tags: ['Grade Scales'],
      summary: 'Activate grade scale',
      description: 'Deactivates all other scales and activates this one.',
      ...authed({ 200: { description: 'Activated', content: { 'application/json': { schema: { type: 'object', properties: { success: { type: 'boolean' } } } } } } }),
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
    },
  },

  // ── Grades (core workflow) ───────────────────────────────────────────────
  '/api/grades/grid': {
    get: {
      tags: ['Grades'],
      summary: 'Grade entry grid',
      description:
        'Returns the mark-entry matrix for a class × subject × semester. Rows = students, columns = assessment components. Teachers are restricted to their assigned pairs; admins can view any grid.',
      ...authed({
        200: {
          description: 'Grid payload',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  students: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: { id: { type: 'string' }, name: { type: 'string' }, admissionNumber: { type: 'string' } },
                    },
                  },
                  components: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: { id: { type: 'string' }, type: { type: 'string' }, name: { type: 'string' }, weight: { type: 'number' }, maxScore: { type: 'number' } },
                    },
                  },
                  entries: { type: 'object', description: 'Nested map: studentId → componentId → { score, status }' },
                  status: { type: 'string', enum: ['EMPTY', 'DRAFT', 'SUBMITTED', 'APPROVED', 'PUBLISHED'] },
                  editable: { type: 'boolean' },
                },
              },
              example: {
                students: [{ id: 'stu001', name: 'Alice Ishimwe', admissionNumber: 'SGS-2024-0001' }],
                components: [{ id: 'comp001', type: 'CAT', name: 'CAT 1', weight: 20, maxScore: 100 }],
                entries: { stu001: { comp001: { score: 85, status: 'DRAFT' } } },
                status: 'DRAFT',
                editable: true,
              },
            },
          },
        },
      }),
      parameters: [
        { name: 'classId', in: 'query', required: true, schema: { type: 'string' } },
        { name: 'subjectId', in: 'query', required: true, schema: { type: 'string' } },
        { name: 'semesterId', in: 'query', required: true, schema: { type: 'string' } },
      ],
    },
  },

  '/api/grades/entry': {
    post: {
      tags: ['Grades'],
      summary: 'Save marks (bulk upsert)',
      description:
        'Save marks for multiple students × components. Auto-saves as DRAFT. Published marks are locked; approved marks can only be edited by admins (who trigger immediate recomputation).',
      ...authed({
        200: { description: 'Updated grid', content: { 'application/json': { schema: { type: 'object' } } } },
        409: { description: 'Marks locked (published or approved)', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
      }),
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['classId', 'subjectId', 'semesterId', 'entries'],
              properties: {
                classId: { type: 'string' },
                subjectId: { type: 'string' },
                semesterId: { type: 'string' },
                entries: {
                  type: 'array',
                  items: {
                    type: 'object',
                    required: ['studentId', 'scores'],
                    properties: {
                      studentId: { type: 'string' },
                      scores: { type: 'object', description: 'componentId → score (null to delete)' },
                    },
                  },
                  minItems: 1,
                },
              },
            },
            example: {
              classId: 'cls001',
              subjectId: 'sub001',
              semesterId: 'sem001',
              entries: [
                { studentId: 'stu001', scores: { comp001: 85, comp002: 72 } },
                { studentId: 'stu002', scores: { comp001: 90, comp002: 88 } },
              ],
            },
          },
        },
      },
    },
  },

  '/api/grades/submit': {
    post: {
      tags: ['Grades'],
      summary: 'Submit marks for approval',
      description: 'Teacher transitions DRAFT → SUBMITTED. Notifies admins.',
      ...authed({
        200: { description: 'Submitted' },
      }),
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['classId', 'subjectId', 'semesterId'],
              properties: { classId: { type: 'string' }, subjectId: { type: 'string' }, semesterId: { type: 'string' } },
            },
          },
        },
      },
    },
  },

  '/api/grades/approve': {
    post: {
      tags: ['Grades'],
      summary: 'Approve marks',
      description:
        'ADMIN transitions SUBMITTED → APPROVED. Automatically computes subject results, class ranks, GPA, and class positions.',
      ...authed({
        200: { description: 'Approved & computed', content: { 'application/json': { schema: { type: 'object', properties: { approved: { type: 'integer' } } } } } },
      }),
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['classId', 'subjectId', 'semesterId'],
              properties: { classId: { type: 'string' }, subjectId: { type: 'string' }, semesterId: { type: 'string' } },
            },
          },
        },
      },
    },
  },

  '/api/grades/publish': {
    post: {
      tags: ['Grades'],
      summary: 'Publish marks',
      description: 'ADMIN transitions APPROVED → PUBLISHED. Notifies students and parents with a deep link to the grades page.',
      ...authed({
        200: { description: 'Published' },
      }),
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['classId', 'subjectId', 'semesterId'],
              properties: { classId: { type: 'string' }, subjectId: { type: 'string' }, semesterId: { type: 'string' } },
            },
          },
        },
      },
    },
  },

  '/api/grades/unlock': {
    post: {
      tags: ['Grades'],
      summary: 'Unlock marks',
      description:
        'ADMIN reopens marks for corrections. `to: "DRAFT"` returns a submission to the teacher (with optional note, who is notified with a grade-entry deep link).',
      ...authed({
        200: { description: 'Unlocked' },
      }),
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['classId', 'subjectId', 'semesterId', 'to'],
              properties: {
                classId: { type: 'string' },
                subjectId: { type: 'string' },
                semesterId: { type: 'string' },
                to: { type: 'string', enum: ['DRAFT', 'SUBMITTED', 'APPROVED'] },
                note: { type: 'string', description: 'Optional note sent to the teacher when unlocking to DRAFT' },
              },
            },
            example: { classId: 'cls001', subjectId: 'sub001', semesterId: 'sem001', to: 'DRAFT', note: 'Please fix scores for CAT 2' },
          },
        },
      },
    },
  },

  '/api/grades/import/template': {
    get: {
      tags: ['Grades'],
      summary: 'Download marks import template',
      description: 'Returns an `.xlsx` template pre-filled with component names for the given class × subject × term.',
      ...authed({
        200: { description: 'Excel template', content: { 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': { schema: { type: 'string', format: 'binary' } } } },
      }),
      parameters: [
        { name: 'classId', in: 'query', required: true, schema: { type: 'string' } },
        { name: 'subjectId', in: 'query', required: true, schema: { type: 'string' } },
        { name: 'semesterId', in: 'query', required: true, schema: { type: 'string' } },
      ],
    },
  },

  '/api/grades/import': {
    post: {
      tags: ['Grades'],
      summary: 'Bulk import marks',
      description:
        'Upload an `.xlsx` or `.csv` file (≤5 MB, ≤500 rows). Blank cells keep existing marks; invalid cells are reported per row. Same lock rules as the interactive grid.',
      ...authed({
        200: {
          description: 'Import result',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  applied: { type: 'integer', example: 120 },
                  skipped: { type: 'integer', example: 5 },
                  failed: { type: 'integer', example: 0 },
                  errors: { type: 'array', items: { type: 'object' } },
                  recomputed: { type: 'boolean' },
                },
              },
              example: { applied: 120, skipped: 5, failed: 0, errors: [], recomputed: false },
            },
          },
        },
      }),
      parameters: [
        { name: 'classId', in: 'query', required: true, schema: { type: 'string' } },
        { name: 'subjectId', in: 'query', required: true, schema: { type: 'string' } },
        { name: 'semesterId', in: 'query', required: true, schema: { type: 'string' } },
      ],
      requestBody: {
        required: true,
        content: {
          'multipart/form-data': {
            schema: {
              type: 'object',
              properties: { file: { type: 'string', format: 'binary' } },
              required: ['file'],
            },
          },
        },
      },
    },
  },

  '/api/grades/class-summary': {
    get: {
      tags: ['Grades'],
      summary: 'Class summary',
      description: 'Full class sheet: per-student results + GPA for the semester.',
      ...authed({
        200: { description: 'Class summary', content: { 'application/json': { schema: { type: 'object' } } } },
      }),
      parameters: [
        { name: 'classId', in: 'query', required: true, schema: { type: 'string' } },
        { name: 'semesterId', in: 'query', required: true, schema: { type: 'string' } },
      ],
    },
  },

  // ── Analytics ────────────────────────────────────────────────────────────
  '/api/analytics/dashboard': {
    get: {
      tags: ['Analytics'],
      summary: 'Dashboard stats',
      description: 'Headline counts, average performance, grade distribution, top/bottom students, recent results, GPA trend.',
      ...authed({
        200: {
          description: 'Dashboard payload',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  students: { type: 'integer' },
                  teachers: { type: 'integer' },
                  classes: { type: 'integer' },
                  subjects: { type: 'integer' },
                  averagePerformance: { type: 'number', nullable: true, example: 72.5 },
                  distribution: { type: 'array', items: { type: 'object', properties: { letter: { type: 'string' }, count: { type: 'integer' } } } },
                  topStudents: { type: 'array', items: { type: 'object' } },
                  bottomStudents: { type: 'array', items: { type: 'object' } },
                  pendingSubmissions: { type: 'integer' },
                },
              },
              example: {
                students: 150,
                teachers: 12,
                classes: 8,
                subjects: 10,
                averagePerformance: 72.5,
                distribution: [{ letter: 'A+', count: 15 }, { letter: 'A', count: 30 }, { letter: 'B+', count: 45 }],
                topStudents: [],
                bottomStudents: [],
                pendingSubmissions: 3,
              },
            },
          },
        },
      }),
    },
  },

  '/api/analytics/subject-performance': {
    get: {
      tags: ['Analytics'],
      summary: 'Subject performance',
      ...authed({ 200: { description: 'Per-subject stats' } }),
      parameters: [
        { name: 'classId', in: 'query', required: true, schema: { type: 'string' } },
        { name: 'semesterId', in: 'query', required: true, schema: { type: 'string' } },
      ],
    },
  },

  '/api/analytics/gpa-trends': {
    get: {
      tags: ['Analytics'],
      summary: 'GPA trends',
      description: 'GPA + position across terms for a student.',
      ...authed({ 200: { description: 'GPA history' } }),
      parameters: [
        { name: 'studentId', in: 'query', required: true, schema: { type: 'string' } },
      ],
    },
  },

  '/api/analytics/class-performance': {
    get: {
      tags: ['Analytics'],
      summary: 'Class comparison',
      ...authed({ 200: { description: 'Class stats' } }),
      parameters: [
        { name: 'semesterId', in: 'query', required: true, schema: { type: 'string' } },
      ],
    },
  },

  // ── Report Cards ─────────────────────────────────────────────────────────
  '/api/report-cards/generate': {
    post: {
      tags: ['Report Cards'],
      summary: 'Generate report cards',
      description: 'Bulk-generate report cards for a class × semester (requires computed GPA). ADMIN only.',
      ...authed({
        200: {
          description: 'Generation result',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  generated: { type: 'integer', example: 30 },
                  skipped: { type: 'integer', example: 2, description: 'Students without computed GPA' },
                },
              },
              example: { generated: 30, skipped: 2 },
            },
          },
        },
      }),
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['classId', 'semesterId'],
              properties: { classId: { type: 'string' }, semesterId: { type: 'string' } },
            },
            example: { classId: 'cls001', semesterId: 'sem001' },
          },
        },
      },
    },
  },

  '/api/report-cards': {
    get: {
      tags: ['Report Cards'],
      summary: 'List report cards',
      ...authed({ 200: { description: 'Card list' } }),
      parameters: [
        { name: 'classId', in: 'query', required: true, schema: { type: 'string' } },
        { name: 'semesterId', in: 'query', required: true, schema: { type: 'string' } },
      ],
    },
  },

  '/api/report-cards/mine': {
    get: {
      tags: ['Report Cards'],
      summary: 'My report cards',
      description: 'Published report cards for the signed-in student (or parent\'s child).',
      ...authed({ 200: { description: 'Published cards' } }),
      parameters: [
        { name: 'studentId', in: 'query', schema: { type: 'string' }, description: 'Parent must specify child ID' },
      ],
    },
  },

  '/api/report-cards/{id}': {
    get: {
      tags: ['Report Cards'],
      summary: 'Report card detail',
      ...authed({ 200: { description: 'Full card JSON' } }),
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
    },
  },

  '/api/report-cards/{id}/pdf': {
    get: {
      tags: ['Report Cards'],
      summary: 'Download report card PDF',
      ...authed({
        200: { description: 'PDF download', content: { 'application/pdf': { schema: { type: 'string', format: 'binary' } } } },
      }),
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
    },
  },

  '/api/report-cards/transcript/{studentId}/pdf': {
    get: {
      tags: ['Report Cards'],
      summary: 'Download transcript PDF',
      description: 'Cumulative transcript across all terms with CGPA.',
      ...authed({
        200: { description: 'PDF transcript', content: { 'application/pdf': { schema: { type: 'string', format: 'binary' } } } },
      }),
      parameters: [{ name: 'studentId', in: 'path', required: true, schema: { type: 'string' } }],
    },
  },

  '/api/report-cards/verify/{code}': {
    get: {
      tags: ['Report Cards'],
      summary: 'Verify report card (public)',
      description: 'QR code target — returns card data + QR image for published cards only. No authentication required.',
      responses: {
        200: {
          description: 'Verification data',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  valid: { type: 'boolean', example: true },
                  student: { type: 'string', example: 'Alice Ishimwe' },
                  class: { type: 'string', example: 'S5 A' },
                  semester: { type: 'string', example: 'Term 1 — 2024-2025' },
                  gpa: { type: 'number', example: 3.45 },
                  publishedAt: { type: 'string', format: 'date-time' },
                },
              },
              example: {
                valid: true,
                student: 'Alice Ishimwe',
                class: 'S5 A',
                semester: 'Term 1 — 2024-2025',
                gpa: 3.45,
                publishedAt: '2025-01-15T10:00:00Z',
              },
            },
          },
        },
        404: { description: 'Invalid verification code' },
      },
    },
  },

  '/api/report-cards/{id}/remarks': {
    patch: {
      tags: ['Report Cards'],
      summary: 'Update remarks',
      description: 'Set teacher / principal remarks before publishing. ADMIN only.',
      ...authed({ 200: { description: 'Remarks updated' } }),
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      requestBody: {
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                teacherRemarks: { type: 'string' },
                principalRemarks: { type: 'string' },
              },
            },
            example: { teacherRemarks: 'Good effort — keep up the consistent work.', principalRemarks: 'Promoted to next term.' },
          },
        },
      },
    },
  },

  '/api/report-cards/{id}/publish': {
    post: {
      tags: ['Report Cards'],
      summary: 'Publish report card',
      description: 'Publishes a single card. Notifies student & parents.',
      ...authed({ 200: { description: 'Published' } }),
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
    },
  },

  '/api/report-cards/publish-all': {
    post: {
      tags: ['Report Cards'],
      summary: 'Publish all report cards',
      description: 'Bulk-publish all generated cards for a class × semester.',
      ...authed({ 200: { description: 'Published', content: { 'application/json': { schema: { type: 'object', properties: { published: { type: 'integer' } } } } } } }),
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['classId', 'semesterId'],
              properties: { classId: { type: 'string' }, semesterId: { type: 'string' } },
            },
          },
        },
      },
    },
  },

  // ── Signatures ───────────────────────────────────────────────────────────
  '/api/signatures/me': {
    post: {
      tags: ['Signatures'],
      summary: 'Upload signature',
      description:
        'Upload a signature image (drawn canvas or photographed). Paper photos are auto-cleaned. Upserts — replaces any previous signature. TEACHER & ADMIN.',
      ...authed({
        200: { description: 'Signature saved' },
        400: { description: 'Invalid file or image too large after compression' },
      }),
      requestBody: {
        required: true,
        content: {
          'multipart/form-data': {
            schema: {
              type: 'object',
              required: ['file'],
              properties: {
                file: { type: 'string', format: 'binary', description: 'PNG/JPG/WebP ≤5 MB' },
                title: { type: 'string', description: 'Defaults to "Class Teacher" or "Principal"' },
              },
            },
          },
        },
      },
    },
    get: {
      tags: ['Signatures'],
      summary: 'Get own signature PNG',
      ...authed({ 200: { description: 'Signature image', content: { 'image/png': { schema: { type: 'string', format: 'binary' } } } } }),
    },
    delete: {
      tags: ['Signatures'],
      summary: 'Remove own signature',
      ...authed({ 200: { description: 'Removed' } }),
    },
  },

  '/api/signatures/me/meta': {
    get: {
      tags: ['Signatures'],
      summary: 'Signature metadata',
      ...authed({
        200: {
          description: 'Metadata',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  title: { type: 'string', example: 'Class Teacher' },
                  width: { type: 'integer' },
                  height: { type: 'integer' },
                  updatedAt: { type: 'string', format: 'date-time' },
                },
              },
            },
          },
        },
      }),
    },
  },

  '/api/signatures/user/{userId}': {
    get: {
      tags: ['Signatures'],
      summary: 'Get user signature (admin)',
      description: 'ADMIN — inspect any user\'s signature.',
      ...authed({ 200: { description: 'Signature image' } }),
      parameters: [{ name: 'userId', in: 'path', required: true, schema: { type: 'string' } }],
    },
  },

  // ── Reports / Exports ────────────────────────────────────────────────────
  '/api/reports/gradesheet.csv': {
    get: {
      tags: ['Reports'],
      summary: 'Grade sheet CSV',
      description: 'Per-student marks for a class × subject × term. Opens in Excel.',
      ...authed({
        200: { description: 'CSV download', content: { 'text/csv': { schema: { type: 'string', format: 'binary' } } } },
      }),
      parameters: [
        { name: 'classId', in: 'query', required: true, schema: { type: 'string' } },
        { name: 'subjectId', in: 'query', required: true, schema: { type: 'string' } },
        { name: 'semesterId', in: 'query', required: true, schema: { type: 'string' } },
      ],
    },
  },

  '/api/reports/class-report.csv': {
    get: {
      tags: ['Reports'],
      summary: 'Class GPA report CSV',
      ...authed({
        200: { description: 'CSV download', content: { 'text/csv': { schema: { type: 'string', format: 'binary' } } } },
      }),
      parameters: [
        { name: 'classId', in: 'query', required: true, schema: { type: 'string' } },
        { name: 'semesterId', in: 'query', required: true, schema: { type: 'string' } },
      ],
    },
  },

  // ── Notifications ────────────────────────────────────────────────────────
  '/api/notifications': {
    get: {
      tags: ['Notifications'],
      summary: 'List notifications',
      description: 'Latest 30 notifications + unread count for the signed-in user.',
      ...authed({
        200: {
          description: 'Notification list',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  data: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        id: { type: 'string' },
                        type: { type: 'string', enum: ['GRADES_PUBLISHED', 'REPORT_CARD_AVAILABLE', 'GRADE_CORRECTION', 'ANNOUNCEMENT'] },
                        title: { type: 'string' },
                        message: { type: 'string' },
                        link: { type: 'string', nullable: true },
                        isRead: { type: 'boolean' },
                        createdAt: { type: 'string', format: 'date-time' },
                      },
                    },
                  },
                  unreadCount: { type: 'integer', example: 3 },
                },
              },
              example: {
                data: [
                  { id: 'n1', type: 'GRADES_PUBLISHED', title: 'Grades published', message: 'Mathematics Term 1 grades are now available.', link: '/grades', isRead: false, createdAt: '2025-01-15T10:00:00Z' },
                ],
                unreadCount: 1,
              },
            },
          },
        },
      }),
    },
    delete: {
      tags: ['Notifications'],
      summary: 'Clear all notifications',
      ...authed({ 200: { description: 'Cleared', content: { 'application/json': { schema: { type: 'object', properties: { success: { type: 'boolean' }, deleted: { type: 'integer' } } } } } } }),
    },
  },

  '/api/notifications/{id}/read': {
    patch: {
      tags: ['Notifications'],
      summary: 'Mark notification read',
      ...authed({ 200: { description: 'Marked read' } }),
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
    },
  },

  '/api/notifications/read-all': {
    patch: {
      tags: ['Notifications'],
      summary: 'Mark all read',
      ...authed({ 200: { description: 'All marked read' } }),
    },
  },

  '/api/notifications/{id}': {
    delete: {
      tags: ['Notifications'],
      summary: 'Delete notification',
      ...authed({ 200: { description: 'Deleted' }, 404: { description: 'Not found (or not owned)' } }),
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
    },
  },

  // ── Admin ────────────────────────────────────────────────────────────────
  '/api/admin/audit-logs': {
    get: {
      tags: ['Admin'],
      summary: 'Audit logs',
      description: 'Paginated audit trail with filters. ADMIN only.',
      ...authed({
        200: {
          description: 'Audit log list',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  data: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        id: { type: 'string' },
                        action: { type: 'string', example: 'LOGIN' },
                        entity: { type: 'string', example: 'User' },
                        entityId: { type: 'string', nullable: true },
                        metadata: {},
                        ipAddress: { type: 'string', nullable: true },
                        createdAt: { type: 'string', format: 'date-time' },
                        user: { type: 'object', nullable: true, properties: { name: { type: 'string' } } },
                      },
                    },
                  },
                  ...paginationMeta.properties,
                },
              },
            },
          },
        },
      }),
      parameters: [
        { name: 'entity', in: 'query', schema: { type: 'string' } },
        { name: 'action', in: 'query', schema: { type: 'string' } },
        { name: 'userId', in: 'query', schema: { type: 'string' } },
        { name: 'search', in: 'query', schema: { type: 'string' } },
        { name: 'from', in: 'query', schema: { type: 'string', format: 'date' } },
        { name: 'to', in: 'query', schema: { type: 'string', format: 'date' } },
        { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
        { name: 'pageSize', in: 'query', schema: { type: 'integer', default: 10 } },
      ],
    },
  },

  '/api/admin/audit-logs/meta': {
    get: {
      tags: ['Admin'],
      summary: 'Audit log filter metadata',
      description: 'Distinct actions and entities for filter dropdowns.',
      ...authed({
        200: {
          description: 'Filter metadata',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  actions: { type: 'array', items: { type: 'string' } },
                  entities: { type: 'array', items: { type: 'string' } },
                },
              },
              example: { actions: ['LOGIN', 'CREATE_STUDENT', 'ENTER_GRADES', 'APPROVE_GRADES'], entities: ['User', 'Student', 'GradeEntry'] },
            },
          },
        },
      }),
    },
  },

  '/api/admin/backup': {
    get: {
      tags: ['Admin'],
      summary: 'Database backup',
      description: 'Full database export as JSON. ADMIN only.',
      ...authed({
        200: { description: 'JSON backup download', content: { 'application/json': { schema: { type: 'string', format: 'binary' } } } },
      }),
    },
  },
};

// ─── Assemble the spec ────────────────────────────────────────────────────────

export function buildOpenApiSpec() {
  const port = env.PORT ?? 4000;
  return {
    openapi: '3.0.3',
    info: {
      title: 'School Grading System API',
      description:
        `REST API for the School Grading System — a multi-role (Admin, Teacher, Student, Parent) platform for managing academic records, grading workflows, report cards with digital signatures, and analytics.

## Authentication
Most endpoints require a Bearer JWT access token obtained from \`POST /api/auth/login\`. Include it as:
\`\`\`
Authorization: Bearer <accessToken>
\`\`\`
Access tokens expire after 15 minutes; use \`POST /api/auth/refresh\` with the refresh token to obtain a new pair.

## Roles & Permissions
| Role | Access |
|------|--------|
| **ADMIN** | Full access to all endpoints |
| **TEACHER** | Grade entry for assigned classes, analytics, own profile |
| **STUDENT** | Own grades, report cards, profile |
| **PARENT** | Children's grades, report cards, profile |

## Error Format
All errors follow the envelope:
\`\`\`json
{ "error": { "code": "STRING", "message": "…", "details?": … } }
\`\`\``,
      version: '1.0.0',
      contact: { name: 'School Grading System' },
      license: { name: 'MIT' },
    },
    servers: [
      { url: `http://localhost:${port}/api`, description: 'Local development' },
      { url: '/api', description: 'Production (same origin as the frontend)' },
    ],
    tags,
    paths,
    components: {
      securitySchemes,
      schemas: {
        Error: errorSchema,
        User: userSchema,
        SessionUser: sessionUserSchema,
        StudentProfile: studentProfileSchema,
        TeacherProfile: teacherProfileSchema,
        SubjectResult: subjectResultSchema,
        Student: {
          allOf: [
            { $ref: '#/components/schemas/User' },
            {
              type: 'object',
              properties: {
                student: { $ref: '#/components/schemas/StudentProfile' },
              },
            },
          ],
        },
        StudentDetail: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            admissionNumber: { type: 'string' },
            user: { $ref: '#/components/schemas/User' },
            classRoom: { type: 'object', properties: { id: { type: 'string' }, name: { type: 'string' }, stream: { type: 'string' } } },
            parent: { type: 'object', properties: { id: { type: 'string' }, user: { type: 'object', properties: { name: { type: 'string' }, email: { type: 'string' } } } } },
            enrollments: { type: 'array', items: { type: 'object' } },
            gpaRecords: { type: 'array', items: { type: 'object' } },
            reportCards: { type: 'array', items: { type: 'object' } },
          },
        },
        Teacher: {
          allOf: [
            { $ref: '#/components/schemas/User' },
            { type: 'object', properties: { teacher: { $ref: '#/components/schemas/TeacherProfile' } } },
          ],
        },
        TeacherDetail: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            staffNumber: { type: 'string' },
            qualification: { type: 'string', nullable: true },
            user: { $ref: '#/components/schemas/User' },
            assignments: { type: 'array', items: { type: 'object' } },
            homeroomClasses: { type: 'array', items: { type: 'object' } },
          },
        },
        Parent: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            user: { $ref: '#/components/schemas/User' },
            children: { type: 'array', items: { type: 'object' } },
          },
        },
      },
    },
  } as const;
}
